import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const objects=new Map();let seq=0,mode='normal',reads=[];
const env={MANAGER_TOKEN_ENCRYPTION_KEY:'ea'.repeat(32),BUCKET:{get:async k=>objects.has(k)?{etag:objects.get(k).etag,json:async()=>JSON.parse(objects.get(k).body)}:null,put:async(k,body)=>{objects.set(k,{body,etag:String(++seq)});return {etag:String(seq)}},list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})}};
const cash='6d4af96a-0959-4bb2-9160-fa825ec67c43',ar='d1489e95-bb28-4f5d-b42e-67d3291b3893',transfer='b300e679-cf46-4c99-bef0-cfa5cb3e0271';
const paths=['/balance-sheet-cash-at-bank-account-form','/balance-sheet-accounts-receivable-account-form','/balance-sheet-inter-account-transfers-form'];
const rows=[{key:cash,name:'Renamed cash',code:'X'},{key:ar,name:'Renamed AR',code:'Y'},{key:transfer,name:'Renamed transfers',code:null}];
const original=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{assert.equal(opts.method,'GET');const p=new URL(url).pathname.replace(/^\/api2/,'');reads.push(p);
 if(!p)return Response.json({paths:Object.fromEntries(paths.map(p=>[p+'/{key}',{get:{}}]))});
 if(p==='/chart-of-accounts')return Response.json({business:{name:'Alpha'},totalRecords:3,chartOfAccounts:rows});
 if(mode==='denied'&&p.startsWith(paths[0]))return new Response(null,{status:403});
 if(mode==='stored'&&p===paths[0]+'/'+cash)return Response.json({Key:cash,Name:'Stored cash',Group:null,Position:2});
 return new Response(null,{status:404});};
async function request(path,body,user='owner'){return (await worker.fetch(new Request('https://test.local'+path,{method:body?'POST':'GET',headers:{Origin:'https://test.local','Content-Type':'application/json','oai-authenticated-user-id':user},...(body?{body:JSON.stringify(body)}:{})}),env)).json()}
async function rpc(name,args,user='owner'){return (await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user)).result;}
try{
 const connection_id=(await request('/api/connections',{token:'alpha'})).connection.connection_id;
 for(const row of rows){reads=[];const r=await rpc('get_coa_item',{connection_id,item_key:row.key});assert(!r.isError,JSON.stringify(r));const x=r.structuredContent;assert.equal(x.object_classification,'system_account');assert.equal(x.settings_available,false);assert.equal(x.settings,null);assert.equal(x.name,row.name);assert.equal(x.path.complete,false);assert.deepEqual(x.editable_fields,[]);assert.equal(reads.filter(p=>p.includes('-form/')).length,1);assert.equal(reads.filter(p=>p==='/chart-of-accounts').length,1);}
 reads=[];const structure=await rpc('get_coa_structure',{connection_id});assert(!structure.isError,JSON.stringify(structure));assert(structure.structuredContent.nodes.every(x=>x.object_classification==='system_account'&&x.settings_available===false));assert.equal(reads.filter(p=>p.includes('-form/')).length,3);reads=[];assert(!(await rpc('get_coa_structure',{connection_id})).isError);assert.equal(reads.length,0);
 mode='denied';const r=await rpc('get_coa_item',{connection_id,item_key:cash});assert(r.isError);assert.equal(r.structuredContent.error.code,'PERMISSION_DENIED');
 mode='stored';const stored=await rpc('get_coa_item',{connection_id,item_key:cash,include_path:false});assert(!stored.isError);assert.equal(stored.structuredContent.settings.Position,2);assert.deepEqual(stored.structuredContent.editable_fields,[]);
 assert((await rpc('get_coa_item',{connection_id,item_key:cash},'other')).isError);
 console.log('PASS: fixed system IDs despite renamed labels, 404 settings remain unknown, one targeted native form GET per singleton, stored form retained, 403 preserved, caller isolation, no writes.');
}finally{globalThis.fetch=original}
