import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import { z } from "zod";
import type { ChatRequest } from "../../shared/chat";

const replySchema = z.object({ reply: z.string().trim().min(1) });

function parseReply(value: unknown): { reply: string } {
  const result = replySchema.safeParse(value);
  if (!result.success) throw new Error("Agent request failed: invalid response.");
  return result.data;
}

export async function invokeAgent(payload: ChatRequest, signal?: AbortSignal): Promise<{ reply: string }> {
  const timeout = AbortSignal.timeout(120_000);
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  if (process.env.AGENTCORE_RUNTIME_ARN) {
    const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION || "us-east-1" });
    try {
      const response = await client.send(new InvokeAgentRuntimeCommand({
        agentRuntimeArn: process.env.AGENTCORE_RUNTIME_ARN,
        runtimeSessionId: payload.sessionId,
        qualifier: "DEFAULT",
        contentType: "application/json",
        accept: "application/json",
        payload: Buffer.from(JSON.stringify(payload)),
      }), { abortSignal });
      if (response.statusCode !== 200 || !response.response) throw new Error("Agent request failed.");
      return parseReply(JSON.parse(await response.response.transformToString()));
    } finally {
      client.destroy();
    }
  }
  const baseUrl = process.env.AGENT_LOCAL_URL || "http://127.0.0.1:8080";
  const response = await fetch(new URL("/invocations", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal: abortSignal,
  });
  if (!response.ok) throw new Error("Agent request failed.");
  return parseReply(await response.json());
}
