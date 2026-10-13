import { Worker } from 'node:worker_threads';
import { isReadOnlyTool } from '../worker/index.js';

export async function executionLane(request) {
  const path = new URL(request.url).pathname;
  if (path === '/mcp' && request.method === 'POST') {
    let rpc;
    try { rpc = await request.clone().json(); } catch { return 'read'; }
    if (rpc?.method === 'tools/call' && rpc.id !== undefined) return isReadOnlyTool(rpc.params?.name) ? 'read' : 'write';
  }
  // Company credentials/preferences belong to the gateway's control plane.
  if (path.startsWith('/api/coa/') && !['GET', 'HEAD'].includes(request.method)) return 'write';
  return 'read';
}

const unavailable = () => Response.json({ error: 'Write executor unavailable. Inspect the saved task and Manager record before retrying.', retryable: false, reconciliation_required: true }, { status: 503 });

// One long-lived executor; no automatic replay after a crash or timeout.
export class WriteExecutor {
  constructor(config, { workerUrl = new URL('./write-service.mjs', import.meta.url), maxPending = 1, timeoutMs = 150_000 } = {}) {
    this.config = { managerBase: config.managerBase, key: config.key, dataDir: config.dataDir };
    this.workerUrl = workerUrl;
    this.maxPending = maxPending;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.sequence = 0;
    this.closed = false;
    this.ready = false;
    this.start();
  }
  start() {
    const thread = new Worker(this.workerUrl, { workerData: this.config });
    this.thread = thread;
    this.ready = false;
    thread.on('message', message => {
      if (thread !== this.thread) return;
      if (message.ready) { this.ready = true; return; }
      const item = this.pending.get(message.id);
      if (!item) return;
      this.pending.delete(message.id);
      clearTimeout(item.timer);
      item.resolve(message.error ? { response: unavailable() } : {
        response: new Response(message.body, { status: message.status, headers: message.headers }), metrics: message.metrics,
      });
    });
    const fail = () => {
      if (thread !== this.thread) return;
      this.ready = false;
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.resolve({ response: unavailable() }); }
      this.pending.clear();
    };
    thread.on('error', fail);
    thread.on('exit', () => { fail(); if (thread === this.thread) this.thread = null; });
  }
  status() { return { ready: this.ready, pending: this.pending.size, capacity: this.maxPending }; }
  async execute(request) {
    if (this.closed) return { response: unavailable() };
    if (!this.thread) this.start();
    // Fail closed during startup/recovery; callers may retry a request rejected before dispatch.
    if (!this.ready) return { response: unavailable() };
    // Do not silently build a volatile queue of financial operations.
    if (this.pending.size >= this.maxPending) return { response: Response.json({ error: 'Write executor busy; request was not dispatched.', retryable: true }, { status: 503 }) };
    const body = await request.arrayBuffer();
    // Capacity/worker may change while the body is being consumed.
    if (!this.ready || this.closed) return { response: unavailable() };
    if (this.pending.size >= this.maxPending) return { response: Response.json({ error: 'Write executor busy; request was not dispatched.', retryable: true }, { status: 503 }) };
    const id = ++this.sequence;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        // The write may still finish. Keep its capacity slot until its real result arrives.
        const item = this.pending.get(id);
        if (item) { item.resolve({ response: unavailable() }); item.resolve = () => {}; }
      }, this.timeoutMs);
      this.pending.set(id, { resolve, timer });
      try { this.thread.postMessage({ id, url: request.url, method: request.method, headers: [...request.headers], body }, [body]); }
      catch { clearTimeout(timer); this.pending.delete(id); resolve({ response: unavailable() }); }
    });
  }
  async close() {
    this.closed = true;
    const thread = this.thread;
    if (thread) await thread.terminate();
  }
}
