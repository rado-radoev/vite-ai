import { createServer } from "node:http";
import { Readable } from "node:stream";
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import { afterEach, expect, test, vi } from "vitest";
import { invokeAgent } from "../app/lib/agent.server";

const payload = {
  sessionId: "fe85a2bc-7be0-4259-991c-5b35f526e11e",
  messages: [{ role: "user" as const, content: "Hello" }],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("local transport sends the chat payload to /invocations", async () => {
  vi.stubEnv("AGENTCORE_RUNTIME_ARN", "");
  let received: unknown;
  const server = createServer(async (request, response) => {
    expect(request.url).toBe("/invocations");
    expect(request.method).toBe("POST");
    let body = "";
    for await (const chunk of request) body += chunk;
    received = JSON.parse(body);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ reply: "test fixture" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing address");
  vi.stubEnv("AGENT_LOCAL_URL", `http://127.0.0.1:${address.port}`);
  try {
    await expect(invokeAgent(payload)).resolves.toEqual({ reply: "test fixture" });
    expect(received).toEqual(payload);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("AgentCore transport sends the same history with a stable runtime session id", async () => {
  vi.stubEnv("AGENTCORE_RUNTIME_ARN", "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/test_runtime");
  vi.stubEnv("AGENT_LOCAL_URL", "http://127.0.0.1:1");
  const body = Object.assign(Readable.from(['{"reply":"cloud test fixture"}']), {
    transformToString: async () => '{"reply":"cloud test fixture"}',
  });
  const send = vi.spyOn(BedrockAgentCoreClient.prototype, "send").mockImplementation((async () => ({
    contentType: "application/json", statusCode: 200, response: body,
  })) as unknown as typeof BedrockAgentCoreClient.prototype.send);
  await expect(invokeAgent(payload)).resolves.toEqual({ reply: "cloud test fixture" });
  const command = send.mock.calls[0][0] as InvokeAgentRuntimeCommand;
  expect(command).toBeInstanceOf(InvokeAgentRuntimeCommand);
  expect(command.input).toMatchObject({
    agentRuntimeArn: process.env.AGENTCORE_RUNTIME_ARN,
    runtimeSessionId: payload.sessionId,
    contentType: "application/json",
    accept: "application/json",
    qualifier: "DEFAULT",
  });
  expect(command.input.payload).toEqual(Buffer.from(JSON.stringify(payload)));
});

test.each([
  [503, '{"error":"private provider details"}'],
  [200, '{"reply":42}'],
  [200, '{"reply":""}'],
])("local transport rejects invalid upstream responses (%s)", async (status, body) => {
  vi.stubEnv("AGENTCORE_RUNTIME_ARN", "");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status }));
  await expect(invokeAgent(payload)).rejects.toThrow("Agent request failed");
});

test("AgentCore transport rejects failed status codes", async () => {
  vi.stubEnv("AGENTCORE_RUNTIME_ARN", "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/test_runtime");
  vi.spyOn(BedrockAgentCoreClient.prototype, "send").mockImplementation((async () => ({
    contentType: "application/json", statusCode: 500,
    response: { transformToString: async () => '{"reply":"not a valid success"}' },
  })) as unknown as typeof BedrockAgentCoreClient.prototype.send);
  await expect(invokeAgent(payload)).rejects.toThrow("Agent request failed");
});
