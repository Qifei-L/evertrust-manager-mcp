import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import worker from '../worker/index.js';
import { PerformanceMonitor } from '../server/performance.mjs';

const keyBytes = new Uint8Array(32).fill(12);
const encryptionKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
async function encrypted(record) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv},encryptionKey,new TextEncoder().encode(JSON.stringify(record)));
  return JSON.stringify({iv:[...iv],cipher:[...new Uint8Array(cipher)]});
}
const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
const prefix = 'connections-v2/'+await hash('fixture-owner')+'/';
const records = new Map();
let target;
for(let i=0;i<100;i++) {
  const id=crypto.randomUUID(); if(i===0)target=id;
  records.set(prefix+id+'.json',await encrypted({id,name:'Fixture Company',token:'fixture-token',account_keys:[],token_name:'Fixture',token_name_status:'available'}));
}
let reads=0,lists=0,upstream=0;
const counters={};
const env={MANAGER_TOKEN_ENCRYPTION_KEY:Buffer.from(keyBytes).toString('hex'),PERFORMANCE:{increment:name=>counters[name]=(counters[name]||0)+1,measure:(_,fn)=>fn()},BUCKET:{
  get:async key=>{reads++;const body=records.get(key);return body?{etag:'etag',json:async()=>JSON.parse(body)}:null},
  list:async({prefix})=>{lists++;return {objects:[...records.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}},
}};
const realFetch=globalThis.fetch;
globalThis.fetch=async()=>{upstream++;return Response.json({business:{name:'Fixture Company'},totalRecords:0,chartOfAccounts:[]})};
async function rpc(name,args,user='fixture-owner') {
  return (await (await worker.fetch(new Request('https://fixture.test/mcp',{method:'POST',headers:{'oai-authenticated-user-id':user},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env)).json()).result;
}
try {
  assert.equal((await rpc('get_accounts',{connection_id:target})).isError,false);
  assert.equal(reads,1); assert.equal(lists,0); assert.equal(counters.crypto_calls,1);
  assert.equal((await rpc('get_accounts',{connection_id:target},'other-owner')).isError,true);
  assert.equal(upstream,1);
  reads=lists=0; counters.key_imports=0;
  assert.equal((await rpc('list_connections',{})).isError,false);
  assert.equal(counters.key_imports,1, '100 decryptions share one key import inside this request');
  assert.equal((await rpc('get_accounts',{connection_id:target})).isError,false);
  assert.equal(counters.key_imports,2, 'key imports are not cached across requests');
  records.set(prefix+target+'.json',await encrypted({id:target,name:'Fixture Company',removed:true}));
  assert.equal((await rpc('get_accounts',{connection_id:target})).isError,true);
} finally {globalThis.fetch=realFetch}

const entries=[];
const monitor=new PerformanceMonitor({logger:record=>entries.push(record)});
await Promise.all([1,3].map(count=>{
  const res=new EventEmitter();res.statusCode=200;
  return monitor.request({url:'/mcp?private=value'},res,async()=>{
    for(let i=0;i<count;i++)monitor.increment('storage_calls');
    await monitor.measure('storage_ms',()=>new Promise(done=>setTimeout(done,5)));
    res.emit('finish');
  });
}));
assert.deepEqual(entries.map(x=>x.storage_calls).sort(),[1,3]);
assert(!JSON.stringify(entries).includes('private')&&!JSON.stringify(entries).includes('value'));
assert.equal(monitor.summary().count,2);
assert(monitor.summary().p95_ms>=monitor.summary().p50_ms);
console.log('PASS performance: 100-company targeted read uses 1 object read / 0 lists / 1 decryption; one key import per request; removed/cross-user records blocked; concurrent metrics isolated and payload-free.');
