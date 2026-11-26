import { createServer, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { invokeChat, type InvocationOptions } from './runtime.js';
import { chatRequestSchema, MAX_REQUEST_BYTES, type ChatRequest } from '../shared/chat.js';

export type ServerOptions = InvocationOptions;

function sendJson(response: ServerResponse, status: number, body: unknown, allow?: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(allow ? { Allow: allow } : {}) });
  response.end(JSON.stringify(body));
}

export function createAgentServer(options: ServerOptions = {}): Server {
  return createServer(async (request, response) => {
    if (request.url !== '/ping' && request.url !== '/invocations') {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    const method = request.url === '/ping' ? 'GET' : 'POST';
    if (request.method !== method) {
      sendJson(response, 405, { error: 'Method not allowed' }, method);
      return;
    }
    if (request.url === '/invocations') {
      if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        sendJson(response, 415, { error: 'Content-Type must be application/json' });
        return;
      }
      if (Number(request.headers['content-length']) > MAX_REQUEST_BYTES) {
        sendJson(response, 413, { error: 'Request body too large' });
        request.resume();
        return;
      }
      let input: ChatRequest;
      try {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of request.iterator({ destroyOnReturn: false })) {
          const buffer = Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > MAX_REQUEST_BYTES) {
            sendJson(response, 413, { error: 'Request body too large' });
            request.resume();
            return;
          }
          chunks.push(buffer);
        }
        input = chatRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        sendJson(response, 400, { error: 'Invalid chat request' });
        return;
      }
      try {
        sendJson(response, 200, await invokeChat(input, options));
      } catch {
        sendJson(response, 502, { error: 'Agent invocation failed' });
      }
    } else {
      sendJson(response, 200, { status: 'Healthy' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createAgentServer().listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
}
