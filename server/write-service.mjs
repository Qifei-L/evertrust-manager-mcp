import { parentPort, workerData } from 'node:worker_threads';
import { join } from 'node:path';
import worker, { configureManagerApi } from '../worker/index.js';
import { SqliteBucket } from './storage.mjs';
import { PerformanceMonitor } from './performance.mjs';

const bucket = new SqliteBucket(join(workerData.dataDir, 'managerio.sqlite'));
bucket.assertEncryptionKey(workerData.key);
const monitor = new PerformanceMonitor({ logger: () => {} });
configureManagerApi(workerData.managerBase, (...args) => monitor.managerFetch(...args));

// Reject overlapping writes rather than keeping accepted work in an in-memory queue.
let busy = false;
parentPort.on('message', async message => {
  if (busy) {
    const body = new TextEncoder().encode(JSON.stringify({ error: 'Another write is executing; request was not dispatched to Manager.', retryable: true })).buffer;
    parentPort.postMessage({ id: message.id, status: 503, headers: { 'content-type': 'application/json' }, body }, [body]);
    return;
  }
  busy = true;
  try {
    const { value, metrics } = await monitor.execution(async () => {
      const request = new Request(message.url, { method: message.method, headers: message.headers, body: message.body });
      const response = await worker.fetch(request, { BUCKET: monitor.bucket(bucket), PERFORMANCE: monitor, MANAGER_TOKEN_ENCRYPTION_KEY: workerData.key });
      return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.arrayBuffer() };
    });
    parentPort.postMessage({ id: message.id, ...value, metrics }, [value.body]);
  } catch {
    parentPort.postMessage({ id: message.id, error: true });
  } finally { busy = false; }
});
parentPort.postMessage({ ready: true });
