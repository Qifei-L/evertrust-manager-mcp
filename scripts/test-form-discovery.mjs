import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const data=new Map();let rev=0,empty=false,generic=true;
const env={MANAGER_TOKEN_ENCRYPTION_KEY:'ab'.repeat(32),BUCKET:{get:async key=>data.has(key)?{etag:data.get(key).etag,json:async()=>JSON.parse(data.get(key).body)}:null,put:async(key,body)=>{data.set(key,{body,etag:String(++rev)});return {etag:String(rev)}},list:async({prefix})=>({objects:[...data.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false})}};
const key='40000000-0000-4000-8000-000000000001',original=globalThis.fetch,requests=[];
const makeSpec=()=>({paths:{'/journal-entries':{get:{}},'/journal-entry-form':{post:{}},'/journal-entry-form/{key}':{get:{}},'/sales-invoices':{get:{}},'/sales-invoice-form':{post:{}},'/sales-invoice-form/{key}':{get:{}},'/inventory-items':{get:{}},'/inventory-item-form':{post:{requestBody:{content:{'application/json':{schema:{$ref:'#/components/schemas/Item'}}}}}},'/inventory-item-form/{key}':{get:{},put:{}},'/inventory-unit-costs':{get:{parameters:[{name:'pageSize',in:'query',schema:{type:'integer'}},{name:'skip',in:'query',schema:{type:'integer'}}]}},'/inventory-unit-cost-form':{post:{}},'/inventory-unit-cost-form/{key}':{get:{},put:{}},'/balance-sheet-form':{post:{requestBody:{content:{'application/json':{schema:{type:'object'}}}}}},'/balance-sheet-form/{key}':{get:{},put:{}}},components:{schemas:{Item:generic?{type:'object'}:{type:'object',properties:{ItemName:{type:'string'}}}}}});
globalThis.fetch=async(url,opts)=>{const p=new URL(url).pathname.replace('/api2','');requests.push({p,method:opts.method,token:opts.headers['X-API-KEY']});assert.equal(opts.method,'GET');
 if(p==='')return Response.json(makeSpec());
 if(p==='/chart-of-accounts')return Response.json({business:{name:'Sample Use'},chartOfAccounts:[],totalRecords:0});
 if(p==='/inventory-items')return Response.json({inventoryItems:empty?[]:[{key}],totalRecords:empty?0:1});
 if(p==='/inventory-item-form/'+key)return Response.json({Key:key,ItemName:'Template',SaleItemAccount:key,HasCostOfGoodsSold:true,text:'Display',UniqueName:'Display',NativeSettings:{Preserve:true}});
 if(p==='/journal-entries')return Response.json({journalEntries:[{key}],totalRecords:1});
 if(p==='/journal-entry-form/'+key)return Response.json({Key:key,Date:'2026-10-12T00:00:00',Reference:'Native',Narration:'Native sample',Lines:[{Account:key,Debit:1},{Account:key,Credit:1}]});
 if(p==='/customer-form/'+key)return Response.json({Key:key,Name:'Sample customer'});
 if(p==='/sales-invoices')return Response.json({salesInvoices:[],totalRecords:0});
 if(p==='/inventory-unit-costs')return Response.json({inventoryUnitCosts:[],totalRecords:0});
 return new Response(null,{status:404});
};
async function request(path,body,user='owner'){return (await worker.fetch(new Request('https://test.example'+path,{method:'POST',headers:{Origin:'https://test.example','Content-Type':'application/json','oai-authenticated-user-id':user},body:JSON.stringify(body)}),env)).json()}
async function rpc(name,args,user){return (await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user)).result}
try{
 const c=(await request('/api/connections',{token:'sample-test'})).connection.connection_id;
 const args={connection_id:c,resource:'inventory_items'};
 let r=await rpc('get_resource_schema',args);assert(!r.isError);assert.equal(r.structuredContent.field_evidence.status,'existing_record');assert.equal(r.structuredContent.field_evidence.native_template.ItemName,'Template');assert(!('Key' in r.structuredContent.field_evidence.native_template));assert(!('text' in r.structuredContent.field_evidence.native_template));assert.equal(r.structuredContent.field_evidence.new_form_defaults,false);
 empty=true;r=await rpc('get_resource_schema',args);assert.equal(r.structuredContent.field_evidence.status,'pending');
 r=await rpc('get_resource_schema',{...args,key});assert.equal(r.structuredContent.field_evidence.status,'existing_record');
 r=await rpc('get_resource_schema',{...args,include_template:false});assert.equal(r.structuredContent.field_evidence.status,'not_requested');
 r=await rpc('get_native_form_schema',{connection_id:c,endpoint:'/balance-sheet-form'});assert.equal(r.structuredContent.first_create_status,'sample_verified_minimal_fields');assert.deepEqual(r.structuredContent.verified_field_contract.schema.properties.Periods.items.required,['Date']);assert.equal(r.structuredContent.verified_field_contract.defaults_verified,false);

 r=await rpc('get_form_template',{connection_id:c,endpoint:'/inventory-item-form',key});assert.equal(r.structuredContent.template.status,'tested_minimal_template');assert(!JSON.stringify(r.structuredContent.template).includes('\"Template\"'));assert(r.structuredContent.template.fields.some(f=>f.path==='ItemName'&&f.evidence==='sample_storage_verified'));
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/inventory-item-form',fields:{ItemName:'New name'}});assert.equal(r.structuredContent.status,'ready_for_storage_review');assert.equal(r.structuredContent.writes_performed,0);
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/inventory-item-form',fields:{ItemName:'New name',DefaultQty:2}});assert.equal(r.structuredContent.status,'pending');assert(r.structuredContent.issues.some(x=>x.code==='sample_discarded_field'));
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/balance-sheet-form',fields:{Periods:[{Date:'2026-10-12T00:00:00'}],AccountCodes:true}});assert.equal(r.structuredContent.status,'ready_for_storage_review');
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/balance-sheet-form',fields:{Date:'2026-10-12T00:00:00'}});assert.equal(r.structuredContent.status,'pending');assert(r.structuredContent.issues.some(x=>x.path==='Periods'&&x.code==='missing_template_slot'));assert(r.structuredContent.issues.some(x=>x.code==='sample_discarded_field'));
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/balance-sheet-form',fields:{Periods:[{Date:'2026-02-30T00:00:00'}]}});assert(r.structuredContent.issues.some(x=>x.code==='invalid_native_datetime'));
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/balance-sheet-form',fields:{Periods:[]}});assert(r.structuredContent.issues.some(x=>x.code==='empty_required_array'));
 assert((await rpc('get_form_template',{connection_id:c,endpoint:'/access-token-form'})).isError);
 assert((await rpc('get_form_template',{connection_id:c,endpoint:'/inventory-item-form'},'intruder')).isError);
 generic=false;r=await rpc('get_native_form_schema',{connection_id:c,endpoint:'/inventory-item-form'});assert.equal(r.structuredContent.first_create_status,'schema_fields_available');

 const invoice={IssueDate:'2026-10-12T00:00:00',Reference:'TEST-PRECISION',Customer:key,Lines:[{Item:key,Account:key,Qty:2,SalesUnitPrice:59745.455},{Item:key,Account:key,Qty:1,SalesUnitPrice:0}]};
 let start=requests.length;r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/sales-invoice-form',fields:invoice});assert.equal(r.structuredContent.status,'ready_for_storage_review');assert.equal(r.structuredContent.candidate_fields.Lines[0].SalesUnitPrice,59745.455);assert.equal(requests.slice(start).filter(x=>x.p==='/inventory-item-form/'+key).length,1);assert(r.structuredContent.relation_checks.some(x=>x.status==='native_item_account_verified'));
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/sales-invoice-form',fields:{...invoice,Lines:[{...invoice.Lines[0],Account:'40000000-0000-4000-8000-000000000002'}]}});assert.equal(r.structuredContent.status,'pending');assert(r.structuredContent.issues.some(x=>x.code==='posting_account_requires_native_validation'));
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/sales-invoice-form',fields:{...invoice,Lines:[{Qty:1,SalesUnitPrice:'59745.455'}]}});assert(r.structuredContent.issues.some(x=>x.code==='wrong_type'));

 const journal={Date:'2026-10-12T00:00:00',Reference:'NEW-JE',Narration:'Journal template test',Lines:[{Account:key,Debit:1.23},{Account:key,Credit:1.23}]};
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/journal-entry-form',fields:journal});assert.equal(r.structuredContent.status,'ready_for_storage_review');
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/journal-entry-form',fields:{...journal,Lines:[{Account:key,Debit:1.23},{Account:key,Credit:1.24}]}});assert.equal(r.structuredContent.status,'pending');assert(r.structuredContent.issues.some(x=>x.code==='unbalanced_journal'));
 r=await rpc('prepare_form_create',{connection_id:c,endpoint:'/journal-entry-form',fields:{...journal,Lines:[{Account:key,Debit:1.23,Credit:1.23},{Account:key}]}});assert(r.structuredContent.issues.some(x=>x.code==='both_debit_and_credit'));assert(r.structuredContent.issues.some(x=>x.code==='missing_debit_or_credit'));
 const n=requests.length;assert((await rpc('get_native_form_schema',{connection_id:c,endpoint:'/access-token-form'})).isError);assert.equal(requests.length,n);
 assert((await rpc('get_resource_schema',args,'intruder')).isError);
 r=await rpc('inspect_inventory_costing',{connection_id:c});assert(!r.isError);assert.equal(r.structuredContent.native_recalculation.implemented,false);assert.equal(r.structuredContent.native_recalculation.status,'pending');assert.equal(r.structuredContent.unit_cost_records.status,'read');
 r=await rpc('get_tool_contract',{connection_id:c,tool_name:'find_record'});assert.equal(r.structuredContent.input_schema.properties.max_pages.maximum,10);assert.match(r.structuredContent.description,/max_pages: integer 1\.\.10/);
 r=await rpc('find_record',{connection_id:c,resource:'sales_invoices',reference:'test',max_pages:20});assert(r.isError);assert.match(r.structuredContent.error.message,/maximum 10/);
 assert(requests.every(x=>x.method==='GET'));assert(!requests.some(x=>x.p.includes('00000000-0000-0000-0000-000000000000')));
 console.log('PASS Form discovery: native schemas; same-company templates; empty-first-create Pending; sanitized identity fields; permission/allowlist guards; no guessed IDs or writes; costing not misrepresented; numeric contract and errors; value-free templates and date/required/rejected-path previews.');
}finally{globalThis.fetch=original}
