import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const objects=new Map();let version=0,mode='normal';
const env={MANAGER_TOKEN_ENCRYPTION_KEY:'ea'.repeat(32),BUCKET:{get:async k=>objects.has(k)?{etag:objects.get(k).etag,json:async()=>JSON.parse(objects.get(k).body)}:null,put:async(k,body)=>{objects.set(k,{body,etag:String(++version)});return {etag:String(version)}},delete:async k=>objects.delete(k),list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})}};
const key='019fa2b6-97c6-7d0a-a6d7-a0c39ee5989a',other='019fa2b4-855a-7d41-9f42-559146d7666b',account='45fbc769-10b4-4924-bbf9-641c79e076fd';
const docs={sales_invoices:['sales-invoices','sales-invoice-form','salesInvoices'],purchase_invoices:['purchase-invoices','purchase-invoice-form','purchaseInvoices'],credit_notes:['credit-notes','credit-note-form','creditNotes'],debit_notes:['debit-notes','debit-note-form','debitNotes'],receipts:['receipts','receipt-form','receipts'],payments:['payments','payment-form','payments']};
const native={key,issueDate:'2026-01-25',reference:'0021',customer:'Customer',description:'History',invoiceAmount:{value:824.07,currency:'USD'},balanceDue:{value:0,currency:'USD'},status:'PaidInFull',custom:{deep:{value:5}}};
const rows=[
 {transaction:{key,resource:'sales-invoices',reference:'0021'},account:{key:account,name:'Income'},debit:{value:10}},
 {view:'/sales-invoice-view?Key='+key,account:'Income'},
 {transaction:'Sales Invoice — 0021',key:other,account:null},
 {sourceResource:'sales_invoices',sourceKey:key,sourceReference:'0021',accountKey:account},
 {view:'https://evil.test/sales-invoice-view?Key='+key,account:'Unidentified'},
 {view:'/sales-invoice-form/'+key,account},
 {sourceResource:'payments',sourceKey:other,view:'/sales-invoice-form/'+key,account:null}
];
const feeds={'summary-transactions':'summaryTransactions','trial-balance-transactions':'trialBalanceTransactions','profit-and-loss-statement-transactions':'profitAndLossStatementTransactions','balance-sheet-transactions':'balanceSheetTransactions','tax-summary-transactions':'taxSummaryTransactions'};
const original=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{assert.equal(opts.method,'GET');const u=new URL(url),p=u.pathname.replace(/^\/api2\/?/,'');
 if(p==='chart-of-accounts')return Response.json({business:{name:opts.headers['X-API-KEY']==='beta'?'Beta':'Alpha'},totalRecords:1,chartOfAccounts:[{key:account,name:'Income'}]});
 if(!p)return Response.json({paths:{'/profit-and-loss-statement-transactions':{get:{parameters:[]}}}});
 if(p==='access-tokens')return Response.json({accessTokens:[]});
 for(const [, [path,form,items]]of Object.entries(docs)){
  if(p===path){let data=[native,{...native,key:other,reference:mode==='duplicate'?'0021':'0022'}];if(mode==='repeat')data=[native,native];if(mode==='missingkey')data=[{reference:'0021'}];if(mode==='empty')return Response.json({totalRecords:2,[items]:[]});if(mode==='missingreference')data=data.map(x=>({...x,reference:null}));const skip=Number(u.searchParams.get('skip')),size=Number(u.searchParams.get('pageSize'));return Response.json({totalRecords:data.length,[items]:data.slice(skip,skip+size)})}
  if(p.startsWith(form+'/'))return Response.json({Key:p.split('/').at(-1),Reference:p.endsWith(key)?'0021':'0022',Lines:[{Account:account,Amount:824.07}],CustomFields:{retained:true}});
 }
 if(feeds[p])return Response.json({totalRecords:rows.length,[feeds[p]]:rows});
 return new Response(null,{status:404});
};
async function request(path,body,user='owner'){const response=await worker.fetch(new Request('https://history.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://history.test','Content-Type':'application/json','oai-authenticated-user-id':user},...(body?{body:JSON.stringify(body)}:{})}),env);return response.json()}
async function rpc(name,args,user='owner'){const r=(await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user)).result;assert.deepEqual(r.structuredContent,JSON.parse(r.content[0].text));return r}
function checkRows(r){assert.equal(r[0].source_resource,'sales_invoices');assert.equal(r[0].source_key,key);assert.equal(r[0].source_reference,'0021');assert.equal(r[0].account_key,account);assert.equal(r[0].account_name,'Income');assert.equal(r[1].source_key,key);assert.equal(r[1].account_key,null);assert.equal(r[1].account_name,'Income');assert.equal(r[2].source_key,null);assert.equal(r[2].source_resource,null);assert.equal(r[2].account_name,null);assert.equal(r[3].account_name,'Income');assert.equal(r[4].source_key,null);assert.equal(r[5].source_key,key);assert.equal(r[5].account_name,'Income');assert.equal(r[6].source_key,null);assert.equal(r[6].source_link_status,'conflicting_native_identity')}
try{
 const connection_id=(await request('/api/connections',{token:'alpha'})).connection.connection_id;
 await request('/api/connections',{token:'beta'});const connections=await rpc('list_connections',{});assert(!connections.isError,JSON.stringify(connections));assert.equal(connections.structuredContent.business_name,null);assert(connections.structuredContent.business_tools.includes('find_record'));
 const tools=(await request('/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'})).result.tools;
 const schema=tools.find(t=>t.name==='list_records').outputSchema.properties.items.items;assert.equal(schema.additionalProperties,true);for(const field of ['Key','IssueDate','Reference','Customer','Description','Total','Status'])assert(schema.properties[field]);assert.equal(tools.find(t=>t.name==='get_record').outputSchema.properties.record.additionalProperties,true);
 for(const resource of Object.keys(docs)){const r=await rpc('list_records',{connection_id,resource,page_size:1});assert(!r.isError,JSON.stringify(r));const item=r.structuredContent.items[0];assert.equal(item.Key,key);assert.equal(item.key,key);assert.equal(item.Reference,'0021');assert.equal(item.Total.value,824.07);assert.equal(item.Total.currency,'USD');assert.equal(item.balanceDue.value,0);assert.deepEqual(item.custom,{deep:{value:5}});assert.equal(r.structuredContent.next_skip,1)}
 const byKey=(await rpc('find_record',{connection_id,resource:'sales_invoices',key})).structuredContent;assert.equal(byKey.status,'found');assert.equal(byKey.record.Lines[0].Account,account);assert.match(byKey.record_hash,/^[a-f0-9]{64}$/);
 mode='missingreference';const missingReference=(await rpc('find_record',{connection_id,resource:'sales_invoices',reference:'0021',page_size:1})).structuredContent;assert.equal(missingReference.status,'found');assert.equal(missingReference.reference_detail_reads,2);mode='normal';
 const exact=await rpc('find_record',{connection_id,resource:'sales_invoices',reference:'0021',page_size:1});assert(!exact.isError,JSON.stringify(exact));assert.equal(exact.structuredContent.status,'found');assert.equal(exact.structuredContent.pages_scanned,2);assert.equal(exact.structuredContent.uniqueness_verified,true);
 const partial=(await rpc('find_record',{connection_id,resource:'sales_invoices',reference:'0021',page_size:1,max_pages:1})).structuredContent;assert.equal(partial.status,'incomplete');assert.equal(partial.next_skip,1);assert(!partial.record);
 assert.equal((await rpc('find_record',{connection_id,resource:'sales_invoices',reference:'missing'})).structuredContent.status,'not_found');
 mode='duplicate';assert.equal((await rpc('find_record',{connection_id,resource:'sales_invoices',reference:'0021'})).structuredContent.status,'ambiguous');mode='repeat';assert.equal((await rpc('find_record',{connection_id,resource:'sales_invoices',reference:'0021',page_size:1})).structuredContent.pagination_anomaly.code,'repeated_record_key');mode='missingkey';assert.equal((await rpc('find_record',{connection_id,resource:'sales_invoices',reference:'0021'})).structuredContent.status,'incomplete');mode='empty';assert.equal((await rpc('find_record',{connection_id,resource:'sales_invoices',reference:'0021'})).structuredContent.pagination_anomaly.code,'empty_page_before_total');mode='normal';
 assert.equal((await rpc('find_record',{connection_id,resource:'sales_invoices',reference:'0022',skip:1})).structuredContent.status,'incomplete');
 for(const args of [{key,reference:'0021'},{},{term:''},{key,page_size:1},{reference:'0021',max_pages:11},{resource:'../access-tokens',key}])assert((await rpc('find_record',{connection_id,resource:'sales_invoices',...args})).isError);
 assert((await rpc('find_record',{connection_id,resource:'sales_invoices',key},'intruder')).isError);
 checkRows((await rpc('get_transactions',{connection_id})).structuredContent.data.summaryTransactions);checkRows((await rpc('get_trial_balance_transactions',{connection_id})).structuredContent.data.trialBalanceTransactions);
 checkRows((await rpc('read_report_endpoint',{connection_id,endpoint:'/profit-and-loss-statement-transactions'})).structuredContent.data.profitAndLossStatementTransactions);
 for(const report of ['trial_balance','profit_and_loss','balance_sheet','tax_summary'])checkRows((await rpc('get_financial_report_data',{connection_id,report})).structuredContent.items);
 console.log('PASS History: lowercase native documents, explicit host schemas, money/currency preservation, exact/ambiguous/incomplete searches, pagination anomalies, key/full form/hash, native links, no name-to-UUID guessing, account IDs/names, all transaction feeds, connection isolation; no accounting writes.');
}finally{globalThis.fetch=original}
