import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

const sessionId = '123e4567-e89b-42d3-a456-426614174000';
const request = { messages: [{ role: 'user' as const, content: 'Hello' }], sessionId };

const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

async function serve(options: import('../agent/server').ServerOptions = {}) {
  const { createAgentServer } = await import('../agent/server');
  const server = createAgentServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
  return `http://127.0.0.1:${address.port}`;
}

describe('shared chat contract', () => {
  it('accepts a UUID session and a user message without changing content', async () => {
    const { chatRequestSchema } = await import('../shared/chat');
    expect(chatRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    { ...request, messages: [] },
    { ...request, messages: [{ role: 'user', content: '' }] },
    { ...request, messages: [{ role: 'user', content: '   ' }] },
    { ...request, messages: [{ role: 'user', content: 'x'.repeat(8_001) }] },
    { ...request, messages: Array.from({ length: 32 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' })) },
    { ...request, messages: [{ role: 'assistant', content: 'Hello' }] },
    { ...request, messages: [request.messages[0], request.messages[0]] },
    { ...request, messages: [request.messages[0], { role: 'assistant', content: 'Hi' }] },
    { ...request, sessionId: 'not-a-uuid-but-at-least-36-characters-long' },
    { ...request, unexpected: 'reject' },
    { ...request, messages: [{ role: 'user', content: 'Hello', unexpected: 'reject' }] },
  ])('rejects malformed or unbounded histories: %#', async (invalid) => {
    const { chatRequestSchema } = await import('../shared/chat');
    expect(chatRequestSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts the bounded alternating full history and preserves whitespace', async () => {
    const { chatRequestSchema } = await import('../shared/chat');
    const bounded = { ...request, messages: Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: ' x '.padEnd(8_000, ' ') })) };
    expect(chatRequestSchema.parse(bounded)).toEqual(bounded);
  });
});

describe('Strands invocation', () => {
  it('extracts model text blocks in order from the actual SDK Message', async () => {
    const { extractReply } = await import('../agent/runtime');
    const { Message, TextBlock } = await import('@strands-agents/sdk');
    expect(extractReply(new Message({ role: 'assistant', content: [new TextBlock('First '), new TextBlock('second')] }))).toBe('First second');
    expect(() => extractReply(new Message({ role: 'assistant', content: [] }))).toThrow('Model returned no text');
  });

  it('constructs a fresh real Strands Agent with a configured BedrockModel and no tools', async () => {
    const { createChatAgent } = await import('../agent/runtime');
    const { Agent } = await import('@strands-agents/sdk');
    const { BedrockModel } = await import('@strands-agents/sdk/models/bedrock');
    const config = { region: 'us-east-1', modelId: 'amazon.nova-lite-v1:0' };
    const seed = [{ role: 'user' as const, content: [{ text: 'Earlier prompt' }] }];
    const agent = createChatAgent(seed, config);
    expect(agent).toBeInstanceOf(Agent);
    expect(agent.model).toBeInstanceOf(BedrockModel);
    expect(agent.model.getConfig()).toMatchObject({ modelId: config.modelId, maxTokens: 1_024, stream: false });
    expect(agent.messages[0].toJSON()).toMatchObject(seed[0]);
    expect(createChatAgent([], config)).not.toBe(agent);
    expect(createChatAgent([], config).messages).toHaveLength(0);
  });

  it('maps only prior history and invokes the final user prompt with Bedrock defaults', async () => {
    const { invokeChat } = await import('../agent/runtime');
    const invoke = vi.fn().mockResolvedValue('Here is the answer');
    const history = { ...request, messages: [request.messages[0], { role: 'assistant' as const, content: 'Hi' }, { role: 'user' as const, content: 'Follow up' }] };
    expect(await invokeChat(history, { invoke, env: {} })).toEqual({ reply: 'Here is the answer' });
    expect(invoke).toHaveBeenCalledWith([
      { role: 'user', content: [{ text: 'Hello' }] },
      { role: 'assistant', content: [{ text: 'Hi' }] },
    ], 'Follow up', { region: 'us-east-1', modelId: 'amazon.nova-lite-v1:0' });
    expect(history.messages).toHaveLength(3);
  });

  it('rejects empty model replies instead of reporting success', async () => {
    const { invokeChat } = await import('../agent/runtime');
    await expect(invokeChat(request, { invoke: async () => '   ', env: {} })).rejects.toThrow('Model returned no text');
  });
});

describe('AgentCore HTTP contract', () => {
  it('serves the credential-free health endpoint', async () => {
    const base = await serve();
    const response = await fetch(`${base}/ping`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ status: 'Healthy' });
  });

  it('returns one complete JSON reply using per-request history and configured model', async () => {
    const invoke = vi.fn().mockResolvedValue('Answer');
    const base = await serve({ invoke, env: { AWS_REGION: 'us-west-2', BEDROCK_MODEL_ID: 'amazon.nova-micro-v1:0' } });
    const response = await fetch(`${base}/invocations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: 'Answer' });
    expect(invoke).toHaveBeenCalledWith([], 'Hello', { region: 'us-west-2', modelId: 'amazon.nova-micro-v1:0' });
    const second = await fetch(`${base}/invocations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    expect(second.status).toBe(200);
    expect(invoke.mock.calls[1][0]).toEqual([]);
  });

  it.each([
    ['/missing', 'GET', 404, null],
    ['/ping', 'POST', 405, 'GET'],
    ['/invocations', 'PUT', 405, 'POST'],
  ])('rejects unsupported route or method %s %s', async (path, method, status, allow) => {
    const invoke = vi.fn().mockResolvedValue('Do not invoke');
    const base = await serve({ invoke });
    const response = await fetch(`${base}${path}`, { method, ...(method === 'PUT' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) } : {}) });
    expect(response.status).toBe(status);
    expect(response.headers.get('allow')).toBe(allow);
    expect(await response.json()).toEqual({ error: status === 404 ? 'Not found' : 'Method not allowed' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('requires JSON content type before invoking the model', async () => {
    const invoke = vi.fn().mockResolvedValue('Do not invoke');
    const base = await serve({ invoke });
    const response = await fetch(`${base}/invocations`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(request) });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'Content-Type must be application/json' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['{ invalid JSON with private prompt', JSON.stringify({ ...request, messages: [] })])('rejects malformed payloads without echoing input', async (body) => {
    const invoke = vi.fn().mockResolvedValue('Do not invoke');
    const base = await serve({ invoke });
    const response = await fetch(`${base}/invocations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(1_000) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid chat request' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('contains provider errors without logging or disclosing secrets', async () => {
    const logger = vi.spyOn(console, 'error');
    const base = await serve({ invoke: async () => { throw new Error('SECRET_KEY private prompt'); } });
    const response = await fetch(`${base}/invocations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(1_000) });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Agent invocation failed' });
    expect(logger).not.toHaveBeenCalled();
    expect((await fetch(`${base}/ping`)).status).toBe(200);
  });

  it('rejects oversized bodies before calling Bedrock', async () => {
    const { MAX_REQUEST_BYTES } = await import('../shared/chat');
    const invoke = vi.fn().mockResolvedValue('Do not invoke');
    const base = await serve({ invoke });
    const response = await fetch(`${base}/invocations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(MAX_REQUEST_BYTES + 1) });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Request body too large' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('enforces the byte limit for chunked bodies as well as Content-Length', async () => {
    const { MAX_REQUEST_BYTES } = await import('../shared/chat');
    const { request: httpRequest } = await import('node:http');
    const invoke = vi.fn().mockResolvedValue('Do not invoke');
    const base = await serve({ invoke });
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(`${base}/invocations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      });
      req.on('error', reject);
      req.write(' '.repeat(MAX_REQUEST_BYTES));
      req.end(' ');
    });
    expect(result.status).toBe(413);
    expect(JSON.parse(result.body)).toEqual({ error: 'Request body too large' });
    expect(invoke).not.toHaveBeenCalled();
  });
});
