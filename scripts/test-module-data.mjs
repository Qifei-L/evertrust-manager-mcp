import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const objects=new Map();let rev=0,mode='normal',writes=0;
const env={MANAGER_TOKEN_ENCRYPTION_KEY:'cd'.repeat(32),BUCKET:{get:async k=>objects.has(k)?{etag:objects.get(k).etag,json:async()=>JSON.parse(objects.get(k).body)}:null,put:async(k,body)=>{objects.set(k,{body,etag:String(++rev)});return {etag:String(rev)}},list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})}};
const key='40000000-0000-4000-8000-000000000001',old=globalThis.fetch;
let setting={Key:key,Date:'2025-12-31T00:00:00',Audit:{Keep:true}};
const params=[{name:'skip',in:'query',schema:{type:'integer'}},{name:'pageSize',in:'query',schema:{type:'integer'}},{name:'fields',in:'query',schema:{type:'array',items:{type:'string',enum:['Reference','Qty']}}}];
const paths={'/sales-invoice-lines':{get:{parameters:params}},'/fixed-assets':{get:{parameters:params.slice(0,2)}},'/fixed-asset-form':{post:{}},'/fixed-asset-form/{key}':{get:{},put:{}},'/lock-date-form':{post:{}},'/lock-date-form/{key}':{get:{},put:{}},'/access-tokens':{get:{}},'/custom-buttons':{get:{}}};
globalThis.fetch=async(url,opts)=>{const u=new URL(url),p=u.pathname.replace('/api2','');
 if(!p)return Response.json({paths});
 if(p==='/chart-of-accounts')return Response.json({business:{name:'Sample Use'},chartOfAccounts:[],totalRecords:0});
 if(p==='/sales-invoice-lines'){assert.equal(opts.method,'GET');const skip=Number(u.searchParams.get('skip')),size=Number(u.searchParams.get('pageSize'));assert.deepEqual(u.searchParams.getAll('fields'),['Reference','Qty']);let rows=[{reference:'A',qty:2,custom:{retain:1}},{reference:'B',qty:3},{reference:'C',qty:4}];if(mode==='budget')rows=rows.map(x=>({...x,large:'x'.repeat(1100000)}));if(mode==='repeat')return Response.json({salesInvoiceLines:[rows[0]],totalRecords:3});if(mode==='empty'&&skip)return Response.json({salesInvoiceLines:[],totalRecords:3});return Response.json({salesInvoiceLines:rows.slice(skip,skip+size),totalRecords:3});}
 if(p==='/fixed-assets')return Response.json({fixedAssets:[],totalRecords:0});
 if(p==='/fixed-asset-form'&&opts.method==='POST'){writes++;return Response.json(key);}
 if(p==='/fixed-asset-form/'+key&&opts.method==='PUT'){writes++;return Response.json(key);}
 if(p==='/fixed-asset-form/'+key)return Response.json({Key:key,Name:'Fixture asset',UnknownNative:{Preserve:true}});
 if(p==='/lock-date-form/'+key){if(opts.method==='PUT'){writes++;setting={...JSON.parse(opts.body),Key:key};return Response.json(key);}return Response.json(setting);}
 return new Response(null,{status:404});
};
async function request(path,body,user='owner'){return (await worker.fetch(new Request('https://module.test'+path,{method:'POST',headers:{Origin:'https://module.test','Content-Type':'application/json','oai-authenticated-user-id':user},body:JSON.stringify(body)}),env)).json()}
async function rpc(name,args,user){return (await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user)).result;}
try{
 const c=(await request('/api/connections',{token:'sample'})).connection.connection_id;
 let r=await rpc('list_module_interfaces',{connection_id:c});assert(!r.isError);assert(r.structuredContent.interfaces.some(x=>x.endpoint==='/sales-invoice-lines'));assert(!JSON.stringify(r.structuredContent.interfaces).includes('access-tokens'));assert(!JSON.stringify(r.structuredContent.interfaces).includes('custom-buttons'));
 const args={connection_id:c,module:'sales',endpoint:'/sales-invoice-lines',page_size:1,auto_paginate:true,query:{fields:['Reference','Qty']}};
 r=await rpc('read_module_data',args);assert(!r.isError,JSON.stringify(r));assert.equal(r.structuredContent.complete,true);assert.equal(r.structuredContent.items.length,3);assert.equal(r.structuredContent.pages_read,3);assert.deepEqual(r.structuredContent.items[0].custom,{retain:1});assert.equal(r.structuredContent.full_financial_report,false);
 r=await rpc('read_module_data',{...args,auto_paginate:false});assert.equal(r.structuredContent.complete,false);assert.equal(r.structuredContent.next_skip,1);
 r=await rpc('read_module_data',{...args,skip:2});assert.equal(r.structuredContent.complete,false);
 mode='budget';r=await rpc('read_module_data',args);assert.equal(r.structuredContent.stop_reason,'response_budget');assert.equal(r.structuredContent.next_skip,1);assert.equal(r.structuredContent.native_pages_included,false);mode='normal';
 assert((await rpc('read_module_data',{...args,page_size:101})).isError);assert((await rpc('read_module_data',{...args,max_pages:11})).isError);
 mode='repeat';r=await rpc('read_module_data',args);assert.equal(r.structuredContent.stop_reason,'repeated_page');assert.equal(r.structuredContent.complete,false);
 mode='empty';r=await rpc('read_module_data',args);assert.equal(r.structuredContent.stop_reason,'empty_page_before_total');mode='normal';
 assert((await rpc('read_module_data',{...args,endpoint:'/access-tokens'})).isError);assert((await rpc('read_module_data',{...args,module:'assets'})).isError);assert((await rpc('read_module_data',{...args,query:{fields:['Wrong']}})).isError);
 assert((await rpc('read_module_data',args,'intruder')).isError);assert.equal(writes,0);
 r=await rpc('read_module_data',{connection_id:c,module:'assets',endpoint:'/fixed-asset-form/{key}',key});assert.equal(r.structuredContent.native_pages[0].UnknownNative.Preserve,true);
 const assetRead=await rpc('get_record',{connection_id:c,resource:'fixed_assets',key});assert.equal(assetRead.structuredContent.record.Name,'Fixture asset');assert((await rpc('update_record',{connection_id:c,resource:'fixed_assets',key,fields:{Name:'Changed'}})).isError);assert.equal(writes,0);
 const read=await rpc('get_native_form_schema',{connection_id:c,endpoint:'/lock-date-form',key});const hash=read.structuredContent.field_evidence.record_hash;
 r=await rpc('update_system_setting',{connection_id:c,endpoint:'/lock-date-form',key,expected_hash:hash,fields:{UnknownSetting:1}});assert.equal(r.structuredContent.status,'pending');assert.equal(writes,0);
 r=await rpc('update_system_setting',{connection_id:c,endpoint:'/lock-date-form',key,expected_hash:hash,fields:{Date:'2026-01-31T00:00:00'}});assert.equal(r.structuredContent.status,'succeeded');assert.equal(r.structuredContent.record.Audit.Keep,true);assert.equal(writes,1);
 assert((await rpc('update_system_setting',{connection_id:c,endpoint:'/lock-date-form',key,expected_hash:hash,fields:{Date:'2026-02-28T00:00:00'}})).isError);assert.equal(writes,1);
 const contract=await rpc('get_tool_contract',{connection_id:c,tool_name:'update_system_setting'});assert.equal(contract.structuredContent.annotations.readOnlyHint,false);
 console.log('PASS Module details: declared per-module paths/parameters, raw fields, paging completeness/repeats/empty pages, keyed asset reads, excluded security endpoints, ownership, singleton hash/unknown-field/no-write guard and readback preservation.');
}finally{globalThis.fetch=old;}
