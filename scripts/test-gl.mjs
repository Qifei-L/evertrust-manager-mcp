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
 const dataset=Array.from({length:205},(_,i)=>({date:i<100?'2026-01-10':'2026-02-10',account:i%2?'Sales':'Cash',amount:i%2?-2:3,division:'A',n:i}));
 let glMode='normal',pages=[];
 const baseFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{const u=new URL(url);if(u.pathname.endsWith('/transactions')){const skip=Number(u.searchParams.get('skip')),size=Number(u.searchParams.get('pageSize'));pages.push(skip);if(glMode==='fail'&&skip)throw Error('upstream down');return Response.json({business:{name:'Alpha'},skip,totalRecords:glMode==='change'&&skip?206:205,transactions:glMode==='empty'&&skip?[]:dataset.slice(glMode==='repeat'?0:skip,(glMode==='repeat'?0:skip)+size)})}return baseFetch(url,opts)};
 const args={connection_id:c,source:'general_ledger'};
 let r=await rpc('get_transactions',args);assert(!r.error,JSON.stringify(r));assert.equal(r.data.complete,true);assert.equal(r.data.items.length,205);assert.equal(r.data.items[0].source_key,null);assert.equal(r.data.items[0].source_link_status,'unavailable_in_native_feed');assert.equal(r.data.items[0].account_link_status,'name_only');assert.deepEqual(r.data.requested_native_fields,['Account','Amount']);assert.equal(r.data.linkage.unresolved_source_rows,205);assert.deepEqual(pages,[0,100,200]);
 r=await rpc('get_transactions',{...args,from_date:'2026-02-01',filters:{division:'A'},group_by:['account','month'],sum_fields:['amount']});assert(!r.error,JSON.stringify(r));assert.equal(r.data.matched_rows,105);assert.equal(r.data.groups.reduce((s,g)=>s+g.sums.amount,0),55);
 for(const m of ['change','empty','repeat','fail']){glMode=m;r=await rpc('get_transactions',{...args,group_by:['account'],sum_fields:['amount']});assert(!r.error,JSON.stringify(r));assert.equal(r.data.complete,false);assert.equal(r.data.aggregation_performed,false);assert.deepEqual(r.data.groups,[])}
 glMode='normal';
 for(const extra of [{auto_paginate:'true'},{source:'invalid'},{skip:1},{group_by:['account'],sum_fields:['unknown']},{filters:{unknown:'x'}},{group_by:['unknown']},{auto_paginate:false,group_by:['account']}])assert((await rpc('get_transactions',{...args,...extra})).error,JSON.stringify(extra));
 assert((await rpc('get_transactions',args,'other')).error);
 r=await rpc('get_transactions',{...args,auto_paginate:false,page_size:2});assert.equal(r.data.complete,false);assert.equal(r.data.items.length,2);
 console.log('PASS GL: 205 rows/3 pages, exact filters/date/month grouping, signed sums, isolation, malformed inputs, changed totals/empty/repeated/failed page withholding aggregation.');
}finally{globalThis.fetch=original}
