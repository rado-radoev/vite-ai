import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import { chatResponseSchema, type ChatRequest, type ChatResponse } from "../../shared/chat";
import { DEFAULT_REGION } from "../../shared/model-config";

function parseReply(value: unknown): ChatResponse {
  const result = chatResponseSchema.safeParse(value);
  if (!result.success) throw new Error("Agent request failed: invalid response.");
  return result.data;
}

export async function invokeAgent(payload: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const timeout = AbortSignal.timeout(120_000);
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  if (process.env.AGENTCORE_RUNTIME_ARN) {
    const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION || DEFAULT_REGION });
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
