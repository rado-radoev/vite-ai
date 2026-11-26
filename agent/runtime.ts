import { Agent, type Message, type MessageData } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { chatRequestSchema, type ChatResponse } from '../shared/chat.js';

export const DEFAULT_MODEL_ID = 'amazon.nova-lite-v1:0';
export const DEFAULT_REGION = 'us-east-1';

export interface ModelConfig {
  region: string;
  modelId: string;
}

export type ModelInvocation = (history: MessageData[], prompt: string, config: ModelConfig) => Promise<string>;
export interface InvocationOptions {
  invoke?: ModelInvocation;
  env?: { AWS_REGION?: string; BEDROCK_MODEL_ID?: string };
}

export function createChatAgent(history: MessageData[], config: ModelConfig): Agent {
  return new Agent({
    model: new BedrockModel({ ...config, maxTokens: 1_024 }),
    messages: history,
    tools: [],
    printer: false,
    contextManager: false,
  });
}

export function extractReply(message: Message): string {
  const reply = message.content.filter((block) => block.type === 'textBlock').map((block) => block.text).join('');
  if (!reply.trim()) throw new Error('Model returned no text');
  return reply;
}

export async function invokeChat(input: unknown, options: InvocationOptions = {}): Promise<ChatResponse> {
  const request = chatRequestSchema.parse(input);
  const env = options.env ?? process.env;
  const config = { region: env.AWS_REGION ?? DEFAULT_REGION, modelId: env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID };
  const history: MessageData[] = request.messages.slice(0, -1).map(({ role, content }) => ({ role, content: [{ text: content }] }));
  const prompt = request.messages[request.messages.length - 1].content;
  const reply = options.invoke
    ? await options.invoke(history, prompt, config)
    : extractReply((await createChatAgent(history, config).invoke(prompt)).lastMessage);
  if (!reply.trim()) throw new Error('Model returned no text');
  return { reply };
}
