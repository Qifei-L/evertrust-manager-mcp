import { parentPort } from 'node:worker_threads';
parentPort.on('message', message => {
  const path = new URL(message.url).pathname;
  if (path === '/crash') process.exit(7);
  // A synchronous workload simulates parsing/SQLite pressure in the write lane.
  if (path === '/slow') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  const body = new TextEncoder().encode(JSON.stringify({ completed: true })).buffer;
  parentPort.postMessage({ id: message.id, status: 200, headers: { 'content-type': 'application/json' }, body, metrics: { storage_calls: 2 } }, [body]);
});
parentPort.postMessage({ ready: true });
