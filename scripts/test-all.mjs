import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const cases = readdirSync(new URL('./', import.meta.url)).filter(name => /^test-.*\.mjs$/.test(name) && name !== 'test-all.mjs').sort();
for (const args of [['--test', 'tests/railway.test.mjs', 'tests/execution.test.mjs', 'tests/oauth.test.mjs'], ...cases.map(name => [`scripts/${name}`])]) {
  console.log(`Running ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
