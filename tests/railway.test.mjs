import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuration, createApplication } from '../server/index.mjs';
import { SqliteBucket } from '../server/storage.mjs';

const token = randomBytes(32).toString('hex');
const key = randomBytes(32).toString('hex');
function config(dataDir) {
  return configuration({ APP_AUTH_TOKEN: token, MANAGER_TOKEN_ENCRYPTION_KEY: key, MANAGER_API_BASE: 'https://manager.test/api2', DATA_DIR: dataDir, PORT: '0' });
}
async function start(settings) {
  const app = createApplication(settings);
  await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  settings.origin = `http://127.0.0.1:${app.server.address().port}`;
  return { ...app, origin: settings.origin };
}
const bearer = { Authorization: `Bearer ${token}` };
const basic = { Authorization: `Basic ${Buffer.from(`admin:${token}`).toString('base64')}` };
const rpc = (origin, method, args = {}) => fetch(`${origin}/mcp`, {
  method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: args }),
});

test('startup fails closed for missing secrets, insecure Railway origin and ephemeral storage', () => {
  assert.throws(() => configuration({}), /APP_AUTH_TOKEN/);
  assert.throws(() => configuration({ APP_AUTH_TOKEN: token }), /ENCRYPTION_KEY/);
  const env = { APP_AUTH_TOKEN: token, MANAGER_TOKEN_ENCRYPTION_KEY: key, MANAGER_API_BASE: 'https://manager.test/api2', RAILWAY_ENVIRONMENT_ID: 'test', PUBLIC_URL: 'https://books.example' };
  assert.throws(() => configuration(env), /volume/);
  assert.throws(() => configuration({ ...env, RAILWAY_VOLUME_MOUNT_PATH: '/data', DATA_DIR: '/other' }), /inside/);
  assert.throws(() => configuration({ ...env, PUBLIC_URL: 'http://books.example' }), /HTTPS/);
  assert.throws(() => configuration({ ...env, PUBLIC_URL: 'https://books.example/path' }), /origin/);
  assert.equal(configuration({ ...env, RAILWAY_VOLUME_MOUNT_PATH: '/data' }).origin, 'https://books.example');
});

test('SQLite CAS works across database handles and survives restart without lost updates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'managerio-storage-'));
  const file = join(dir, 'db.sqlite');
  const first = new SqliteBucket(file), second = new SqliteBucket(file);
  try {
    const initial = await first.put('tasks/one', '{"value":1}', { onlyIf: { etagDoesNotMatch: '*' } });
    assert(initial.etag);
    assert.equal(await second.put('tasks/one', '{}', { onlyIf: { etagDoesNotMatch: '*' } }), null);
    const attempts = await Promise.all([first.put('tasks/one', '{"value":2}', { onlyIf: { etagMatches: initial.etag } }), second.put('tasks/one', '{"value":3}', { onlyIf: { etagMatches: initial.etag } })]);
    assert.equal(attempts.filter(Boolean).length, 1);
    const previous = await first.get('tasks/one');
    await second.put('tasks/one', '{"value":4}');
    assert.deepEqual(await previous.json(), { value: 2 });
    await first.put('tasks/two', '{}');
    await first.put('other/one', '{}');
    const page = await first.list({ prefix: 'tasks/', limit: 1 });
    assert.equal(page.truncated, true);
    assert.equal((await second.list({ prefix: 'tasks/', cursor: page.cursor })).objects[0].key, 'tasks/two');
    await assert.rejects(first.list({ prefix: 'other/', cursor: page.cursor }), /cursor/);
    first.assertEncryptionKey(key);
    assert.throws(() => second.assertEncryptionKey('a'.repeat(64)), /stored database key/);
  } finally { first.close(); second.close(); }
  const reopened = new SqliteBucket(file);
  try { assert.deepEqual(await (await reopened.get('tasks/one')).json(), { value: 4 }); }
  finally { reopened.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('HTTP authentication, spoofed identity, CSRF, stateless MCP and health checks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'managerio-http-'));
  const app = await start(config(dir));
  try {
    assert.equal((await fetch(`${app.origin}/healthz`)).status, 200);
    const denied = await fetch(`${app.origin}/api/connections`, { headers: { 'oai-authenticated-user-id': 'railway-owner' } });
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get('www-authenticate'), /Basic/);
    assert.equal((await fetch(`${app.origin}/`, { headers: basic })).status, 200);
    const namespace = (await import('node:crypto')).createHash('sha256').update('victim').digest('hex');
    await app.bucket.put(`preferences/${namespace}.json`, '{"id":"private"}');
    const listing = await fetch(`${app.origin}/api/connections`, { headers: { ...bearer, 'oai-authenticated-user-id': 'victim' } });
    assert.deepEqual(await listing.json(), { connections: [], preferred_connection_id: null });
    assert.equal((await fetch(`${app.origin}/api/preferred`, { method: 'POST', headers: { ...basic, Origin: 'https://evil.example' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${app.origin}/api/preferred`, { method: 'POST', headers: basic, body: '{}' })).status, 403);
    assert.equal((await fetch(`${app.origin}/mcp`, { method: 'POST', headers: { ...bearer, Origin: 'https://evil.example' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${app.origin}/mcp`, { headers: bearer })).status, 405);
    const init = await (await rpc(app.origin, 'initialize', { protocolVersion: '2025-06-18' })).json();
    assert.equal(init.result.protocolVersion, '2025-06-18');
    const tools = await (await rpc(app.origin, 'tools/list')).json();
    assert(tools.result.tools.some(tool => tool.name === 'list_connections'));
    const result = await (await rpc(app.origin, 'tools/call', { name: 'list_connections', arguments: {} })).json();
    assert.equal(result.result.isError, false);
    const notice = await fetch(`${app.origin}/mcp`, { method: 'POST', headers: bearer, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    assert.equal(notice.status, 202);
    assert.equal((await fetch(`${app.origin}/api/status`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  } finally { await app.shutdown(); rmSync(dir, { recursive: true, force: true }); }
});

test('company tokens stay encrypted on disk and connections persist after service restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'managerio-persistence-'));
  const realFetch = globalThis.fetch;
  let app;
  try {
    globalThis.fetch = (url, options) => {
      if (String(url).startsWith('https://manager.test/api2/')) return Promise.resolve(Response.json({ business: { name: 'Test Company' }, totalRecords: 0, chartOfAccounts: [] }));
      if (!String(url).startsWith('http://127.0.0.1:')) throw new Error('Unexpected outbound request in test');
      return realFetch(url, options);
    };
    app = await start(config(dir));
    const secret = 'test-manager-secret-with-no-uuid';
    const added = await realFetch(`${app.origin}/api/connections`, { method: 'POST', headers: { ...basic, Origin: app.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: secret }) });
    assert.equal(added.status, 200);
    const connection = (await added.json()).connection;
    assert.equal(connection.business_name, 'Test Company');
    const response = await realFetch(`${app.origin}/api/connections`, { headers: bearer });
    assert(!(await response.text()).includes(secret));
    await app.shutdown(); app = null;
    assert(!readFileSync(join(dir, 'managerio.sqlite')).includes(Buffer.from(secret)));
    app = await start(config(dir));
    const saved = await (await realFetch(`${app.origin}/api/connections`, { headers: bearer })).json();
    assert.equal(saved.connections[0].connection_id, connection.connection_id);
  } finally { globalThis.fetch = realFetch; if (app) await app.shutdown(); rmSync(dir, { recursive: true, force: true }); }
});
