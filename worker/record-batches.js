// Durable, bounded corrections. Native storage verification is not an accounting opinion.
export function recordBatchSchemas(resources, connection) {
  const identity = { ...connection, task_id: { type: 'string', format: 'uuid' } };
  return {
    prepare_record_changes: { properties: { ...connection,
      changes: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', additionalProperties: false,
        properties: { operation: { type: 'string', enum: ['update', 'delete'] }, resource: { type: 'string', enum: resources }, key: { type: 'string', format: 'uuid' }, expected_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, fields: { type: 'object', additionalProperties: true, minProperties: 1 } }, required: ['operation', 'resource', 'key', 'expected_hash'] } },
      ledger_check: { type: 'object', additionalProperties: false, properties: {
        group_by: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', minLength: 1, maxLength: 80 } },
        sum_fields: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', minLength: 1, maxLength: 80 } },
        expect_unchanged: { type: 'boolean' }, absolute_tolerance: { type: 'number', minimum: 0, maximum: 0.01 }
      }, required: ['group_by', 'sum_fields', 'expect_unchanged'] }
    }, required: ['connection_id', 'changes'] },
    apply_record_changes: { properties: { ...identity, preview_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, required: ['connection_id', 'task_id', 'preview_hash'] },
    get_record_change_task: { properties: identity, required: ['connection_id', 'task_id'] }
  };
}

export function validateRecordBatch(name, args, schema, h) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new h.Error('Invalid arguments.');
  for (const k of schema.required) if (!Object.hasOwn(args, k)) throw new h.Error('Missing '+k+'.');
  for (const [k, value] of Object.entries(args)) {
    if (!Object.hasOwn(schema.properties,k)) throw new h.Error('Unknown argument: '+k);
    if (k !== 'changes') { h.validate(value, schema.properties[k], k); continue; }
    if (!Array.isArray(value) || !value.length || value.length > 20) throw new h.Error('changes requires 1..20 operations.');
    const seen = new Set();
    for (const [i, change] of value.entries()) {
      if (!change || typeof change !== 'object' || Array.isArray(change)) throw new h.Error('Invalid changes['+i+'].');
      for (const key of Object.keys(change)) if (!Object.hasOwn(schema.properties.changes.items.properties,key)) throw new h.Error('Unknown changes['+i+'].'+key);
      for (const key of ['operation','resource','key','expected_hash']) h.validate(change[key], schema.properties.changes.items.properties[key], 'changes['+i+'].'+key);
      const id=change.resource+':'+change.key.toLowerCase();
      if (seen.has(id)) throw new h.Error('A record may appear only once per batch.');
      seen.add(id);
      if (change.operation==='delete' && Object.hasOwn(change,'fields')) throw new h.Error('Delete does not accept fields.');
      h.validateBusiness(change.operation+'_record',{ connection_id: args.connection_id, resource:change.resource, key:change.key, expected_hash:change.expected_hash, ...(change.operation==='update'?{fields:change.fields}:{}) });
    }
  }
}

function ledgerTotals(snapshot) {
  return new Map(snapshot.groups.map(g=>[JSON.stringify(Object.entries(g.dimensions).sort()),g.sums]));
}
function compareLedger(before, after, check) {
  const a=ledgerTotals(before), b=ledgerTotals(after), differences=[], tolerance=check.absolute_tolerance??1e-8;
  for (const key of new Set([...a.keys(),...b.keys()])) for (const field of check.sum_fields) {
    const old=a.get(key)?.[field]??0, current=b.get(key)?.[field]??0;
    if (Math.abs(current-old)>tolerance) differences.push({dimensions:JSON.parse(key),field,before:old,after:current,delta:current-old});
  }
  return { compared: true, unchanged: !differences.length, differences, absolute_tolerance: tolerance };
}

export async function recordBatchCall(env,user,c,name,args,h) {
  const prefix='record-changes/'+await h.hash(user)+'/'+c.id+'/', key=prefix+(args.task_id??crypto.randomUUID())+'.json';
  const envelope={connection_id:c.id,business_name:c.name};
  const publicTask=t=>({...envelope,task_id:t.task_id,status:t.status,preview_hash:t.preview_hash,expires_at:t.expires_at,
    changes:t.changes,ledger_check:t.ledger_check,ledger_before:t.ledger_before??null,ledger_after:t.ledger_after??null,
    ledger_verification:t.ledger_verification??null,results:t.results,stop_reason:t.stop_reason??null,
    reconciliation_required:!!t.reconciliation_required,retryable:false,
    limitations:['Not atomic across Manager records. No automatic rollback or replay.','Verification proves native storage; ledger sums are generic movements, not financial statements.','Only execute changes already authorized by the user. No create/import operations.']});
  const persist=async(t,etag)=>{
    if (JSON.stringify(t).length>1500000) throw new h.Error('Batch snapshot exceeds 1.5 MB.',413);
    const saved=await env.BUCKET.put(key,await h.encrypt(env,t),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});
    if(!saved)throw new h.Error('Task changed in another request; nothing was replayed.',409);
    return saved.etag;
  };
  if(name==='prepare_record_changes'){
    await h.identity(c);
    const changes=[];
    for(const [index,change]of args.changes.entries()){
      const before=await h.read(c,change.resource,change.key), current=await h.recordHash(before);
      if(current!==change.expected_hash)throw new h.Error('Record changed before preview at changes['+index+']. Read it again.',409);
      const after=change.operation==='delete'?null:h.merge(h.body(before),change.fields);
      changes.push({...change,before,after,changed_fields:change.operation==='delete'?['(entire record)']:h.differences(before,change.fields).map(d=>d.field)});
    }
    const task={task_id:key.slice(prefix.length,-5),connection_id:c.id,business_name:c.name,token_hash:await h.hash(c.token),
      created_at:Date.now(),expires_at:Date.now()+24*60*60*1000,status:'prepared',changes,ledger_check:args.ledger_check??null,results:[]};
    if(task.ledger_check){task.ledger_before=await h.ledger(c,{source:'general_ledger',auto_paginate:true,group_by:task.ledger_check.group_by,sum_fields:task.ledger_check.sum_fields});
      if(!task.ledger_before.complete||!task.ledger_before.aggregation_performed)throw new h.Error('Incomplete ledger baseline; no batch was prepared.',409);}
    task.preview_hash=await h.recordHash({connection_id:c.id,business_name:c.name,changes,ledger_check:task.ledger_check});
    await persist(task);return publicTask(task);
  }
  const obj=await env.BUCKET.get(key);if(!obj)throw new h.Error('Record change task not found.',404);
  const task=await h.decrypt(env,obj);
  if(task.connection_id!==c.id||task.business_name!==c.name)throw new h.Error('Task company changed.',409);
  if(name==='get_record_change_task')return publicTask(task);
  if(args.preview_hash!==task.preview_hash)throw new h.Error('Preview hash does not match this task.',409);
  if(task.status==='completed')return publicTask(task); // Read-only repeat, not a second execution.
  if(task.status!=='prepared')return {...publicTask(task),reconciliation_required:true,stop_reason:'Task already claimed/stopped. Inspect saved results and native records; no replay occurred.'};
  if(task.expires_at<Date.now()||await h.hash(c.token)!==task.token_hash)throw new h.Error('Task expired or connection token changed. Prepare a fresh preview.',409);
  task.status='preflight';let etag=await persist(task,obj.etag); // Exclusive durable claim before any write.
  const save=async()=>{etag=await persist(task,etag);};
  try{
    await h.identity(c);
    for(const [i,change]of task.changes.entries()){
      const current=await h.read(c,change.resource,change.key);
      if(await h.recordHash(current)!==change.expected_hash){task.status='stopped_conflict';task.stop_reason='Preflight record changed at index '+i+'; no writes dispatched.';await save();return publicTask(task);}
    }
    if(task.ledger_check){
      const current=await h.ledger(c,{source:'general_ledger',auto_paginate:true,group_by:task.ledger_check.group_by,sum_fields:task.ledger_check.sum_fields});
      if(!current.complete||!current.aggregation_performed||!compareLedger(task.ledger_before,current,task.ledger_check).unchanged){task.status='stopped_conflict';task.stop_reason='Ledger changed or became incomplete since preview; no writes dispatched.';await save();return publicTask(task);}
    }
  }catch(e){task.status='stopped_preflight';task.stop_reason='Preflight read failed; no writes dispatched.';await save();return publicTask(task);}
  const started=Date.now();task.status='running';await save();
  for(const [index,change]of task.changes.entries()){
    if(Date.now()-started>80000){task.status='stopped_time_budget';task.stop_reason='Stopped between records at time bound. Prepare only inspected remaining changes in a new task.';await save();return publicTask(task);}
    task.results.push({index,resource:change.resource,key:change.key,operation:change.operation,status:'dispatching',dispatched_at:new Date().toISOString()});
    // A crash after this durable marker MUST NOT cause a retry.
    await save();let result;
    try{result=await h.mutate(change.operation+'_record',{connection_id:c.id,resource:change.resource,key:change.key,expected_hash:change.expected_hash,...(change.operation==='update'?{fields:change.fields}:{})});}
    catch{result={status:'uncertain',verified:false,reconciliation_required:true,retryable:false,note:'Mutation did not return a verified result. Inspect this record before further work.'};}
    task.results[index]={...task.results[index],...result};
    if(!['succeeded','unchanged'].includes(result.status)||result.verified!==true||result.reconciliation_required){task.status='stopped';task.stop_reason='Record '+index+' did not verify; remaining changes were not dispatched.';task.reconciliation_required=true;await save();return publicTask(task);}
    await save();
  }
  if(task.ledger_check){
    try{task.ledger_after=await h.ledger(c,{source:'general_ledger',auto_paginate:true,group_by:task.ledger_check.group_by,sum_fields:task.ledger_check.sum_fields});
      if(!task.ledger_after.complete||!task.ledger_after.aggregation_performed)throw Error('incomplete');
      task.ledger_verification=compareLedger(task.ledger_before,task.ledger_after,task.ledger_check);
      if(task.ledger_check.expect_unchanged&&!task.ledger_verification.unchanged){task.status='completed_review_required';task.reconciliation_required=true;}
    }catch{task.status='completed_review_required';task.reconciliation_required=true;task.stop_reason='Writes verified but final ledger snapshot failed. Read ledger before considering further writes.';}
  }
  if(task.status==='running')task.status='completed';
  await save();return publicTask(task);
}
