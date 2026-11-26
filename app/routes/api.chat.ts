import type { ActionFunctionArgs } from "react-router";
import { invokeAgent } from "~/lib/agent.server";
import { chatRequestSchema } from "../../shared/chat";

const MAX_BODY_BYTES = 128 * 1024;

function errorResponse(error: string, status: number) {
  return Response.json({ error }, {
    status,
    headers: { "Cache-Control": "no-store", ...(status === 405 ? { Allow: "POST" } : {}) },
  });
}

export function loader() {
  return errorResponse("Use POST to send a message.", 405);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return loader();
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return errorResponse("Only same-origin requests are allowed.", 403);
  }
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return errorResponse("Send an application/json request.", 415);
  }
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
    return errorResponse("The message history is too large. Start a new chat.", 413);
  }

  // Count bytes while reading, rather than buffering an unlimited body first.
  const reader = request.body?.getReader();
  if (!reader) return errorResponse("Send a valid JSON request.", 400);
  let body = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return errorResponse("The message history is too large. Start a new chat.", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch {
    return errorResponse("Couldn't read your message. Please try again.", 400);
  } finally {
    reader.releaseLock();
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return errorResponse("Send a valid JSON request.", 400);
  }
  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse("Invalid message history. Check your message or start a new chat.", 400);
  }

  try {
    const result = await invokeAgent(parsed.data, request.signal);
    if (typeof result?.reply !== "string" || !result.reply.trim()) {
      return errorResponse("The agent returned an empty reply. Please try again.", 502);
    }
    return Response.json({ reply: result.reply }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Never expose provider details, credentials, or message contents.
    console.error("Agent invocation failed:", error instanceof Error ? error.name : "UnknownError");
    return errorResponse("The agent is unavailable. Please try again.", 502);
  }
}
