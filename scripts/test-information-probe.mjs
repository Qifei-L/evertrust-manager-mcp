import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const objects=new Map();let seq=0;
const env={MANAGER_TOKEN_ENCRYPTION_KEY:'ef'.repeat(32),BUCKET:{get:async k=>{const x=objects.get(k);return x?{etag:x.etag,json:async()=>JSON.parse(x.body)}:null},put:async(k,body)=>{objects.set(k,{body,etag:String(++seq)});return {etag:String(seq)}},list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})}};
const key='20000000-0000-4000-8000-000000000001';
let company='Alpha',record={Name:'Alpha',Address:'Old address',CustomFields:{TaxID:'KEEP'},Other:'preserve'},mode='normal',keyed=false;
const nativeRow={date:'2026-01-01',account:key,balanceSheetAccount:key,amount:12.34,unknownNativeField:{keep:true}};
const requests=[];let writes=0;
const schema={type:'object',properties:{Name:{type:'string'},Address:{type:'string'},ReadOnlyValue:{type:'string',readOnly:true}}};
const parameter=(name,schema)=>({in:'query',name,schema});
function spec(){return {paths:{
 '/transactions':{get:{parameters:[parameter('skip',{type:'integer',minimum:0}),parameter('pageSize',{type:'integer',minimum:1}),parameter('fields',{type:'array',items:{type:'string',enum:['Account','Amount']}})]}},
 '/general-ledger-summary-view':{get:{parameters:[parameter('key',{type:'string',format:'uuid'})]}},
 '/access-token-form':{get:{},put:{}},'/unrelated-view':{get:{}},
 ['/business-details-form'+(keyed?'/{key}':'')]:{get:{},put:{requestBody:{content:{'application/json':{schema}}}}}
 }}}
const original=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{const u=new URL(url),path=u.pathname.replace(/^\/api2/,'');requests.push({path,method:opts.method,query:[...u.searchParams]});assert.equal(opts.redirect,'manual');assert.equal(opts.headers['X-API-KEY'],'alpha');
 if(path==='')return Response.json(spec());
 if(path==='/chart-of-accounts')return Response.json({business:{name:company},totalRecords:1,chartOfAccounts:[{key,name:'Cash'}]});
 if(path==='/transactions')return Response.json({transactions:[nativeRow],totalRecords:2});
 if(path==='/general-ledger-summary-view')return Response.json({rows:[{name:'Cash',value:12.34}]});
 if(path==='/business-details-form'+(keyed?'/'+key:'')){
  if(opts.method==='PUT'){writes++;const body=JSON.parse(opts.body);if(mode==='reject')return new Response(null,{status:400});record={...body,...(keyed?{Key:key}:{})};company=record.Name;if(mode==='discard')record.Address='Discarded';if(mode==='interrupt')throw Error('lost response');return new Response(null,{status:204})}
  return Response.json(record);
 }
 return new Response(null,{status:404});
};
async function request(path,body,user='owner'){return (await worker.fetch(new Request('https://probe.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://probe.test','Content-Type':'application/json','oai-authenticated-user-id':user},...(body?{body:JSON.stringify(body)}:{})}),env)).json()}
async function rpc(name,args,user='owner'){const x=(await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user)).result;assert.deepEqual(x.structuredContent,JSON.parse(x.content[0].text));return {error:!!x.isError,data:x.structuredContent}}
try{
 const c=(await request('/api/connections',{token:'alpha'})).connection.connection_id;
 const discovery=await rpc('inspect_accounting_interfaces',{connection_id:c});assert(!discovery.error);assert(discovery.data.path_catalogue.some(x=>x.endpoint==='/access-token-form'));assert(!discovery.data.interfaces.some(x=>x.endpoint.includes('access-token')));assert(discovery.data.interfaces.some(x=>x.endpoint==='/transactions'));
 const probe=await rpc('probe_accounting_endpoint',{connection_id:c,endpoint:'/transactions',query:{pageSize:1,skip:0,fields:['Account','Amount']}});assert(!probe.error);assert.deepEqual(probe.data.data.transactions[0],nativeRow);assert.equal(probe.data.upstream_probed,true);assert.equal(probe.data.full_report,false);assert.equal(probe.data.data.totalRecords,2);
 assert(!requests.some(x=>x.method!=='GET'));
 for(const args of [{endpoint:'/access-token-form'},{endpoint:'/unrelated-view'},{endpoint:'/transactions',query:{unknown:'x'}},{endpoint:'/transactions',query:{pageSize:101}},{endpoint:'/transactions',query:{fields:['Secret']}},{endpoint:'/transactions',key}]){
  const count=requests.filter(x=>x.path===args.endpoint).length;assert((await rpc('probe_accounting_endpoint',{connection_id:c,...args})).error);assert.equal(requests.filter(x=>x.path===args.endpoint).length,count);
 }
 assert((await rpc('probe_accounting_endpoint',{connection_id:c,endpoint:'/transactions'},'stranger')).error);
 assert((await rpc('save_report_definition',{connection_id:c,endpoint:'/transactions',fields:{Name:'bypass'}})).error);
 const view=await rpc('probe_accounting_endpoint',{connection_id:c,endpoint:'/general-ledger-summary-view',query:{key}});assert(!view.error);assert.equal(view.data.data.rows[0].value,12.34);
 let info=await rpc('get_business_information',{connection_id:c});assert(!info.error);assert.equal(info.data.update_supported,true);
 assert((await rpc('update_business_information',{connection_id:c,expected_hash:'0'.repeat(64),fields:{Address:'Stale'}})).error);assert.equal(writes,0);
 for(const fields of [{MadeUp:'x'},{ReadOnlyValue:'x'},{Name:''},{Key:key}])assert((await rpc('update_business_information',{connection_id:c,expected_hash:info.data.record_hash,fields})).error);
 assert.equal(writes,0);
 let changed=await rpc('update_business_information',{connection_id:c,expected_hash:info.data.record_hash,fields:{Address:'New address',CustomFields:{TaxID:'UPDATED'}}});assert.equal(changed.data.status,'succeeded');assert.equal(record.Other,'preserve');assert.equal(record.Name,'Alpha');
 const count=writes;assert.equal((await rpc('update_business_information',{connection_id:c,expected_hash:changed.data.record_hash,fields:{Address:'New address'}})).data.status,'unchanged');assert.equal(writes,count);
 changed=await rpc('update_business_information',{connection_id:c,expected_hash:changed.data.record_hash,fields:{Name:'Alpha renamed'}});assert.equal(changed.data.status,'succeeded');assert.equal(changed.data.connection_name_refreshed,true);assert(!(await rpc('get_business_information',{connection_id:c})).error);
 mode='discard';info=await rpc('get_business_information',{connection_id:c});changed=await rpc('update_business_information',{connection_id:c,expected_hash:info.data.record_hash,fields:{Address:'Not stored'}});assert.equal(changed.data.status,'verification_failed');assert.equal(changed.data.verified,false);
 mode='interrupt';info=await rpc('get_business_information',{connection_id:c});const beforeWrites=writes;changed=await rpc('update_business_information',{connection_id:c,expected_hash:info.data.record_hash,fields:{Address:'Uncertain'}});assert.equal(changed.data.status,'uncertain');assert.equal(writes,beforeWrites+1);assert.equal(changed.data.retryable,false);
 mode='normal';keyed=true;record.Key=key;assert((await rpc('get_business_information',{connection_id:c})).error);info=await rpc('get_business_information',{connection_id:c,key});assert(!info.error);changed=await rpc('update_business_information',{connection_id:c,key,expected_hash:info.data.record_hash,fields:{Address:'Keyed'}});assert.equal(changed.data.status,'succeeded');
 const listed=(await request('/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'})).result.tools;assert.equal(listed.find(x=>x.name==='update_business_information').annotations.readOnlyHint,false);assert.equal(listed.find(x=>x.name==='probe_accounting_endpoint').annotations.readOnlyHint,true);
 console.log('PASS: native read diagnostics, route/query guards, preserved ledger IDs, caller isolation, Business Details hashes/merge/rename/read-back/no retries and keyed forms.');
}finally{globalThis.fetch=original}
