import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import worker, { configureManagerApi } from '../worker/index.js';
import { SqliteBucket } from './storage.mjs';

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

export function createApplication(config, bucket = new SqliteBucket(join(config.dataDir, 'managerio.sqlite'))) {
  configureManagerApi(config.managerBase);
  bucket.assertEncryptionKey(config.key);
  let stopping = false;
  const server = createServer(async (req, res) => {
    try {
      // Build links and CSRF checks from configured origin, never from Host/forwarded headers.
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return reply(res, 400, { error: 'Invalid request URL' });
      const url = new URL(req.url, config.origin);
      if (url.origin !== config.origin) return reply(res, 400, { error: 'Invalid request URL' });
      if (url.pathname === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
        return reply(res, stopping || !bucket.healthy() ? 503 : 200, { status: stopping ? 'stopping' : 'ok' });
      }
      if (stopping) return reply(res, 503, { error: 'Service is stopping' });
      if (!authenticated(req.headers.authorization, config.token)) {
        return reply(res, 401, { error: 'Authentication required' }, url.pathname === '/mcp' ? {} : { 'WWW-Authenticate': 'Basic realm="Evertrust Books", charset="UTF-8"' });
      }
      if (req.headers.origin && req.headers.origin !== config.origin) return reply(res, 403, { error: 'Request origin is not allowed.' });
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
      const response = await worker.fetch(request, { BUCKET: bucket, MANAGER_TOKEN_ENCRYPTION_KEY: config.key });
      const responseHeaders = Object.fromEntries(response.headers);
      responseHeaders['cache-control'] = 'no-store';
      responseHeaders['x-content-type-options'] = 'nosniff';
      responseHeaders['referrer-policy'] = 'no-referrer';
      res.writeHead(response.status, responseHeaders);
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch {
      // Log no credentials, request bodies, company records or upstream response content.
      console.error('HTTP request failed');
      if (!res.headersSent) reply(res, 500, { error: 'Request failed. Inspect the saved task before retrying a write.' });
      else res.end();
    }
  });
  server.requestTimeout = 180_000;
  server.headersTimeout = 30_000;
  server.setTimeout(180_000);
  return { server, bucket, shutdown: () => {
    stopping = true;
    return new Promise((done, reject) => server.close(error => {
      bucket.close();
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
