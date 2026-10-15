import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_CLIENTS = 1000;
const ACCESS_SECONDS = 3600;
const REFRESH_SECONDS = 30 * 86400;

// OAuth grants delegate the existing owner namespace. They never create a new
// company identity or expose the master credential to an MCP client.
export class OwnerOAuth {
  constructor(config, bucket) {
    this.config = config;
    this.db = bucket.db;
    this.rate = new Map();
    this.db.exec(`CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_pending (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_codes (hash TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_tokens (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, family TEXT NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL);`);
  }

  resource() { return `${this.config.origin}/mcp`; }
  challenge() { return `Bearer resource_metadata="${this.config.origin}/.well-known/oauth-protected-resource", scope="mcp"`; }
  binding() { return digest(`${this.config.token}\0${this.config.user}`); }
  json(res, status, data, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(JSON.stringify(data));
  }
  error(res, error, status = 400) { this.json(res, status, { error }); }
  page(res, content, cookie, redirectUri) {
    // A no-referrer form navigation sends Origin:null in real browsers. Keep
    // same-origin form provenance; suppress referrers again on the 303 callback.
    // Chromium also checks form-action on redirects, so allow only the origin
    // of this client's already validated, exactly registered callback.
    const callbackOrigin = new URL(redirectUri).origin;
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${callbackOrigin}; frame-ancestors 'none'; base-uri 'none'`, ...(cookie ? { 'Set-Cookie': cookie } : {}) });
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Evertrust Books</title><style>body{font:16px system-ui;max-width:560px;margin:60px auto;padding:24px;color:#242424}input,button{font:inherit;padding:12px;margin:12px 0;box-sizing:border-box}input[type=password]{width:100%}button{cursor:pointer}p{line-height:1.6}code{overflow-wrap:anywhere}</style>${content}</html>`);
  }
  cookie(value, maxAge = 600) { return `evertrust_oauth=${value}; Path=/oauth/authorize; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.config.origin.startsWith('https:') ? '; Secure' : ''}`; }
  limit(req, kind, max) {
    const now = Date.now();
    for (const [key, value] of this.rate) if (value.until <= now) this.rate.delete(key);
    // Do not trust forwarded client addresses. A shared proxy receives one budget.
    const key = `${kind}:${req.socket.remoteAddress}`;
    let entry = this.rate.get(key);
    if (!entry) { if (this.rate.size >= 2000) return false; entry = { until: now + 60000, count: 0 }; this.rate.set(key, entry); }
    return ++entry.count <= max;
  }
  cleanup() {
    const now = Date.now();
    for (const table of ['oauth_pending', 'oauth_codes', 'oauth_tokens']) this.db.prepare(`DELETE FROM ${table} WHERE expires <= ?`).run(now);
  }
  async body(req, json = false) {
    const parts = []; let size = 0;
    for await (const part of req) { size += part.length; if (size > 16384) throw new Error('body'); parts.push(part); }
    const text = Buffer.concat(parts).toString('utf8');
    if (json) {
      if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('type');
      return JSON.parse(text);
    }
    if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) throw new Error('type');
    const params = new URLSearchParams(text);
    if (new Set(params.keys()).size !== [...params.keys()].length) throw new Error('duplicates');
    return Object.fromEntries(params);
  }
  client(id) {
    if (typeof id !== 'string') return null;
    const row = this.db.prepare('SELECT data FROM oauth_clients WHERE id=?').get(id);
    return row ? JSON.parse(row.data) : null;
  }
  redirectValid(uri) {
    try { const u = new URL(uri); return !u.username && !u.password && !u.hash && (u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname))); } catch { return false; }
  }
  validGrant(data) { return data.binding === this.binding() && data.resource === this.resource() && data.user === this.config.user && data.scope === 'mcp'; }
  authenticate(header) {
    if (!header?.startsWith('Bearer ')) return false;
    const row = this.db.prepare("SELECT data FROM oauth_tokens WHERE hash=? AND kind='access' AND expires>?").get(digest(header.slice(7)), Date.now());
    return !!row && this.validGrant(JSON.parse(row.data));
  }
  clientAuthenticated(req, body, client) {
    if (!client) return false;
    if (client.method === 'none') return !body.client_secret && !req.headers.authorization;
    if (client.method === 'client_secret_post') return equal(digest(body.client_secret || ''), client.secret_hash);
    if (!req.headers.authorization?.startsWith('Basic ')) return false;
    const text = Buffer.from(req.headers.authorization.slice(6), 'base64').toString('utf8');
    const split = text.indexOf(':');
    try { return decodeURIComponent(text.slice(0, split)) === body.client_id && equal(digest(decodeURIComponent(text.slice(split + 1))), client.secret_hash); } catch { return false; }
  }
  issue(res, data, family = secret()) {
    const access = secret(), refresh = secret(), now = Date.now();
    const statement = this.db.prepare('INSERT INTO oauth_tokens(hash,kind,family,data,expires) VALUES (?,?,?,?,?)');
    statement.run(digest(access), 'access', family, JSON.stringify(data), now + ACCESS_SECONDS * 1000);
    statement.run(digest(refresh), 'refresh', family, JSON.stringify(data), now + REFRESH_SECONDS * 1000);
    this.json(res, 200, { access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: data.scope });
  }

  async handle(req, res, url, sessionActive) {
    const path = url.pathname;
    if (['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(path) && req.method === 'GET') {
      this.json(res, 200, { resource: this.resource(), authorization_servers: [this.config.origin], scopes_supported: ['mcp'], bearer_methods_supported: ['header'], resource_name: 'Evertrust Books' }); return true;
    }
    if (['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'].includes(path) && req.method === 'GET') {
      this.json(res, 200, { issuer: this.config.origin, authorization_endpoint: `${this.config.origin}/oauth/authorize`, token_endpoint: `${this.config.origin}/oauth/token`, registration_endpoint: `${this.config.origin}/oauth/register`, revocation_endpoint: `${this.config.origin}/oauth/revoke`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'], code_challenge_methods_supported: ['S256'], scopes_supported: ['mcp'], authorization_response_iss_parameter_supported: true }); return true;
    }
    if (!path.startsWith('/oauth/')) return false;
    this.cleanup();
    try {
      if (path === '/oauth/register' && req.method === 'POST') {
        if (!this.limit(req, 'register', 20)) { this.error(res, 'temporarily_unavailable', 429); return true; }
        const body = await this.body(req, true);
        if (!body || !Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 10 || !body.redirect_uris.every(uri => typeof uri === 'string' && uri.length <= 2000 && this.redirectValid(uri))) { this.error(res, 'invalid_redirect_uri'); return true; }
        const method = body.token_endpoint_auth_method || 'none';
        if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method) || (body.grant_types && (!Array.isArray(body.grant_types) || body.grant_types.some(x => !['authorization_code', 'refresh_token'].includes(x)))) || (body.response_types && (!Array.isArray(body.response_types) || body.response_types.some(x => x !== 'code')))) { this.error(res, 'invalid_client_metadata'); return true; }
        if (this.db.prepare('SELECT count(*) AS n FROM oauth_clients').get().n >= MAX_CLIENTS) { this.error(res, 'temporarily_unavailable', 503); return true; }
        const id = secret(), clientSecret = method === 'none' ? null : secret();
        const client = { redirect_uris: [...new Set(body.redirect_uris)], name: String(body.client_name || 'MCP client').slice(0, 200), method, ...(clientSecret ? { secret_hash: digest(clientSecret) } : {}) };
        this.db.prepare('INSERT INTO oauth_clients VALUES (?,?)').run(id, JSON.stringify(client));
        this.json(res, 201, { client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: client.redirect_uris, client_name: client.name, token_endpoint_auth_method: method, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}) }); return true;
      }
      if (path === '/oauth/authorize' && req.method === 'GET') {
        if (!this.limit(req, 'authorize', 60)) { this.error(res, 'temporarily_unavailable', 429); return true; }
        const q = Object.fromEntries(url.searchParams), client = this.client(q.client_id);
        if (new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length || !client || !client.redirect_uris.includes(q.redirect_uri)) { this.error(res, 'invalid_request'); return true; }
        if (q.response_type !== 'code' || q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge || '') || (q.resource && q.resource !== this.resource()) || (q.scope && q.scope !== 'mcp') || (q.state && q.state.length > 2048)) { this.error(res, 'invalid_request'); return true; }
        const id = secret(), csrf = secret();
        const data = { ...q, resource: this.resource(), scope: 'mcp', csrf: digest(csrf) };
        this.db.prepare('INSERT INTO oauth_pending VALUES (?,?,?)').run(id, JSON.stringify(data), Date.now() + 600000);
        this.page(res, `<h1>Connect Evertrust Books</h1><p><strong>${escape(client.name)}</strong> requests access to the existing Evertrust Books owner account.</p><p>This permits all available accounting tools, including reads and writes, for all company connections saved by this owner. It does not create a separate user account.</p><p>Return address: <code>${escape(q.redirect_uri)}</code></p><form method="post" action="/oauth/authorize"><input type="hidden" name="request_id" value="${id}">${sessionActive ? '<p>You are signed in as the service owner.</p>' : '<label>Service owner password (APP_AUTH_TOKEN)<input type="password" name="password" required autocomplete="current-password"></label>'}<button name="decision" value="allow">Authorize connection</button> <button name="decision" value="deny" formnovalidate>Cancel</button></form>`, this.cookie(csrf), q.redirect_uri); return true;
      }
      if (path === '/oauth/authorize' && req.method === 'POST') {
        if (req.headers.origin !== this.config.origin) { this.error(res, 'access_denied', 403); return true; }
        if (!this.limit(req, 'login', 10)) { this.error(res, 'temporarily_unavailable', 429); return true; }
        const body = await this.body(req), row = this.db.prepare('SELECT data FROM oauth_pending WHERE id=?').get(body.request_id || '');
        const csrf = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('evertrust_oauth='))?.slice('evertrust_oauth='.length);
        const data = row ? JSON.parse(row.data) : null;
        if (!data || !csrf || !equal(digest(csrf), data.csrf)) { this.error(res, 'access_denied', 403); return true; }
        if (body.decision !== 'deny' && !sessionActive && !equal(body.password, this.config.token)) { this.error(res, 'access_denied', 401); return true; }
        this.db.prepare('DELETE FROM oauth_pending WHERE id=?').run(body.request_id);
        const redirect = new URL(data.redirect_uri);
        if (data.state !== undefined) redirect.searchParams.set('state', data.state);
        redirect.searchParams.set('iss', this.config.origin);
        if (body.decision !== 'allow') redirect.searchParams.set('error', 'access_denied');
        else {
          const code = secret();
          const grant = { client_id: data.client_id, redirect_uri: data.redirect_uri, challenge: data.code_challenge, resource: this.resource(), scope: 'mcp', user: this.config.user, binding: this.binding() };
          this.db.prepare('INSERT INTO oauth_codes VALUES (?,?,?)').run(digest(code), JSON.stringify(grant), Date.now() + 120000);
          redirect.searchParams.set('code', code);
        }
        res.writeHead(303, { Location: redirect.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Set-Cookie': this.cookie('', 0) }); res.end(); return true;
      }
      if (['/oauth/token', '/oauth/revoke'].includes(path) && req.method === 'POST') {
        if (!this.limit(req, 'token', 120)) { this.error(res, 'temporarily_unavailable', 429); return true; }
        const body = await this.body(req);
        if (!body.client_id && req.headers.authorization?.startsWith('Basic ')) { const decoded = Buffer.from(req.headers.authorization.slice(6), 'base64').toString('utf8'); body.client_id = decodeURIComponent(decoded.slice(0, decoded.indexOf(':'))); }
        const client = this.client(body.client_id);
        if (!this.clientAuthenticated(req, body, client)) { this.error(res, 'invalid_client', 401); return true; }
        if (path === '/oauth/revoke') {
          const row = this.db.prepare('SELECT family,data FROM oauth_tokens WHERE hash=?').get(digest(body.token || ''));
          if (row && JSON.parse(row.data).client_id === body.client_id) this.db.prepare('DELETE FROM oauth_tokens WHERE family=?').run(row.family);
          this.json(res, 200, {}); return true;
        }
        if (body.grant_type === 'authorization_code') {
          const row = this.db.prepare('SELECT data FROM oauth_codes WHERE hash=?').get(digest(body.code || ''));
          const data = row ? JSON.parse(row.data) : null;
          if (!data || !this.validGrant(data) || data.client_id !== body.client_id || data.redirect_uri !== body.redirect_uri || (body.resource && body.resource !== data.resource) || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier || '') || createHash('sha256').update(body.code_verifier).digest('base64url') !== data.challenge) { this.error(res, 'invalid_grant'); return true; }
          this.db.prepare('DELETE FROM oauth_codes WHERE hash=?').run(digest(body.code));
          this.issue(res, data); return true;
        }
        if (body.grant_type === 'refresh_token') {
          const row = this.db.prepare("SELECT data,family FROM oauth_tokens WHERE hash=? AND kind IN ('refresh','used_refresh')").get(digest(body.refresh_token || ''));
          const data = row ? JSON.parse(row.data) : null;
          if (!data || data.client_id !== body.client_id || !this.validGrant(data) || (body.resource && body.resource !== data.resource) || (body.scope && body.scope !== data.scope)) { this.error(res, 'invalid_grant'); return true; }
          const used = this.db.prepare('SELECT kind FROM oauth_tokens WHERE hash=?').get(digest(body.refresh_token));
          if (used.kind === 'used_refresh') { this.db.prepare('DELETE FROM oauth_tokens WHERE family=?').run(row.family); this.error(res, 'invalid_grant'); return true; }
          this.db.prepare("UPDATE oauth_tokens SET kind='used_refresh' WHERE hash=?").run(digest(body.refresh_token));
          this.issue(res, data, row.family); return true;
        }
        this.error(res, 'unsupported_grant_type'); return true;
      }
      this.error(res, 'invalid_request', 404); return true;
    } catch { this.error(res, 'invalid_request'); return true; }
  }
}
