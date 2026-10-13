import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../worker/index.js';
const objects=new Map();let revision=0;
const env={MANAGER_TOKEN_ENCRYPTION_KEY:'ab'.repeat(32),BUCKET:{
 get:async k=>{const o=objects.get(k);return o?{etag:o.etag,json:async()=>JSON.parse(o.value)}:null},
 put:async(k,value,opt)=>{const old=objects.get(k);if(opt?.onlyIf?.etagMatches&&old?.etag!==opt.onlyIf.etagMatches)return null;if(opt?.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++revision);objects.set(k,{value,etag});return {etag}},
 delete:async k=>objects.delete(k),
 list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})}};
const origin='https://connector.test';
function req(path,body,user='owner',method){const headers={'Content-Type':'application/json','Origin':origin};if(user)headers['oai-authenticated-user-id']=user;return new Request(origin+path,{method:method||(body?'POST':'GET'),headers,...(body?{body:JSON.stringify(body)}:{})})}
async function api(path,body,user='owner',method){const r=await worker.fetch(req(path,body,user,method),env);return {status:r.status,data:await r.json()}}
async function rpc(name,args={},user='owner'){return (await api('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user)).data.result}
const original=globalThis.fetch;const requests=[];let blocked=false;
globalThis.fetch=async(url,opts)=>{requests.push({url:String(url),...opts});assert.equal(opts.method,'GET');assert.equal(opts.redirect,'manual');const token=opts.headers['X-API-KEY'];if(token==='invalid')return new Response(null,{status:401});if(token==='redirect')return new Response(null,{status:302,headers:{Location:'https://bad.test'}});if(token==='alpha+ABC/xyz==')assert.equal(token,'alpha+ABC/xyz==');const beta=token.startsWith('beta');if(blocked&&token.startsWith('alpha'))return new Response(null,{status:403});return Response.json({business:{name:beta?'Beta':'Alpha'},totalRecords:2,chartOfAccounts:[{key:beta?'b1':'a1',code:'100',name:'Cash'},{key:beta?'b2':'a2',code:'200',name:'Equity'}]})};
assert.equal((await api('/api/connections',null,'')).status,401);
assert.equal((await rpc('get_accounts')).isError,true);
const a=await api('/api/connections',{token:'alpha+ABC/xyz==',label:'Client A',notes:'Note'});assert.equal(a.status,200);const aid=a.data.connection.connection_id;
assert.equal(a.data.connection.business_name,'Alpha');assert(!JSON.stringify(a.data).includes('alpha+ABC/xyz=='));assert([...objects.values()].every(o=>!o.value.includes('alpha+ABC/xyz==')));
assert.equal((await api('/api/connections',{token:'alpha+ABC/xyz=='})).status,409);
assert.equal((await rpc('get_accounts')).isError,false);assert.equal(JSON.parse((await rpc('get_accounts')).content[0].text).connection_id,aid);
const b=await api('/api/connections',{token:'beta-token'});const bid=b.data.connection.connection_id;
assert.equal((await rpc('get_accounts')).isError,true);
assert.equal((await api('/api/preferred',{connection_id:bid})).status,200);assert.equal((await rpc('get_accounts')).isError,true);
assert.equal(JSON.parse((await rpc('get_accounts',{connection_id:aid})).content[0].text).business_name,'Alpha');
assert.equal((await rpc('get_accounts',{connection_id:aid},'other')).isError,true);
assert.equal((await api('/api/connections',null,'other')).data.connections.length,0);
assert.equal((await api('/api/connections/'+aid+'/token',{token:'beta-token'})).status,409);
assert.equal((await api('/api/connections/'+aid+'/token',{token:'invalid'})).status,401);
assert.equal((await rpc('get_accounts',{connection_id:aid})).isError,false);
assert.equal((await api('/api/connections/'+aid+'/token',{token:'alpha-new'})).status,200);
assert.equal((await api('/api/connections')).data.connections.find(c=>c.connection_id===aid).label,'Client A');
blocked=true;assert.equal((await api('/api/connections/'+aid+'/test',{})).data.ok,false);blocked=false;assert.equal((await api('/api/connections/'+aid+'/test',{})).data.ok,true);
await rpc('get_transactions',{connection_id:aid,from_date:'2026-09-01',to_date:'2026-09-30',page_size:25});assert(requests.at(-1).url.includes('pageSize=25'));assert(!requests.at(-1).url.includes('connection_id'));
assert.equal((await rpc('get_transactions',{connection_id:aid,from_date:'2026-02-31'})).isError,true);
assert.equal((await rpc('get_transactions',{connection_id:aid,page_size:1000})).isError,true);
const count=requests.length;assert.equal((await api('/api/connections',{token:'redirect'})).status,502);assert.equal(requests.length,count+1);
const wrong=req('/api/connections',{token:'alpha-new'});wrong.headers.set('Origin','https://evil.test');assert.equal((await worker.fetch(wrong,env)).status,403);
assert.equal((await api('/api/connections/'+bid,{},'owner','DELETE')).status,200);assert.equal((await api('/api/connections')).data.connections.length,1);assert([...objects.values()].every(o=>!o.value.includes('beta-token')));assert.equal((await rpc('get_accounts',{connection_id:bid})).isError,true);
// Simulate the prior encrypted format; reads preserve it and edits migrate safely.
const uid='legacy-user';const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid));const h=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');const iv=crypto.getRandomValues(new Uint8Array(12));const key=await crypto.subtle.importKey('raw',Uint8Array.from('ab'.repeat(32).match(/../g),x=>parseInt(x,16)),'AES-GCM',false,['encrypt']);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({name:'Alpha',token:'alpha-legacy'})));await env.BUCKET.put('connections/'+h+'.json',JSON.stringify({iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher))}));
assert.equal((await api('/api/connections',null,uid)).data.connections[0].connection_id,'legacy');assert.equal((await rpc('get_accounts',{},uid)).isError,false);
assert.equal((await api('/api/connections/legacy',{label:'Imported',notes:''},uid)).status,200);assert(!objects.has('connections/'+h+'.json'));assert.equal((await api('/api/connections',null,uid)).data.connections.length,1);
const race=await Promise.all([api('/api/connections/legacy',{label:'First'},uid),api('/api/connections/legacy',{label:'Second'},uid)]);assert(race.some(r=>r.status===409));
assert.equal((await api('/api/connections/legacy',{},uid,'DELETE')).status,200);assert.equal((await api('/api/connections',null,uid)).data.connections.length,0);
const html=await (await worker.fetch(req('/'),env)).text();assert(html.includes('lang="en"'));assert(html.includes('Evertrust Books'));assert(!/[\u4e00-\u9fff]/.test(html.replace(/<script>[\s\S]*?<\/script>/g,'')));
// Real token wire format: UUID matching, uppercase API names, and credential exclusion.
const guid='01a12195-14e6-7f05-874f-2140b70df021';
const raw=[0x95,0x21,0xa1,0x01,0xe6,0x14,0x05,0x7f,0x87,0x4f,0x21,0x40,0xb7,0x0d,0xf0,0x21];
function encodedToken(extra){return Buffer.from([10,5,...Buffer.from('Alpha'),18,18,9,...raw.slice(0,8),17,...raw.slice(8),26,1,extra]).toString('base64')}
const t1=encodedToken(1),t2=encodedToken(2);let metadataName='Accounting',metadataUnavailable=false;const fakeFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{if(String(url).includes('/access-token-form/')){assert.equal(String(url).split('/').at(-1),guid);assert.equal(opts.method,'GET');assert.equal(opts.redirect,'manual');return metadataUnavailable?new Response(null,{status:403}):Response.json({Name:metadataName,Key:guid,Password:'upstream-password-must-never-escape',id:guid})}return fakeFetch(url,opts)};
const named=await api('/api/connections',{token:t1,label:'Audit 2026'},'names');assert.equal(named.data.connection.token_name,'Accounting');assert.equal(named.data.connection.label,'Audit 2026');assert(!JSON.stringify(named.data).includes('upstream-password'));const nid=named.data.connection.connection_id;
metadataName='Renamed in Manager';assert.equal((await api('/api/connections/'+nid+'/test',{},'names')).data.connection.token_name,metadataName);
metadataName='Replacement';const rotated=await api('/api/connections/'+nid+'/token',{token:t2},'names');assert.equal(rotated.data.connection.token_name,'Replacement');assert.equal(rotated.data.connection.label,'Audit 2026');
metadataUnavailable=true;const fallback=await api('/api/connections/'+nid+'/test',{},'names');assert.equal(fallback.data.ok,true);assert.equal(fallback.data.connection.status,'connected');assert.equal(fallback.data.connection.token_name,null);assert.equal(fallback.data.connection.token_name_status,'unavailable');metadataUnavailable=false;
assert.equal((await api('/api/connections/'+nid+'/test',{},'names')).data.connection.token_name,'Replacement');
assert(!JSON.stringify((await api('/api/connections',null,'names')).data).includes('upstream-password'));assert([...objects.values()].every(o=>!o.value.includes('upstream-password')));
assert(html.indexOf('id="tokenField"')<html.indexOf('for="label"'));assert(html.includes('Tokens grouped by company'));assert(html.includes('token-row'));assert(html.includes("c.token_name||'Token name unavailable'"));
// Execute rendering with a DOM stub: same-company tokens share one collapsible group.
class Element{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.open=false;this.classList={toggle(){}}}append(e){this.children.push(e)}replaceChildren(){this.children=[]}addEventListener(){}}
const nodes=new Map();const context=vm.createContext({document:{createElement:tag=>new Element(tag),getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element('div'));return nodes.get(id)}},Set,Map,Date});
const browserScript=html.split('<script>')[1].split('</script>')[0].replace("refresh().catch(e=>$('notice').textContent=e.message);",'');vm.runInContext(browserScript,context);
vm.runInContext("connections=[{business_name:'Alpha',token_name:'Token One',label:'Audit',connection_id:'a',status:'connected'},{business_name:'Alpha',token_name:'Token Two',label:'',connection_id:'b',status:'connected'},{business_name:'Beta',token_name:'Token Three',label:'Tax',connection_id:'c',status:'connected'}];render()",context);
const groups=nodes.get('cards').children;assert.equal(groups.length,2);assert.equal(groups[0].dataset.company,'Alpha');assert.equal(groups[0].children.length,3);assert.equal(groups[0].children[1].children[0].children[0].textContent,'Token One');assert.equal(groups[0].children[1].children[0].children[1].textContent,'Label: Audit');assert.equal(groups[0].children[2].children[0].children.length,1);groups[0].open=false;vm.runInContext('render()',context);assert.equal(nodes.get('cards').children[0].open,false);
globalThis.fetch=original;console.log('PASS: legacy migration, encrypted storage, cross-user isolation, explicit company selection, replacement rollback, token characters, concurrency, removal, redirects, CSRF, pagination and English UI.');
