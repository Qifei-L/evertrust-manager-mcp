import {readFileSync,writeFileSync} from 'node:fs';
const skill=readFileSync(new URL('../skills/evertrust-books-accounting/SKILL.md',import.meta.url),'utf8');
const source=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
writeFileSync(new URL('../worker/accounting-skill.js',import.meta.url),'export default '+JSON.stringify(skill)+';\n');
writeFileSync(new URL('../dist/server/index.js',import.meta.url),source.replace('import ACCOUNTING_SKILL from "./accounting-skill.js";', 'const ACCOUNTING_SKILL='+JSON.stringify(skill)+';'));
