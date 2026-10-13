import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const origin='https://coa.test',objects=new Map();let rev=0,failCheckpoint=false;
const env={MANAGER_TOKEN_ENCRYPTION_KEY:'cd'.repeat(32),BUCKET:{get:async k=>{const o=objects.get(k);return o?{etag:o.etag,json:async()=>JSON.parse(o.value)}:null},put:async(k,value,opt)=>{const old=objects.get(k);if(opt?.onlyIf?.etagMatches&&old?.etag!==opt.onlyIf.etagMatches)return null;if(opt?.onlyIf?.etagDoesNotMatch==='*'&&old)return null;if(failCheckpoint&&k.startsWith('coa-tasks/')){failCheckpoint=false;throw Error('checkpoint unavailable')}const etag=String(++rev);objects.set(k,{value,etag});return {etag}},delete:async k=>objects.delete(k),list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})}};
const key=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const roots={bs:key(90),pl:key(91)},g1=key(1),g2=key(2),a1=key(3),a2=key(4),p1=key(5),pg=key(6),a3=key(7),a4=key(8);
const entities=new Map([
[g1,{kind:'balance_sheet_group',form:{Key:g1,id:g1,Name:'Current assets',Group:roots.bs,Position:1}}],
[g2,{kind:'balance_sheet_group',form:{Key:g2,id:g2,Name:'Other assets',Group:roots.bs,Position:2}}],
[a1,{kind:'balance_sheet_account',form:{Key:a1,id:a1,Name:'Cash',Code:'1000',Group:g1,Position:1,HasDefaultTaxCode:true,TaxCodeEnabled:true}}],
[a2,{kind:'balance_sheet_account',form:{Key:a2,id:a2,Name:'Bank',Code:'1001',Group:g1,Position:2}}],
[p1,{kind:'profit_loss_account',form:{Key:p1,id:p1,Name:'Wages',Code:'6000',Group:pg,Position:1}}],
[pg,{kind:'profit_loss_group',form:{Key:pg,id:pg,Name:'Payroll',Group:roots.pl,Position:1,Type:2}}],
[a3,{kind:'balance_sheet_account',form:{Key:a3,id:a3,Name:'Deposit',Code:'1002',Group:g1,Position:3}}],
[a4,{kind:'balance_sheet_account',form:{Key:a4,id:a4,Name:'Reserve',Code:'1003',Group:g1,Position:4}}]]);
const routes={balance_sheet_account:'/balance-sheet-account-form',profit_loss_account:'/profit-and-loss-statement-account-form',balance_sheet_group:'/balance-sheet-group-form',profit_loss_group:'/profit-and-loss-statement-group-form'};
const originalFetch=globalThis.fetch,writes=[];let failVerify=false,throwAfterWrite=false,triggerCheckpoint=false;
let omitDefaults=false,mismatchReadName=null;
function responseForm(e){const f={...e.form};if(omitDefaults){if(f.Position===0)delete f.Position;if(f.Type===0)delete f.Type;if(f.Group===null)delete f.Group}if(f.Name===mismatchReadName)f.Position=(f.Position??0)+1;return {...f,NameWithCode:(e.form.Code?e.form.Code+' - ':'')+e.form.Name,text:e.form.Name,UniqueName:e.form.Name}}
globalThis.fetch=async(url,opt)=>{const u=new URL(url),path=u.pathname.replace(/^\/api2/,'');assert.equal(opt.redirect,'manual');if(path==='')return Response.json({paths:Object.fromEntries(Object.values(routes).map(p=>[p+'/{key}',{get:{},put:{requestBody:{content:{'application/json':{schema:{type:'object',properties:{Key:{type:'string'},id:{type:'string'},Name:{type:'string'},Code:{type:'string'},Group:{type:'string'},Position:{type:'integer'},Type:{type:'integer'}},required:['Name','Group']}}}}}}]))});if(path==='/chart-of-accounts')return Response.json({business:{name:opt.headers['X-API-KEY']==='beta'?'Beta':'Alpha'},totalRecords:entities.size,chartOfAccounts:[...entities].map(([key,e])=>({key,name:e.form.Name,code:e.form.Code??null}))});const id=path.split('/').at(-1);let e=entities.get(id);if(!e&&opt.method==='PUT'){const kind=Object.keys(routes).find(k=>routes[k]+'/'+id===path);if(kind){e={kind,form:{}};entities.set(id,e)}}if(!e||routes[e.kind]+'/'+id!==path)return new Response(null,{status:404});if(opt.method==='PUT'){const d=JSON.parse(opt.body);writes.push({id,data:d});e.form={Key:id,id,...d};if(triggerCheckpoint){failCheckpoint=true;triggerCheckpoint=false}if(throwAfterWrite){throwAfterWrite=false;throw Error('network interrupted')}if(failVerify)e.failRead=true;return new Response(null,{status:200})}if(e.failRead){e.failRead=false;failVerify=false;throw Error('verification unavailable')}return Response.json(responseForm(e))};
async function api(path,body,user='owner'){const r=await worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,'oai-authenticated-user-id':user},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,data:await r.json()}}
async function rpc(name,args={},user='owner'){const d=await api('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user);const result=d.data.result;return {error:result.isError,value:JSON.parse(result.content[0].text.startsWith('{')?result.content[0].text:JSON.stringify(result.content[0].text))}}
const c=(await api('/api/connections',{token:'alpha'})).data.connection.connection_id;
const change=(id,kind,set)=>({item_key:id,kind,set});
async function prepare(changes){const r=await rpc('prepare_coa_edit_task',{connection_id:c,changes});assert.equal(r.error,false,String(r.value));return r.value}
async function run(t){return rpc('execute_coa_edit_task',{task_id:t.task_id,approval_hash:t.approval_hash})}

const name=await rpc('prepare_coa_sync',{connection_id:c,items:[{kind:'balance_sheet_account',set:{name:'2026 - Special reserve',code:'9999',group_key:g1}}],detail:true});
assert.equal(name.value.changes[0].after.Name,'2026 - Special reserve');
const error=await rpc('prepare_coa_sync',{connection_id:c,rows:[{name:'Cash',code:'1000',report:'BS',type:'Account',kind:'profit_loss_account'}],detail:true});
assert.equal(error.value.status,'needs_input');
entities.get(g2).form.Group=g1;
const t=await rpc('prepare_coa_sync',{connection_id:c,items:[{item_key:g1,kind:'balance_sheet_group',set:{group_key:g2}},{item_key:g2,kind:'balance_sheet_group',set:{group_key:roots.bs}}],detail:true});
const execute=await rpc('execute_coa_sync',{task_id:t.value.task_id,approval_hash:t.value.approval_hash,detail:true});
assert.equal(t.value.changes[0].item_key,g2);assert.equal(execute.value.status,'completed');assert(execute.value.changes.every(x=>x.status==='succeeded'));console.log('PASS audit regression: exact numeric-prefix name, conflicting classifications, safe group-move order without temporary changes.');
globalThis.fetch=originalFetch;
