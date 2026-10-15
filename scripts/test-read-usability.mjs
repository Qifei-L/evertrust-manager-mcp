import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const env={};
async function rpc(method,params){return (await (await worker.fetch(new Request('https://test/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'owner'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env)).json()).result;}
const inventory=await rpc('tools/list'),tools=inventory.tools;
assert(JSON.stringify(inventory).length<300000,'tool catalogue must stay below 300k characters without hiding tools');
for(const name of ['get_transactions','get_coa_structure','resolve_record_links','get_tool_contract','get_financial_report_data','apply_coa_changes'])assert(tools.some(t=>t.name===name));
const gl=tools.find(t=>t.name==='get_transactions');assert(gl.description.startsWith('For compact GL totals'));assert.equal(gl.inputSchema.properties.max_output_chars.default,60000);
const structure=tools.find(t=>t.name==='get_coa_structure');assert.equal(structure.inputSchema.properties.page_size.maximum,100);
const initialized=await rpc('initialize',{});assert(initialized.instructions.indexOf('## Quick tool selection')<1000);
assert(initialized.instructions.includes('native_record_not_found'));
console.log(`PASS read usability: ${tools.length} tools retained, catalogue ${JSON.stringify(inventory).length} characters, grouping examples and early workflow routing.`);
