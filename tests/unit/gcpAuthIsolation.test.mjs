import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('HTTP mode fails closed in both REST and GAPIC helpers when no user token is bound', async () => {
  const script = `
    import assert from 'node:assert/strict';
    import { getAuthHeaders, gapicClientOptions, runWithUserCredentials } from './build/gcp.js';

    await assert.rejects(() => getAuthHeaders('proj-1'), /Unauthenticated/);
    assert.throws(() => gapicClientOptions('proj-1', 'global'), /Unauthenticated/);

    await runWithUserCredentials({ accessToken: 'tok-user-a', principal: 'alice@acme.com' }, async () => {
      const headers = await getAuthHeaders('proj-1');
      assert.equal(headers.authorization, 'Bearer tok-user-a');
      assert.equal(headers['x-goog-user-project'], 'proj-1');

      const opts = gapicClientOptions('proj-1', 'eu');
      assert.equal(opts.apiEndpoint, 'eu-discoveryengine.googleapis.com');
      assert.ok(opts.auth, 'GAPIC client must receive explicit per-user auth instance');
      const gaxHeaders = await opts.auth.getRequestHeaders();
      const authVal = typeof gaxHeaders.get === 'function' ? gaxHeaders.get('authorization') : (gaxHeaders.Authorization || gaxHeaders.authorization);
      assert.equal(authVal, 'Bearer tok-user-a');
    });
  `;
  await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, MCP_TRANSPORT: 'http', GCP_PROJECT: 'proj-1' }
  });
});
