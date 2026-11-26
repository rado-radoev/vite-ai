import { expect, test } from "@playwright/test";

// These browser tests mock only /api/chat. They exercise the real UI without
// AWS credentials or a running model; production never uses a mock provider.
test("sends a message and displays a plain-text reply", async ({ page }) => {
  const requests: Array<{ messages: { role: string; content: string }[]; sessionId: string }> = [];
  await page.route("**/api/chat", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { reply: "Hello from Strands.\n<img src=x onerror=alert(1)>" } });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "vite-ai", exact: true })).toBeVisible();
  await expect(page.getByText("Strands + AgentCore", { exact: true })).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill("Hello\nfrom the browser");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const conversation = page.getByRole("log", { name: "Conversation" });
  await expect(conversation.getByText("Hello\nfrom the browser", { exact: true })).toBeVisible();
  const reply = conversation.getByText("Hello from Strands.\n<img src=x onerror=alert(1)>", { exact: true });
  await expect(reply).toBeVisible();
  await expect(reply).toHaveCSS("white-space", "pre-wrap");
  await expect(conversation.locator("img")).toHaveCount(0);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  expect(requests).toHaveLength(1);
  expect(requests[0].messages).toEqual([{ role: "user", content: "Hello\nfrom the browser" }]);
  expect(requests[0].sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("disables empty sends and locks the composer while awaiting a reply", async ({ page }) => {
  let complete!: () => void;
  const ready = new Promise<void>((resolve) => { complete = resolve; });
  await page.route("**/api/chat", async (route) => {
    await ready;
    await route.fulfill({ json: { reply: "Ready." } });
  });

  await page.goto("/");
  const input = page.getByLabel("Message", { exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  await input.fill("   ");
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Explain how this app works" }).click();
  await expect(input).toHaveValue("Explain how this app works");
  await send.click();
  await expect(page.getByRole("status")).toHaveText("Thinking…");
  await expect(input).toBeDisabled();
  await expect(send).toBeDisabled();
  await expect(page.getByRole("button", { name: "New chat" })).toBeDisabled();
  complete();
  await expect(page.getByRole("log").getByText("Ready.", { exact: true })).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(send).toBeDisabled();
});

test("restores a failed message for retry without duplicating history", async ({ page }) => {
  const requests: Array<{ messages: { role: string; content: string }[]; sessionId: string }> = [];
  await page.route("**/api/chat", async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 2) {
      await route.fulfill({ status: 502, json: { error: "The agent is unavailable. Please try again." } });
    } else {
      await route.fulfill({ json: { reply: requests.length === 1 ? "First reply" : "Retry reply" } });
    }
  });

  await page.goto("/");
  const input = page.getByLabel("Message", { exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await input.fill("First message");
  await send.click();
  await expect(page.getByRole("log").getByText("First reply", { exact: true })).toBeVisible();
  await input.fill("Try this message");
  await send.click();
  await expect(page.getByRole("alert")).toHaveText("The agent is unavailable. Please try again.");
  await expect(input).toHaveValue("Try this message");
  await expect(page.getByRole("log").getByText("Try this message", { exact: true })).toHaveCount(0);
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("log").getByText("Retry reply", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("log").getByText("Try this message", { exact: true })).toHaveCount(1);
  expect(requests).toHaveLength(3);
  expect(requests[2]).toEqual(requests[1]);
  expect(requests[2].messages).toEqual([
    { role: "user", content: "First message" },
    { role: "assistant", content: "First reply" },
    { role: "user", content: "Try this message" },
  ]);
});

test("starts a new chat with empty history and a new session", async ({ page }) => {
  const requests: Array<{ messages: { role: string; content: string }[]; sessionId: string }> = [];
  await page.route("**/api/chat", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { reply: "A reply" } });
  });

  await page.goto("/");
  const input = page.getByLabel("Message", { exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await input.fill("Before reset");
  await send.click();
  await expect(page.getByRole("log").getByText("A reply", { exact: true })).toBeVisible();
  await input.fill("An unsent draft");
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(input).toHaveValue("");
  await expect(send).toBeDisabled();
  await expect(page.getByRole("log")).toBeEmpty();
  await expect(page.getByRole("heading", { name: "Start a conversation" })).toBeVisible();
  await input.fill("After reset");
  await send.click();
  await expect(page.getByRole("log").getByText("A reply", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].sessionId).not.toBe(requests[0].sessionId);
  expect(requests[1].messages).toEqual([{ role: "user", content: "After reset" }]);
});

test("keeps the composer at the bottom of the chat panel", async ({ page }) => {
  await page.goto("/");
  const panel = await page.locator('[data-slot="card"]').boundingBox();
  const send = await page.getByRole("button", { name: "Send", exact: true }).boundingBox();
  expect(panel).not.toBeNull();
  expect(send).not.toBeNull();
  expect(panel!.y + panel!.height - (send!.y + send!.height)).toBeLessThanOrEqual(32);
});

// Unlike the UI cases above, this hits the real resource route. Invalid
// requests must be rejected before any local/AWS agent invocation.
test("rejects unsafe or invalid API requests before reaching the agent", async ({ request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const valid = { sessionId: "00000000-0000-4000-8000-000000000000", messages: [{ role: "user", content: "Hello" }] };
  expect((await request.get("/api/chat")).status()).toBe(405);
  expect((await request.post("/api/chat", { data: valid })).status()).toBe(403);
  expect((await request.post("/api/chat", { headers: { Origin: "https://other.example" }, data: valid })).status()).toBe(403);
  expect((await request.put("/api/chat", { headers: { Origin: origin }, data: valid })).status()).toBe(405);
  expect((await request.post("/api/chat", { headers: { Origin: origin, "Content-Type": "text/plain" }, data: "hello" })).status()).toBe(415);
  expect((await request.post("/api/chat", { headers: { Origin: origin, "Content-Type": "application/json" }, data: "{" })).status()).toBe(400);
  expect((await request.post("/api/chat", { headers: { Origin: origin }, data: { ...valid, messages: [] } })).status()).toBe(400);
  expect((await request.post("/api/chat", { headers: { Origin: origin }, data: { ...valid, extra: "not allowed" } })).status()).toBe(400);
  expect((await request.post("/api/chat", { headers: { Origin: origin, "Content-Type": "application/json" }, data: "x".repeat(131_073) })).status()).toBe(413);
});
