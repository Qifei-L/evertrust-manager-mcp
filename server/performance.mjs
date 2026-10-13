import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();
const rounded = value => Math.round(value * 100) / 100;
export class PerformanceMonitor {
  constructor({ logger = record => console.log(JSON.stringify(record)) } = {}) {
    this.samples = [];
    this.logger = logger;
  }
  async request(req, res, handler) {
    const started = performance.now();
    const metric = { event: 'request_performance', request_ms: 0, storage_ms: 0, crypto_ms: 0, manager_ms: 0, storage_calls: 0, manager_calls: 0, crypto_calls: 0, key_imports: 0, response_bytes: 0 };
    // Fixed categories only: never log URL parameters, record IDs, payloads or credentials.
    const path = req.url?.split('?')[0];
    metric.route = path === '/mcp' ? 'mcp' : path?.startsWith('/api/connections') ? 'connections' : path === '/login' ? 'login' : path === '/' ? 'workspace' : 'other';
    const excluded = path === '/healthz' || path === '/api/performance';
    res.once('finish', () => {
      if (excluded) return;
      metric.request_ms = performance.now() - started;
      metric.status = res.statusCode;
      for (const name of ['request_ms','storage_ms','crypto_ms','manager_ms']) metric[name] = rounded(metric[name]);
      this.samples.push({ ...metric });
      if (this.samples.length > 500) this.samples.shift();
      this.logger({ ...metric });
    });
    return context.run(metric, handler);
  }
  async measure(name, operation) {
    const metric = context.getStore();
    if (!metric) return operation();
    const started = performance.now();
    try { return await operation(); }
    finally { metric[name] += performance.now() - started; }
  }
  increment(name) { const metric = context.getStore(); if (metric) metric[name]++; }
  responseBytes(bytes) { const metric = context.getStore(); if (metric) metric.response_bytes = bytes; }
  lane(value) { const metric = context.getStore(); if (metric) metric.execution_lane = value; }
  async execution(operation) {
    const metrics = { storage_ms: 0, crypto_ms: 0, manager_ms: 0, storage_calls: 0, crypto_calls: 0, manager_calls: 0, key_imports: 0 };
    const value = await context.run(metrics, operation);
    return { value, metrics };
  }
  mergeExecution(metrics) {
    const target = context.getStore();
    if (!target || !metrics) return;
    for (const name of ['storage_ms','crypto_ms','manager_ms','storage_calls','crypto_calls','manager_calls','key_imports']) {
      if (Number.isFinite(metrics[name]) && metrics[name] >= 0) target[name] += metrics[name];
    }
  }
  bucket(bucket) {
    return Object.fromEntries(['get','put','list','delete'].map(name => [name, (...args) => {
      this.increment('storage_calls');
      return this.measure('storage_ms', () => bucket[name](...args));
    }]));
  }
  async managerFetch(...args) {
    this.increment('manager_calls');
    const response = await this.measure('manager_ms', () => fetch(...args));
    const read = response.text.bind(response);
    response.text = () => this.measure('manager_ms', read);
    return response;
  }
  timing() {
    const m = context.getStore();
    return m ? `storage;dur=${rounded(m.storage_ms)}, crypto;dur=${rounded(m.crypto_ms)}, manager;dur=${rounded(m.manager_ms)}` : '';
  }
  summary() {
    const values = this.samples.map(s => s.request_ms).sort((a,b) => a-b);
    const percentile = p => values.length ? values[Math.max(0,Math.ceil(values.length*p)-1)] : null;
    return { window: 'Last 500 completed requests in this process; resets on restart', count: values.length, p50_ms: percentile(.5), p95_ms: percentile(.95), recent: this.samples.slice(-30) };
  }
}
