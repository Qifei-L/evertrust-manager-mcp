import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const objects=new Map();let rev=0,next=100,mode='normal';
const env={MANAGER_TOKEN_ENCRYPTION_KEY:'fe'.repeat(32),BUCKET:{get:async key=>{const v=objects.get(key);return v?{etag:v.etag,json:async()=>JSON.parse(v.body)}:null},put:async(key,body)=>{objects.set(key,{body,etag:String(++rev)});return {etag:String(rev)}},delete:async key=>objects.delete(key),list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})}};
const id=n=>'30000000-0000-4000-8000-'+String(n).padStart(12,'0'),assets='4c05c221-ca57-4c7c-be62-115669302ed4';
const form='/control-account-for-inventory-items-form',rows=new Map([[id(1),{key:id(1),name:'Vehicles',code:'1031'}],[id(2),{key:id(2),name:'Ordinary',code:'9999'}]]),records=new Map([[id(1),{Key:id(1),Name:'Vehicles',Code:'1031',Group:assets,NativeSetting:{Keep:true}}]]);
const writes=[],reads=[],originalFetch=globalThis.fetch;
const spec={paths:{[form]:{post:{}},[form+'/{key}']:{get:{},put:{},delete:{}},'/inventory-item-form':{post:{requestBody:{content:{'application/json':{schema:{$ref:'#/components/schemas/Inventory'}}}}}},'/inventory-item-form/{key}':{get:{},put:{}}},components:{schemas:{Inventory:{type:'object',properties:{ItemName:{type:'string'},ControlAccount:{$ref:'#/components/schemas/Key'}}},Key:{type:'string',format:'uuid'}}}};
globalThis.fetch=async(url,opts)=>{const u=new URL(url),p=u.pathname.replace('/api2',''),token=opts.headers['X-API-KEY'];assert(['alpha','beta'].includes(token));reads.push({p,token,method:opts.method});
 if(p==='')return Response.json(mode==='unsupported'?{paths:{}}:spec);
 if(p==='/chart-of-accounts')return Response.json({business:{name:token==='alpha'?'Sample Use':'Other'},totalRecords:rows.size,chartOfAccounts:[...rows.values()]});
 if(p.startsWith(form+'/')){const key=p.split('/').at(-1);if(mode==='probe_failure'&&key===id(2))return new Response(null,{status:503});const record=records.get(key);if(!record)return new Response(null,{status:404});
  if(opts.method==='PUT'){const fields=JSON.parse(opts.body);writes.push({method:'PUT',fields,key,token});records.set(key,{...fields,Key:key});rows.set(key,{key,name:fields.Name,code:fields.Code});if(mode==='interrupt')throw Error('lost');return new Response(null,{status:204})}
  if(mode==='readback_failure'&&key!==id(1))throw Error('readback lost');if(mode==='discard'&&key!==id(1))return Response.json({...record,Name:'Discarded'});return Response.json(record);
 }
 if(p===form&&opts.method==='POST'){const fields=JSON.parse(opts.body);writes.push({method:'POST',fields,token});if(mode==='reject')return new Response(null,{status:400});const key=id(next++);records.set(key,{...fields,Key:key});rows.set(key,{key,name:fields.Name,code:fields.Code});if(mode==='interrupt')throw Error('lost');if(mode==='no_key')return new Response(null,{status:204});return Response.json(key)}
 return new Response(null,{status:404});
};
async function request(path,body,user='owner'){return (await worker.fetch(new Request('https://test.example'+path,{method:body?'POST':'GET',headers:{Origin:'https://test.example','Content-Type':'application/json','oai-authenticated-user-id':user},...(body?{body:JSON.stringify(body)}:{})}),env)).json()}
async function rpc(name,args,user='owner'){const response=await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user);const r=response.result;return {error:r.isError,data:r.structuredContent}}
try{
 const alpha=(await request('/api/connections',{token:'alpha'})).connection.connection_id,beta=(await request('/api/connections',{token:'beta'})).connection.connection_id;
 const tools=(await request('/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'})).result.tools;
 assert(!tools.some(t=>t.name==='delete_inventory_control_account'));
 assert.equal(tools.find(t=>t.name==='create_inventory_control_account').annotations.readOnlyHint,false);
 const listed=await rpc('list_inventory_control_accounts',{connection_id:alpha});assert(!listed.error);assert.equal(listed.data.items.length,1);assert.equal(listed.data.complete,true);assert.equal(listed.data.inventory_complete,false);assert.equal(writes.length,0);
 const read=await rpc('get_inventory_control_account',{connection_id:alpha,key:id(1)});assert.equal(read.data.record.Name,'Vehicles');assert.match(read.data.record_hash,/^[a-f0-9]{64}$/);
 assert((await rpc('get_inventory_control_account',{connection_id:alpha,key:id(2)})).error);assert((await rpc('list_inventory_control_accounts',{connection_id:alpha},'intruder')).error);
 for(const fields of [{Name:'Vehicles',Group:assets},{Name:'Duplicate code',Code:'9999',Group:assets},{Name:'No group'},{Name:'  ',Group:assets},{Name:'Wrong group',Group:id(2)},{Name:'Bad',Group:assets,Account:id(2)},{Name:'Bad',Group:assets,Position:-1},{Name:'Bad',Group:assets,Inactive:'yes'}])assert((await rpc('create_inventory_control_account',{connection_id:alpha,fields})).error);
 assert.equal(writes.length,0);
 const created=await rpc('create_inventory_control_account',{connection_id:alpha,fields:{Name:' Truck Bodies ',Code:'1032',Group:assets}});assert.equal(created.data.status,'succeeded');assert.equal(created.data.record.Name,'Truck Bodies');assert.equal(created.data.cache_invalidated,true);assert.equal(writes.at(-1).method,'POST');assert.equal(writes.at(-1).token,'alpha');
 assert((await rpc('create_inventory_control_account',{connection_id:alpha,fields:{Name:'Truck Bodies',Group:assets}})).error);assert.equal(writes.length,1);
 const update=await rpc('update_inventory_control_account',{connection_id:alpha,key:id(1),expected_hash:read.data.record_hash,fields:{Name:'Vehicles Updated'}});assert.equal(update.data.status,'succeeded');assert.deepEqual(update.data.record.NativeSetting,{Keep:true});assert.equal(update.data.record.Group,assets);
 const count=writes.length;assert((await rpc('update_inventory_control_account',{connection_id:alpha,key:id(1),expected_hash:read.data.record_hash,fields:{Name:'Stale'}})).error);assert.equal(writes.length,count);
 assert.equal((await rpc('update_inventory_control_account',{connection_id:alpha,key:id(1),expected_hash:update.data.record_hash,fields:{Name:'Vehicles Updated'}})).data.status,'unchanged');assert.equal(writes.length,count);
 assert((await rpc('update_inventory_control_account',{connection_id:alpha,key:id(1),fields:{Name:'Hash required'}})).error);
 const schema=await rpc('get_resource_schema',{connection_id:alpha,resource:'inventory_items'});assert(!schema.error);assert.equal(schema.data.referenced_schemas.Key.format,'uuid');assert.equal(schema.data.forms[0].methods.POST.request_schema.$ref,'#/components/schemas/Inventory');
 mode='probe_failure';const failedList=await rpc('list_inventory_control_accounts',{connection_id:alpha});assert.equal(failedList.data.complete,false);assert.equal(failedList.data.unresolved.length,1);mode='normal';
 const paged=await rpc('list_inventory_control_accounts',{connection_id:alpha,page_size:1});assert.equal(paged.data.has_more,true);assert.equal(paged.data.next_skip,1);
 const last=await rpc('list_inventory_control_accounts',{connection_id:alpha,page_size:1,skip:1});assert.equal(last.data.complete,false);assert.equal(last.data.has_more,false);
 const other=await rpc('list_inventory_control_accounts',{connection_id:beta});assert.equal(other.data.business_name,'Other');assert.equal(reads.at(-1).token,'beta');
 for(const [testMode,status]of [['interrupt','uncertain'],['reject','rejected'],['no_key','unverified'],['readback_failure','uncertain'],['discard','verification_failed']]){mode=testMode;const before=writes.length;const r=await rpc('create_inventory_control_account',{connection_id:alpha,fields:{Name:'Outcome '+testMode,Group:assets}});assert.equal(r.data.status,status,JSON.stringify(r));assert.equal(r.data.retryable,false);assert.equal(writes.length,before+1)}
 mode='unsupported';assert((await rpc('create_inventory_control_account',{connection_id:alpha,fields:{Name:'Unsupported',Group:assets}})).error);
 console.log('PASS Inventory controls: dedicated native routing; chart-only inventory disclosure; duplicate, group and field validation; hash conflicts, preserved settings, no-op; cache invalidation; rejected/uncertain/discarded writes without retry; isolated companies; schema reference discovery.');
}finally{globalThis.fetch=originalFetch}
