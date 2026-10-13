import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Preserve the Worker's R2 contract, especially atomic ETag compare-and-swap.
export class SqliteBucket {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS objects (key TEXT PRIMARY KEY, body TEXT NOT NULL, etag TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }

  assertEncryptionKey(key) {
    const fingerprint = createHash('sha256').update(key).digest('hex');
    this.db.prepare("INSERT INTO metadata(key,value) VALUES ('encryption-key',?) ON CONFLICT DO NOTHING").run(fingerprint);
    if (this.db.prepare("SELECT value FROM metadata WHERE key='encryption-key'").get().value !== fingerprint) {
      throw new Error('MANAGER_TOKEN_ENCRYPTION_KEY differs from the stored database key. Restore the original key.');
    }
  }

  async get(key) {
    const row = this.db.prepare('SELECT body,etag FROM objects WHERE key=?').get(key);
    return row ? { etag: row.etag, json: async () => JSON.parse(row.body), text: async () => row.body } : null;
  }

  async put(key, body, options = {}) {
    if (typeof key !== 'string' || typeof body !== 'string') throw new TypeError('Expected text key and body');
    const etag = randomUUID();
    const condition = options.onlyIf;
    let row;
    if (condition?.etagMatches !== undefined) {
      row = this.db.prepare('UPDATE objects SET body=?,etag=? WHERE key=? AND etag=? RETURNING etag')
        .get(body, etag, key, condition.etagMatches);
    } else if (condition?.etagDoesNotMatch === '*') {
      row = this.db.prepare('INSERT INTO objects(key,body,etag) VALUES (?,?,?) ON CONFLICT DO NOTHING RETURNING etag')
        .get(key, body, etag);
    } else if (condition) {
      throw new Error('Unsupported storage condition');
    } else {
      row = this.db.prepare('INSERT INTO objects(key,body,etag) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,etag=excluded.etag RETURNING etag')
        .get(key, body, etag);
    }
    return row ? { etag: row.etag } : null;
  }

  async delete(key) {
    this.db.prepare('DELETE FROM objects WHERE key=?').run(key);
  }

  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid list limit');
    let after = '';
    if (cursor) {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (parsed.prefix !== prefix || typeof parsed.after !== 'string') throw new Error('Invalid storage cursor');
      after = parsed.after;
    }
    const rows = this.db.prepare('SELECT key,etag FROM objects WHERE substr(key,1,length(?))=? AND key>? ORDER BY key LIMIT ?')
      .all(prefix, prefix, after, limit + 1);
    const truncated = rows.length > limit;
    const objects = rows.slice(0, limit);
    return { objects, truncated, cursor: truncated ? Buffer.from(JSON.stringify({ prefix, after: objects.at(-1).key })).toString('base64url') : undefined };
  }

  healthy() { return this.db.prepare('SELECT 1 AS ok').get().ok === 1; }
  close() { this.db.close(); }
}
