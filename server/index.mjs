import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SqliteBucket } from './storage.mjs';
import { loginPage, connectionsPage } from './pages.mjs';
import { PerformanceMonitor } from './performance.mjs';
import { executionLane, WriteExecutor } from './execution.mjs';
import { ReadService } from './read-service.mjs';

export function configuration(env = process.env) {
  const token = env.APP_AUTH_TOKEN;
  if (typeof token !== 'string' || token.length < 32 || /[\s:]/.test(token)) throw new Error('APP_AUTH_TOKEN must be at least 32 characters, without whitespace or colons.');
  if (!/^[a-f0-9]{64}$/.test(env.MANAGER_TOKEN_ENCRYPTION_KEY ?? '')) throw new Error('MANAGER_TOKEN_ENCRYPTION_KEY must be 64 lowercase hex characters.');
  const managerBase = new URL(env.MANAGER_API_BASE);
  if (managerBase.protocol !== 'https:' || managerBase.username || managerBase.password || managerBase.search || managerBase.hash || !/^\/api2\/?$/.test(managerBase.pathname)) throw new Error('MANAGER_API_BASE must be a HTTPS URL ending in /api2, without credentials or query parameters.');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const origin = new URL(env.PUBLIC_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${port}`));
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('PUBLIC_URL must be an HTTP(S) origin without a path or credentials.');
  if (env.RAILWAY_ENVIRONMENT_ID && origin.protocol !== 'https:') throw new Error('Configure a HTTPS PUBLIC_URL or generate a Railway domain.');
  const dataDir = resolve(env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || './data');
  if (env.RAILWAY_ENVIRONMENT_ID) {
    if (!env.RAILWAY_VOLUME_MOUNT_PATH) throw new Error('Attach a Railway persistent volume before starting this service.');
    const location = relative(resolve(env.RAILWAY_VOLUME_MOUNT_PATH), dataDir);
    if (location.startsWith('..') || isAbsolute(location)) throw new Error('DATA_DIR must be inside the Railway volume.');
  }
  const user = env.APP_USER_ID || 'railway-owner';
  if (user.length > 200 || /[\r\n]/.test(user)) throw new Error('Invalid APP_USER_ID');
  return { token, key: env.MANAGER_TOKEN_ENCRYPTION_KEY, port, origin: origin.origin, dataDir, user, managerBase: managerBase.href };
}

function equal(a, b) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

function authenticated(value, token) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('Bearer ')) return equal(value.slice(7), token);
  if (value.startsWith('Basic ')) {
    const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8');
    return equal(decoded, `admin:${token}`);
  }
  return false;
}

function reply(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
}

function html(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
  res.end(content);
}

export function createApplication(config, bucket = new SqliteBucket(join(config.dataDir, 'managerio.sqlite')), monitor = new PerformanceMonitor()) {
  bucket.assertEncryptionKey(config.key);
  const reads = new ReadService(config, bucket, monitor);
  const writes = new WriteExecutor(config);
  let stopping = false;
  const sessions = new Map();
  const lifetime = 8 * 60 * 60 * 1000;
  const cookieName = 'evertrust_session';
  const cookie = (value, maxAge) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.origin.startsWith('https:') ? '; Secure' : ''}`;
  const sessionId = req => (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const server = createServer((req, res) => monitor.request(req, res, async () => {
    try {
      // Build links and CSRF checks from configured origin, never from Host/forwarded headers.
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return reply(res, 400, { error: 'Invalid request URL' });
      const url = new URL(req.url, config.origin);
      if (url.origin !== config.origin) return reply(res, 400, { error: 'Invalid request URL' });
      if (url.pathname === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
        return reply(res, stopping || !bucket.healthy() ? 503 : 200, { status: stopping ? 'stopping' : 'ok' });
      }
      if (stopping) return reply(res, 503, { error: 'Service is stopping' });
      const now = Date.now();
      for (const [id, expires] of sessions) if (expires <= now) sessions.delete(id);
      const id = sessionId(req);
      const sessionActive = !!id && sessions.has(id);
      const credentialActive = authenticated(req.headers.authorization, config.token);
      // Browser entry uses its explicit login session, not a cached Basic-auth challenge.
      const browserEntry = url.pathname === '/' || url.pathname === '/login';
      const loggedIn = sessionActive || (credentialActive && (!browserEntry || req.headers.authorization?.startsWith('Bearer ')));
      if (url.pathname === '/login' && req.method === 'GET') {
        if (loggedIn) { res.writeHead(303, { Location: '/', 'Cache-Control': 'no-store' }); return res.end(); }
        return html(res, loginPage);
      }
      if (url.pathname === '/login' && req.method === 'POST') {
        if (req.headers.origin !== config.origin) return reply(res, 403, { error: 'Request origin is not allowed.' });
        let body = '', bytes = 0;
        for await (const part of req) { bytes += part.length; if (bytes > 4096) return reply(res, 413, { error: 'Request body too large' }); body += part.toString('utf8'); }
        let password;
        try { password = JSON.parse(body).password; } catch { return reply(res, 400, { error: 'Invalid login request' }); }
        if (typeof password !== 'string' || !equal(password, config.token)) return reply(res, 401, { error: 'Incorrect password' });
        if (sessions.size >= 500) return reply(res, 503, { error: 'Too many active sessions' });
        const newId = randomBytes(32).toString('hex');
        if (id) sessions.delete(id);
        sessions.set(newId, now + lifetime);
        return reply(res, 200, { signed_in: true }, { 'Set-Cookie': cookie(newId, lifetime/1000) });
      }
      if (!loggedIn) {
        if (url.pathname === '/' && req.method === 'GET') { res.writeHead(303, { Location: '/login', 'Cache-Control': 'no-store' }); return res.end(); }
        return reply(res, 401, { error: 'Authentication required' });
      }
      if (req.headers.origin && req.headers.origin !== config.origin) return reply(res, 403, { error: 'Request origin is not allowed.' });
      if (url.pathname === '/api/performance' && req.method === 'GET') return reply(res, 200, monitor.summary());
      if (url.pathname === '/api/execution' && req.method === 'GET') return reply(res, 200, { mode: 'separate-write-thread', writes: writes.status() });
      if (url.pathname === '/logout' && req.method === 'POST') {
        if (req.headers.origin !== config.origin) return reply(res, 403, { error: 'Request origin is not allowed.' });
        if (id) sessions.delete(id);
        return reply(res, 200, { signed_out: true }, { 'Set-Cookie': cookie('', 0) });
      }
      if (url.pathname === '/' && req.method === 'GET') return html(res, connectionsPage);
      if (url.pathname === '/mcp' && req.method !== 'POST') return reply(res, 405, { error: 'This stateless MCP endpoint accepts POST only.' }, { Allow: 'POST' });
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (['authorization', 'host', 'connection', 'content-length', 'transfer-encoding', 'oai-authenticated-user-id'].includes(key) || key.startsWith('x-forwarded-')) continue;
        if (typeof value === 'string') headers.set(key, value);
      }
      // Never accept caller-supplied user identity. Credentials select this single-owner namespace.
      headers.set('oai-authenticated-user-id', config.user);
      const maxBytes = 16 * 1024 * 1024;
      if (Number(req.headers['content-length']) > maxBytes) return reply(res, 413, { error: 'Request body too large' });
      const parts = [];
      let length = 0;
      for await (const part of req) {
        length += part.length;
        if (length > maxBytes) { reply(res, 413, { error: 'Request body too large' }); return; }
        parts.push(part);
      }
      const request = new Request(url, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(parts) } : {}) });
      const lane = await executionLane(request);
      monitor.lane(lane);
      let response;
      if (lane === 'write') {
        const result = await writes.execute(request);
        response = result.response;
        monitor.mergeExecution(result.metrics);
      } else {
        response = await reads.fetch(request);
      }
      const responseBody = Buffer.from(await response.arrayBuffer());
      monitor.responseBytes(responseBody.length);
      const responseHeaders = Object.fromEntries(response.headers);
      responseHeaders['cache-control'] = 'no-store';
      responseHeaders['x-content-type-options'] = 'nosniff';
      responseHeaders['referrer-policy'] = 'no-referrer';
      responseHeaders['server-timing'] = monitor.timing();
      responseHeaders['x-execution-lane'] = lane;
      res.writeHead(response.status, responseHeaders);
      res.end(req.method === 'HEAD' ? undefined : responseBody);
    } catch {
      // Log no credentials, request bodies, company records or upstream response content.
      console.error('HTTP request failed');
      if (!res.headersSent) reply(res, 500, { error: 'Request failed. Inspect the saved task before retrying a write.' });
      else res.end();
    }
  }));
  server.requestTimeout = 180_000;
  server.headersTimeout = 30_000;
  server.setTimeout(180_000);
  return { server, bucket, shutdown: () => {
    stopping = true;
    return new Promise((done, reject) => server.close(async error => {
      try { await writes.close(); bucket.close(); }
      catch (failure) { reject(failure); return; }
      if (error) reject(error); else done();
    }));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = configuration();
    const app = createApplication(config);
    app.server.listen(config.port, '0.0.0.0', () => console.log(`Evertrust Books listening on port ${config.port}`));
    let shutdownStarted = false;
    const stop = () => {
      if (shutdownStarted) return;
      shutdownStarted = true;
      const deadline = setTimeout(() => process.exit(1), 110_000).unref();
      app.shutdown().then(() => { clearTimeout(deadline); process.exit(0); }, () => process.exit(1));
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
