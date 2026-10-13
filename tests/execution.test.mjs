import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { executionLane, WriteExecutor } from '../server/execution.mjs';
import { PerformanceMonitor } from '../server/performance.mjs';

const rpc = (name, id = 1) => new Request('https://books.test/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id, params: { name } }) });
async function ready(executor) {
  for (let i = 0; i < 100; i++) { if (executor.status().ready) return; await delay(20); }
  throw new Error('Executor failed to become ready');
}

test('routing uses actual deployed contracts and preserves request body', async () => {
  for (const name of ['get_accounts', 'list_connections', 'get_coa_changes', 'get_record']) assert.equal(await executionLane(rpc(name)), 'read', name);
  for (const name of ['create_record', 'update_record', 'delete_record', 'prepare_coa_changes', 'apply_coa_changes', 'unknown_tool']) {
    const request = rpc(name);
    assert.equal(await executionLane(request), 'write', name);
    assert.equal((await request.json()).params.name, name);
  }
  const notice = new Request('https://books.test/mcp', { method: 'POST', body: '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_record"}}' });
  assert.equal(await executionLane(notice), 'read');
  assert.equal(await executionLane(new Request('https://books.test/api/coa/execute', { method: 'POST', body: '{}' })), 'write');
  assert.equal(await executionLane(new Request('https://books.test/api/connections', { method: 'POST', body: '{}' })), 'read');
});

test('a blocking write does not block main-thread reads; concurrent writes reject without dispatch', async () => {
  const executor = new WriteExecutor({}, { workerUrl: new URL('./fixtures/write-executor.mjs', import.meta.url) });
  try {
    await ready(executor);
    const slow = executor.execute(new Request('https://books.test/slow', { method: 'POST', body: '{}' }));
    await delay(20);
    assert.equal(executor.status().pending, 1);
    const rejected = await executor.execute(new Request('https://books.test/fast', { method: 'POST', body: '{}' }));
    assert.equal(rejected.response.status, 503);
    assert.equal((await rejected.response.json()).retryable, true);
    const readStarted = performance.now();
    await delay(20);
    assert(performance.now() - readStarted < 200, 'write blocked gateway event loop');
    const result = await slow;
    assert.equal(result.response.status, 200);
    assert.deepEqual(await result.response.json(), { completed: true });
    assert.equal(result.metrics.storage_calls, 2);
    assert.equal(executor.status().pending, 0);
  } finally { await executor.close(); }
});

test('executor crash never replays a write and fresh requests recover only after a new executor starts', async () => {
  const executor = new WriteExecutor({}, { workerUrl: new URL('./fixtures/write-executor.mjs', import.meta.url) });
  try {
    await ready(executor);
    const crashed = await executor.execute(new Request('https://books.test/crash', { method: 'POST', body: '{}' }));
    assert.equal(crashed.response.status, 503);
    assert.equal((await crashed.response.json()).retryable, false);
    await delay(20);
    const recovery = await executor.execute(new Request('https://books.test/fast', { method: 'POST', body: '{}' }));
    assert.equal(recovery.response.status, 503);
    await ready(executor);
    assert.equal((await executor.execute(new Request('https://books.test/fast', { method: 'POST', body: '{}' }))).response.status, 200);
  } finally { await executor.close(); }
});

test('write execution measurements remain isolated across operations', async () => {
  const monitor = new PerformanceMonitor({ logger: () => {} });
  const results = await Promise.all([1, 3].map(count => monitor.execution(async () => { for (let i = 0; i < count; i++) { await delay(1); monitor.increment('storage_calls'); } return count; })));
  assert.deepEqual(results.map(result => result.metrics.storage_calls), [1, 3]);
});

test('ambiguous timeout retains the active write slot until the real completion arrives', async () => {
  const executor = new WriteExecutor({}, { workerUrl: new URL('./fixtures/write-executor.mjs', import.meta.url), timeoutMs: 40 });
  try {
    await ready(executor);
    const timedOut = await executor.execute(new Request('https://books.test/slow', { method: 'POST', body: '{}' }));
    assert.equal(timedOut.response.status, 503);
    assert.equal((await timedOut.response.json()).reconciliation_required, true);
    assert.equal(executor.status().pending, 1);
    const duplicate = await executor.execute(new Request('https://books.test/slow', { method: 'POST', body: '{}' }));
    assert.equal(duplicate.response.status, 503);
    assert.equal(executor.status().pending, 1);
    await delay(300);
    assert.equal(executor.status().pending, 0);
  } finally { await executor.close(); }
});
