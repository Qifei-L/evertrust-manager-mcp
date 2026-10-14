import assert from 'node:assert/strict';
import worker, {isReadOnlyTool} from '../worker/index.js';
const id=n=>'30000000-0000-4000-8000-'+String(n).padStart(12,'0');
const objects=new Map(), records=new Map();let rev=0,mode='normal',writes=[],failCheckpoint=false;
const env={MANAGER_TOKEN_ENCRYPTION_KEY:'cd'.repeat(32),BUCKET:{
 get:async key=>{const x=objects.get(key);return x?{etag:x.etag,json:async()=>JSON.parse(x.body)}:null},
 put:async(key,body,opts={})=>{const old=objects.get(key);if(opts.onlyIf?.etagMatches!==undefined&&old?.etag!==opts.onlyIf.etagMatches)return null;if(opts.onlyIf?.etagDoesNotMatch==='*'&&old)return null;
   if(failCheckpoint&&key.startsWith('record-changes/')&&writes.length){failCheckpoint=false;throw Error('checkpoint unavailable');}
   const etag=String(++rev);objects.set(key,{body,etag});return {etag};},
 list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}),delete:async key=>objects.delete(key)
}};
function journal(n,ref,amount=10){return {Key:id(n),Date:'2026-01-01T00:00:00',Reference:ref,Narration:'Original '+n,CustomFields:{Keep:'retain'},Lines:[{Account:id(90),Debit:amount},{Account:id(90),Credit:amount}]};}
for(let n=1;n<=24;n++)records.set(id(n),journal(n,n===2||n===3?'DUP':'R'+n));
const original=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{
 const u=new URL(url),path=u.pathname.replace(/^\/api2/,''),method=opts.method;
 assert.equal(opts.redirect,'manual');
 if(path==='')return Response.json({paths:{'/transactions':{get:{parameters:[{in:'query',name:'skip',schema:{type:'integer',minimum:0}},{in:'query',name:'pageSize',schema:{type:'integer',minimum:1}}]}}}});
 if(path==='/chart-of-accounts')return Response.json({business:{name:opts.headers['X-API-KEY']==='beta'?'Beta':'Alpha'},totalRecords:3,chartOfAccounts:[{key:id(90),code:'1010',name:'Cash'},{key:id(91),name:'Duplicated'},{key:id(92),name:'Duplicated'}]});
 if(path==='/transactions'){
   if(mode==='ledger_fail_after'&&writes.length)throw Error('GL temporarily unavailable');
   const rows=[...records.values()].flatMap(r=>r.Lines.map(l=>({date:r.Date.slice(0,10),account:l.Account===id(90)?'1010 - Cash':'Duplicated',bankOrCashAccount:'Bank transaction metadata',amount:(l.Debit??0)-(l.Credit??0)})));
   rows.push({date:'2026-01-01',account:'Duplicated',amount:0});
   const skip=Number(u.searchParams.get('skip')),size=Number(u.searchParams.get('pageSize'));
   return Response.json({skip,totalRecords:rows.length,transactions:rows.slice(skip,skip+size)});
 }
 if(path==='/journal-entries'){
   const values=[...records.values()].map(r=>({key:r.Key,reference:r.Reference,date:r.Date})),skip=Number(u.searchParams.get('skip')),size=Number(u.searchParams.get('pageSize'));
   return Response.json({totalRecords:values.length,journalEntries:values.slice(skip,skip+size)});
 }
 if(path.startsWith('/journal-entry-form/')){
   const key=path.split('/').at(-1),record=records.get(key);
   if(!record)return new Response(null,{status:404});
   if(method==='GET')return Response.json(record);
   writes.push({method,key});
   if(mode==='reject')return new Response(null,{status:422});
   if(method==='PUT')records.set(key,{...JSON.parse(opts.body),Key:key});
   if(method==='DELETE')records.delete(key);
   if(mode==='interrupt')throw Error('response lost after native write');
   if(mode==='discard'&&method==='PUT')records.get(key).Narration='discarded';
   return new Response(null,{status:204});
 }
 return new Response(null,{status:404});
};
async function request(path,body,user='owner'){
 return (await worker.fetch(new Request('https://batch.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://batch.test','Content-Type':'application/json','oai-authenticated-user-id':user},...(body?{body:JSON.stringify(body)}:{})}),env)).json();
}
async function rpc(name,args,user){const r=(await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user)).result;assert.deepEqual(r.structuredContent,JSON.parse(r.content[0].text));return {error:r.isError,data:r.structuredContent};}
const resource='journal_entries';let company;
async function change(n,fields={Narration:'Corrected '+n},operation='update'){
 const r=await rpc('get_record',{connection_id:company,resource,key:id(n)});assert(!r.error);
 return {operation,resource,key:id(n),expected_hash:r.data.record_hash,...(operation==='update'?{fields}:{})};
}
async function prepare(changes,check){const r=await rpc('prepare_record_changes',{connection_id:company,changes,...(check?{ledger_check:check}:{})});assert(!r.error,JSON.stringify(r));return r.data;}
const apply=task=>rpc('apply_record_changes',{connection_id:company,task_id:task.task_id,preview_hash:task.preview_hash});
try{
 company=(await request('/api/connections',{token:'alpha'})).connection.connection_id;
 const beta=(await request('/api/connections',{token:'beta'})).connection.connection_id;
 assert(isReadOnlyTool('prepare_record_changes'));assert(isReadOnlyTool('get_record_change_task'));assert(!isReadOnlyTool('apply_record_changes'));
 let r=await rpc('get_coa_item',{connection_id:company,key:id(90)});assert(r.error);assert.equal(r.data.error.code,'INVALID_ARGUMENT');assert(r.data.error.argument_details.issues.some(x=>x.code==='missing_required_argument'&&x.path==='item_key'));assert(r.data.error.argument_details.issues.some(x=>x.suggestion==='Use item_key, not key.'));
 r=await rpc('resolve_record_links',{connection_id:company,lookups:[{resource,reference:'R1'},{resource,reference:'DUP'},{resource,key:id(4)}]});assert(!r.error);assert.equal(r.data.items[0].key,id(1));assert.equal(r.data.items[1].status,'ambiguous');assert.equal(r.data.items[1].key,null);assert.equal(r.data.items[2].key,id(4));assert(r.data.items.every(x=>x.source_link_status==='lookup_only_not_native_transaction_identity'));
 r=await rpc('get_transactions',{connection_id:company,source:'general_ledger',resolve_account_candidates:true});assert(!r.error);assert.equal(r.data.items[0].account_key,null);assert.equal(r.data.items[0].account_resolution.candidate_key,id(90));assert.equal(r.data.items.at(-1).account_resolution.status,'ambiguous_chart_label');assert.equal(r.data.items[0].source_key,null);
 const check={group_by:['account'],sum_fields:['amount'],expect_unchanged:true};
 let task=await prepare([await change(1),await change(4,undefined,'delete')],check);assert.equal(writes.length,0);assert.equal(task.changes[0].before.Narration,'Original 1');assert.equal(task.changes[0].after.CustomFields.Keep,'retain');assert.equal(task.changes[1].after,null);
 assert((await rpc('apply_record_changes',{connection_id:company,task_id:task.task_id,preview_hash:'0'.repeat(64)})).error);
 assert((await rpc('get_record_change_task',{connection_id:beta,task_id:task.task_id})).error);
 assert((await rpc('get_record_change_task',{connection_id:company,task_id:task.task_id},'intruder')).error);
 r=await apply(task);assert(!r.error,JSON.stringify(r));assert.equal(r.data.status,'completed');assert.equal(r.data.results.length,2);assert.equal(r.data.ledger_verification.unchanged,true);assert.equal(records.get(id(1)).Narration,'Corrected 1');assert(!records.has(id(4)));const count=writes.length;
 assert.equal((await apply(task)).data.status,'completed');assert.equal(writes.length,count);
 task=await prepare([await change(5),await change(6)]);records.get(id(6)).Narration='Concurrent edit';r=await apply(task);assert(r.error);assert.equal(r.data.status,'stopped_conflict');assert.equal(writes.length,count);assert.equal(records.get(id(5)).Narration,'Original 5');
 const dup=await change(7);assert((await rpc('prepare_record_changes',{connection_id:company,changes:[dup,dup]})).error);assert((await rpc('prepare_record_changes',{connection_id:company,changes:[{...dup,operation:'create'}]})).error);
 assert((await rpc('prepare_record_changes',{connection_id:company,changes:[dup],ledger_check:{...check,absolute_tolerance:-1}})).error);
 task=await prepare([await change(7),await change(8)]);mode='interrupt';r=await apply(task);mode='normal';assert(r.error);assert.equal(r.data.status,'stopped');assert.equal(r.data.results.length,1);assert.equal(r.data.results[0].status,'uncertain');assert.equal(records.get(id(8)).Narration,'Original 8');const interruptedCount=writes.length;assert((await apply(task)).error);assert.equal(writes.length,interruptedCount);
 task=await prepare([await change(9),await change(10)]);mode='discard';r=await apply(task);mode='normal';assert(r.error);assert.equal(r.data.results[0].status,'verification_failed');assert.equal(records.get(id(10)).Narration,'Original 10');
 task=await prepare([await change(11)]);const concurrentCount=writes.length;await Promise.all([apply(task),apply(task)]);assert.equal(writes.length,concurrentCount+1);
 task=await prepare([await change(12)]);mode='reject';r=await apply(task);mode='normal';assert(r.error);assert.equal(r.data.results[0].status,'rejected');
 writes=[];task=await prepare([await change(13),await change(14)]);failCheckpoint=true;r=await apply(task);assert(r.error);assert.equal(writes.length,1);const nativeCount=writes.length;r=await apply(task);assert(r.error);assert.equal(writes.length,nativeCount);assert.equal(records.get(id(14)).Narration,'Original 14');
 writes=[];task=await prepare([await change(15)],check);mode='ledger_fail_after';r=await apply(task);mode='normal';assert(r.error);assert.equal(r.data.status,'completed_review_required');assert.equal(r.data.results[0].verified,true);const verifiedCount=writes.length;assert((await apply(task)).error);assert.equal(writes.length,verifiedCount);
 const imbalance={Lines:[{Account:id(90),Debit:100},{Account:id(91),Credit:100}]};task=await prepare([await change(16,imbalance)],check);r=await apply(task);assert(r.error);assert.equal(r.data.ledger_verification.unchanged,false);assert.equal(r.data.status,'completed_review_required');
 task=await prepare([await change(17)]);const realNow=Date.now,expiredCount=writes.length;try{Date.now=()=>realNow()+25*60*60*1000;r=await apply(task);assert(r.error);assert.equal(r.data.error.code,'CONFLICT');}finally{Date.now=realNow;}assert.equal(writes.length,expiredCount);
 for(let n=100;n<220;n++)records.set(id(n),journal(n,'EXTRA'+n));
 r=await rpc('resolve_record_links',{connection_id:company,lookups:[{resource,reference:'R1',max_pages:1}]});assert(!r.error);assert.equal(r.data.items[0].status,'incomplete');assert.equal(r.data.items[0].key,null);assert.equal(r.data.items[0].uniqueness_verified,false);
 assert([...objects.entries()].filter(([k])=>k.startsWith('record-changes/')).every(([,v])=>!v.body.includes('Corrected')&&!v.body.includes('Original')));
 console.log('PASS record changes: explicit native lookups, ambiguous candidates, structured validation errors, two-company/user isolation, preview/no writes, hashes/CAS, update/delete verification, unchanged ledger totals, duplicate replay prevention, concurrent apply, preflight conflicts, interrupted/rejected/discarded writes, durable crash checkpoint and failed/mismatched ledger checks. No real companies accessed.');
}finally{globalThis.fetch=original;}
