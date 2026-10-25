import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleTokenVerifier } from '../../build/http.js';

const GE_CLIENT = 'ge-client.apps.googleusercontent.com';
const DE_SCOPE = 'https://www.googleapis.com/auth/discoveryengine.readwrite';
const future = () => Date.now() + 3600_000;

const verifierWith = (info, opts = {}) => {
  let calls = 0;
  const verifier = createGoogleTokenVerifier({
    allowedClientIds: [GE_CLIENT],
    acceptedScopes: [DE_SCOPE],
    allowedEmailDomains: [],
    ...opts
  }, async () => { calls++; return typeof info === 'function' ? info() : info; });
  return { verifier, calls: () => calls };
};

const validInfo = { azp: GE_CLIENT, aud: GE_CLIENT, scopes: [DE_SCOPE, 'openid'], email: 'admin@acme.com', email_verified: true, expiry_date: future() };

test('accepts a token minted for the allowed client with the required scope', async () => {
  const { verifier } = verifierWith(validInfo);
  const auth = await verifier.verifyAccessToken('tok-1');
  assert.equal(auth.clientId, GE_CLIENT);
  assert.equal(auth.extra.email, 'admin@acme.com');
  assert.ok(auth.expiresAt > Date.now() / 1000);
});

test('rejects tokens issued to another OAuth client (confused deputy)', async () => {
  const { verifier } = verifierWith({ ...validInfo, azp: 'evil.apps.googleusercontent.com', aud: 'evil.apps.googleusercontent.com' });
  await assert.rejects(verifier.verifyAccessToken('tok'), /client/);
});

test('rejects tokens without an accepted scope', async () => {
  const { verifier } = verifierWith({ ...validInfo, scopes: ['openid', 'email'] });
  await assert.rejects(verifier.verifyAccessToken('tok'), /scope/);
});

test('rejects unverified emails and disallowed domains', async () => {
  await assert.rejects(verifierWith({ ...validInfo, email_verified: false }).verifier.verifyAccessToken('a'), /email/);
  await assert.rejects(verifierWith(validInfo, { allowedEmailDomains: ['other.com'] }).verifier.verifyAccessToken('b'), /domain/);
});

test('rejects expired tokens and tokeninfo failures', async () => {
  await assert.rejects(verifierWith({ ...validInfo, expiry_date: Date.now() - 1000 }).verifier.verifyAccessToken('c'), /expired/);
  await assert.rejects(verifierWith(() => { throw new Error('invalid_token'); }).verifier.verifyAccessToken('d'), /Invalid/);
});

test('caches successful verifications per token', async () => {
  const { verifier, calls } = verifierWith(validInfo);
  await verifier.verifyAccessToken('same');
  await verifier.verifyAccessToken('same');
  assert.equal(calls(), 1);
});

test('refuses to start without an OAuth client allowlist', () => {
  assert.throws(() => createGoogleTokenVerifier({ allowedClientIds: [], acceptedScopes: [DE_SCOPE], allowedEmailDomains: [] }), /ALLOWED_OAUTH_CLIENT_IDS/);
});
