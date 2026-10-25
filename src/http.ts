import { createHash } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { OAuth2Client, type TokenInfo } from 'google-auth-library';
import { runWithUserCredentials } from './gcp.js';

export interface TokenPolicy {
  allowedClientIds: string[];
  acceptedScopes: string[];
  allowedEmailDomains: string[];
}

const MAX_CACHE_ENTRIES = 1000;
const MAX_CACHE_MS = 5 * 60 * 1000;

/**
 * Verifies Google OAuth access tokens forwarded by Gemini Enterprise (Authorization header).
 * The token must have been minted for an allowlisted OAuth client (azp/aud), carry an accepted
 * scope and belong to a verified email, so tokens obtained by other apps cannot be replayed here.
 */
export function createGoogleTokenVerifier(
  policy: TokenPolicy,
  tokenInfo: (token: string) => Promise<TokenInfo> = token => new OAuth2Client().getTokenInfo(token)
): OAuthTokenVerifier {
  if (policy.allowedClientIds.length === 0) {
    throw new Error('ALLOWED_OAUTH_CLIENT_IDS must list at least one OAuth client ID in HTTP mode.');
  }
  const cache = new Map<string, { auth: AuthInfo; until: number }>();

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      // Cache key is a hash: raw tokens are never kept as map keys or logged.
      const key = createHash('sha256').update(token).digest('hex');
      const cached = cache.get(key);
      if (cached && cached.until > Date.now()) return cached.auth;

      let info: TokenInfo;
      try {
        info = await tokenInfo(token);
      } catch {
        throw new InvalidTokenError('Invalid or expired access token.');
      }

      const clientId = info.azp || info.aud;
      if (!clientId || !policy.allowedClientIds.includes(clientId)) {
        throw new InvalidTokenError('Access token was not issued to an allowed OAuth client.');
      }
      if (!info.expiry_date || info.expiry_date <= Date.now()) {
        throw new InvalidTokenError('Access token expired.');
      }
      const scopes = info.scopes || [];
      if (!scopes.some(s => policy.acceptedScopes.includes(s))) {
        throw new InvalidTokenError(`Access token lacks an accepted scope (${policy.acceptedScopes.join(', ')}).`);
      }
      if (!info.email || !info.email_verified) {
        throw new InvalidTokenError('Access token has no verified email (request the "email" scope).');
      }
      const domain = info.email.split('@')[1]?.toLowerCase();
      if (policy.allowedEmailDomains.length > 0 && !policy.allowedEmailDomains.includes(domain)) {
        throw new InvalidTokenError('User email domain is not allowed.');
      }

      const auth: AuthInfo = {
        token,
        clientId,
        scopes,
        expiresAt: Math.floor(info.expiry_date / 1000),
        extra: { email: info.email }
      };
      if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
      cache.set(key, { auth, until: Math.min(info.expiry_date, Date.now() + MAX_CACHE_MS) });
      return auth;
    }
  };
}

export interface HttpServerOptions {
  createServer: () => Server;
  verifier: OAuthTokenVerifier;
  port: number;
  allowedHosts: string[];
}

/**
 * Streamable HTTP transport in stateless mode (one MCP server per request), which scales
 * horizontally on Cloud Run without sticky sessions. Every request runs inside the caller's
 * credential context, so Google API calls are made on behalf of that user.
 */
export function startHttpServer(options: HttpServerOptions): Promise<HttpServer> {
  const app = createMcpExpressApp({
    host: '0.0.0.0',
    allowedHosts: options.allowedHosts.length > 0 ? options.allowedHosts : undefined
  });

  app.get('/healthz', (_req: any, res: any) => {
    res.json({ status: 'ok' });
  });

  app.post('/mcp', requireBearerAuth({ verifier: options.verifier }), async (req: any, res: any) => {
    const server = options.createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      const principal = req.auth?.extra?.email as string | undefined;
      await runWithUserCredentials({ accessToken: req.auth.token, principal }, () => transport.handleRequest(req, res, req.body));
    } catch (error: any) {
      console.error(JSON.stringify({ severity: 'ERROR', message: 'MCP request failed', error: error?.message }));
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  const methodNotAllowed = (_req: any, res: any) => {
    res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server).' }, id: null });
  };
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return new Promise((resolve, reject) => {
    const httpServer = app.listen(options.port, () => resolve(httpServer));
    httpServer.on('error', reject);
  });
}
