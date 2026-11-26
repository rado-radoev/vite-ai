import { Agent, type Message, type MessageData } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { chatRequestSchema, chatResponseSchema, type ChatResponse } from '../shared/chat.ts';
import { resolveModelConfig, type ModelConfig, type ModelEnvironment } from '../shared/model-config.ts';

export { DEFAULT_MODEL_ID, DEFAULT_REGION } from '../shared/model-config.ts';
export type { ModelConfig } from '../shared/model-config.ts';

export type ModelInvocation = (history: MessageData[], prompt: string, config: ModelConfig) => Promise<string>;

export interface InvocationOptions {
  invoke?: ModelInvocation;
  env?: ModelEnvironment;
}

export function createChatAgent(history: MessageData[], config: ModelConfig): Agent {
  return new Agent({
    model: new BedrockModel({ ...config, maxTokens: 1_024, stream: false }),
    messages: history,
    tools: [],
    printer: false,
    contextManager: false,
  });
}

function parseReply(reply: string): ChatResponse {
  const response = chatResponseSchema.safeParse({ reply });
  if (!response.success) throw new Error('Model returned no text');
  return response.data;
}

export function extractReply(message: Message): string {
  const reply = message.content
    .filter((block) => block.type === 'textBlock')
    .map((block) => block.text)
    .join('');
  return parseReply(reply).reply;
}

export async function invokeChat(input: unknown, options: InvocationOptions = {}): Promise<ChatResponse> {
  const { messages } = chatRequestSchema.parse(input);
  const config = resolveModelConfig(options.env);
  const history: MessageData[] = messages.slice(0, -1).map(({ role, content }) => ({
    role,
    content: [{ text: content }],
  }));
  const prompt = messages[messages.length - 1].content;
  const reply = options.invoke
    ? await options.invoke(history, prompt, config)
    : extractReply((await createChatAgent(history, config).invoke(prompt)).lastMessage);
  return parseReply(reply);
}
