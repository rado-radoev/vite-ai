import { randomUUID } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { action } from "../app/routes/api.chat";
import { invokeAgent } from "../app/lib/agent.server";
import { MAX_REQUEST_BYTES } from "../shared/chat";

vi.mock("../app/lib/agent.server", () => ({ invokeAgent: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const valid = { sessionId: randomUUID(), messages: [{ role: "user", content: "Hello" }] };
const args = (body: unknown) => ({
  request: new Request("http://localhost/api/chat", {
    method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  url: new URL("http://localhost/api/chat"), pattern: "/api/chat",
  params: {}, context: new RouterContextProvider(),
});

test("API action forwards validated history and returns a non-cacheable reply", async () => {
  vi.mocked(invokeAgent).mockResolvedValue({ reply: "test fixture" });
  const input = args(valid);
  const response = await action(input);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ reply: "test fixture" });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(invokeAgent).toHaveBeenCalledWith(valid, input.request.signal);
});

test("API action masks provider failures", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(invokeAgent).mockRejectedValue(new Error("private provider detail"));
  const response = await action(args(valid));
  expect(response.status).toBe(502);
  const body = await response.text();
  expect(body).not.toContain("private provider detail");
  expect(body).toContain("unavailable");
  vi.restoreAllMocks();
});

test("invalid history never invokes a model", async () => {
  expect((await action(args({ ...valid, messages: [] }))).status).toBe(400);
  expect(invokeAgent).not.toHaveBeenCalled();
});

test("API action rejects an oversized streamed body without Content-Length", async () => {
  const input = args(valid);
  const oversized = new TextEncoder().encode("x".repeat(MAX_REQUEST_BYTES + 1));
  // Node requires duplex for streaming requests; the browser RequestInit
  // definition does not include it yet. A checked variable keeps it typed.
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: input.request.headers,
    body: new ReadableStream({ start(controller) { controller.enqueue(oversized); controller.close(); } }),
    duplex: "half",
  };
  const request = new Request(input.request.url, init);
  expect(request.headers.has("Content-Length")).toBe(false);
  const response = await action({ ...input, request });
  expect(response.status).toBe(413);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "The message history is too large. Start a new chat." });
  expect(invokeAgent).not.toHaveBeenCalled();
});
