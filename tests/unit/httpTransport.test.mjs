import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { startHttpServer } from '../../build/http.js';
import { currentUserCredentials } from '../../build/gcp.js';

// In-process server whose single tool echoes the credentials bound to the request,
// proving per-request isolation of end-user tokens under concurrency.
function createEchoServer() {
  const server = new Server({ name: 'echo', version: '0.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'whoami', inputSchema: { type: 'object' } }] }));
  server.setRequestHandler(CallToolRequestSchema, async () => {
    await new Promise(r => setTimeout(r, Math.random() * 30));
    return { content: [{ type: 'text', text: currentUserCredentials()?.principal ?? 'NONE' }] };
  });
  return server;
}

const verifier = {
  async verifyAccessToken(token) {
    if (!token.startsWith('valid-')) {
      const { InvalidTokenError } = await import('@modelcontextprotocol/sdk/server/auth/errors.js');
      throw new InvalidTokenError('bad token');
    }
    return { token, clientId: 'ge', scopes: [], expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { email: token.slice(6) } };
  }
};

const httpServer = await startHttpServer({ createServer: createEchoServer, verifier, port: 0, allowedHosts: [] });
const base = `http://127.0.0.1:${httpServer.address().port}/mcp`;
after(() => httpServer.close());

const rpc = (token, body) => fetch(base, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...(token ? { authorization: `Bearer ${token}` } : {})
  },
  body: JSON.stringify(body)
});

const callWhoami = async (token, id) => {
  const res = await rpc(token, { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'whoami', arguments: {} } });
  const json = await res.json();
  return json.result.content[0].text;
};

test('rejects requests without a bearer token with 401 and WWW-Authenticate', async () => {
  const res = await rpc(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate') || '', /Bearer/);
});

test('rejects invalid tokens with 401', async () => {
  const res = await rpc('forged', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(res.status, 401);
});

test('serves tools/list statelessly with a valid token', async () => {
  const res = await rpc('valid-a@acme.com', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).result.tools[0].name, 'whoami');
});

test('binds each request to its own user credentials under concurrency', async () => {
  const users = Array.from({ length: 20 }, (_, i) => `user${i}@acme.com`);
  const answers = await Promise.all(users.map((u, i) => callWhoami(`valid-${u}`, i + 10)));
  assert.deepEqual(answers, users);
});

test('GET and DELETE on /mcp are not allowed in stateless mode', async () => {
  const res = await fetch(base, { method: 'GET', headers: { authorization: 'Bearer valid-x@acme.com' } });
  assert.equal(res.status, 405);
});

test('health endpoint does not require auth and leaks nothing', async () => {
  const res = await fetch(base.replace('/mcp', '/healthz'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});
