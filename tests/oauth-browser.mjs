// Real browser navigation is essential: fetch() does not reproduce form
// Origin:null behavior under Referrer-Policy:no-referrer or CSP redirects.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApplication, configuration } from '../server/index.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir = mkdtempSync(join(tmpdir(), 'evertrust-browser-'));
const password = randomBytes(32).toString('hex');
const config = configuration({ APP_AUTH_TOKEN: password, MANAGER_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'), MANAGER_API_BASE: 'https://manager.example/api2', DATA_DIR: dir, PORT: '0' });
const app = createApplication(config);
let browser;
try {
  await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  config.origin = `http://127.0.0.1:${app.server.address().port}`;
  let postedOrigin;
  app.server.prependListener('request', req => { if (req.method === 'POST' && req.url === '/oauth/authorize') postedOrigin = req.headers.origin; });
  const client = await (await fetch(config.origin + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Browser regression', redirect_uris: ['https://callback.example/return'] }) })).json();
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), resource: config.origin + '/mcp', state: 'browser-state' });
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage();
  let callback;
  await page.route('https://callback.example/**', async route => { callback = route.request(); await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Authorized callback reached' }); });
  const authorizationPage = await page.goto(config.origin + '/oauth/authorize?' + query);
  assert.equal(authorizationPage.headers()['referrer-policy'], 'same-origin');
  await page.getByLabel('Service owner password').fill(password);
  const posted = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/oauth/authorize'));
  await page.getByRole('button', { name: 'Authorize connection', exact: true }).click();
  const response = await posted;
  assert.equal(response.status(), 303);
  assert.equal(postedOrigin, config.origin);
  await page.waitForURL('https://callback.example/**');
  assert(callback);
  assert.equal(callback.headers().referer, undefined);
  assert.equal(response.headers()['referrer-policy'], 'no-referrer');
  const returned = new URL(callback.url());
  assert.equal(returned.searchParams.get('state'), 'browser-state');
  const exchanged = await fetch(config.origin + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.client_id, grant_type: 'authorization_code', code: returned.searchParams.get('code'), code_verifier: verifier, redirect_uri: client.redirect_uris[0] }) });
  assert.equal(exchanged.status, 200);
  console.log('PASS browser OAuth: real form Origin, cookie, consent, registered cross-origin callback, no referrer leakage and PKCE exchange.');
} finally { if (browser) await browser.close(); await app.shutdown(); rmSync(dir, { recursive: true, force: true }); }
