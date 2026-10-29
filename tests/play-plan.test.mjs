import test from 'node:test';import assert from 'node:assert/strict';
import {createPlayPlanRepository,planRevision} from '../server/mysql/play-plan-repository.ts';
import {createEmptyPlan} from '../frontend/travel-guide/create-plan.ts';
import {PlanSyncController} from '../frontend/travel-guide/sync.ts';
import {fakePool} from './helpers/play-plan-db.mjs';
test('play plans are isolated by trip and first write is serialized with optimistic revision',async()=>{
 const pool=fakePool(),repo=createPlayPlanRepository(pool);const initial=await repo.get('one');assert.equal(initial.plan,null);assert.equal(initial.revision,'empty');
 const plan=createEmptyPlan('旅行一','长沙',3);const outcomes=await Promise.allSettled([repo.save('one',plan,'empty'),repo.save('one',plan,'empty')]);
 assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);assert.equal(outcomes.find(v=>v.status==='rejected').reason.status,409);assert.equal(pool.data.writes,1);assert.equal(pool.data.releases,2);assert.equal(pool.data.schemas,1);
 assert.equal((await repo.get('two')).plan,null);assert.equal((await repo.get('one')).plan.days.length,3);
});
test('unchanged content does not rewrite timestamps; missing and stale revisions do not overwrite',async()=>{
 const pool=fakePool(),repo=createPlayPlanRepository(pool),plan=createEmptyPlan('旅行','长沙',2);const saved=await repo.save('one',plan,'empty');
 const same={...plan,updatedAt:'2030-01-01T00:00:00.000Z'};assert.equal(planRevision(same),saved.revision);await repo.save('one',same,saved.revision);assert.equal(pool.data.writes,1);
 await assert.rejects(repo.save('one',plan,undefined),e=>e.status===428);await assert.rejects(repo.save('one',plan,'empty'),e=>e.status===409);assert.equal(pool.data.writes,1);
 pool.data.trips.delete('one');await assert.rejects(repo.get('one'),e=>e.status===404);await assert.rejects(repo.save('missing',plan,'empty'),e=>e.status===404);
});
test('invalid plans never reach SQL and schema failure can be retried',async()=>{
 const pool=fakePool(),repo=createPlayPlanRepository(pool);await assert.rejects(repo.save('one',{days:[]},'empty'),e=>e.status===400);assert.equal(pool.data.schemas,0);
 let attempts=0;const failing=createPlayPlanRepository({execute:async()=>{if(++attempts===1)throw new Error('offline');return [[],[]];}});await assert.rejects(failing.ensure());await failing.ensure();assert.equal(attempts,2);
});
test('client queues newest draft and uses revision returned by previous save',async()=>{
 let finish;const calls=[],states=[];let done;const completed=new Promise(resolve=>done=resolve);
 const sync=new PlanSyncController('empty',async(plan,revision)=>{calls.push([plan.title,revision]);if(calls.length===1)return new Promise(resolve=>finish=resolve);return {revision:'v2'};},state=>{states.push(state);if(state.state==='saved')done();});
 const p=createEmptyPlan('first','长沙',1);sync.enqueue(p);sync.enqueue({...p,title:'superseded'});sync.enqueue({...p,title:'latest'});finish({revision:'v1'});await completed;
 assert.deepEqual(calls,[[p.title,'empty'],['latest','v1']]);assert.equal(states.at(-1).state,'saved');sync.dispose();
});
test('client conflict freezes saves and retry without reloading cannot overwrite another device',async()=>{
 let calls=0,failed;const conflict=new Promise(resolve=>failed=resolve);const sync=new PlanSyncController('old',async()=>{calls++;throw Object.assign(new Error('conflict'),{status:409});},state=>{if(state.state==='conflict')failed();});
 const p=createEmptyPlan('trip','长沙',1);sync.enqueue(p);await conflict;sync.enqueue({...p,title:'new draft'});sync.retry();await new Promise(setImmediate);assert.equal(calls,1);sync.dispose();
});
test('client transient errors preserve draft for deliberate retry and disposed controllers stay silent',async()=>{
 let calls=0,failed,done;const error=new Promise(resolve=>failed=resolve),saved=new Promise(resolve=>done=resolve);
 const sync=new PlanSyncController('v1',async()=>{if(++calls===1)throw new Error('offline');return {revision:'v2'};},state=>{if(state.state==='error')failed();if(state.state==='saved')done();});
 sync.enqueue(createEmptyPlan('trip','长沙',1));await error;sync.retry();await saved;assert.equal(calls,2);sync.dispose();sync.enqueue(createEmptyPlan('ignored','长沙',1));assert.equal(calls,2);
});

test('shared storage retains type changes, stay duration and rail mode with a new revision',async()=>{
 const pool=fakePool(),repo=createPlayPlanRepository(pool);const plan=createEmptyPlan('trip','长沙',1);plan.places.push({id:'place',name:'用餐地点',city:'长沙',type:'sight',source:'user',locationStatus:'unresolved'});plan.days[0].stops.push({id:'stop',placeId:'place',note:'',incomingMode:'walking'});
 const first=await repo.save('one',plan,'empty');plan.places[0].type='food';plan.days[0].stops[0].incomingMode='rail';plan.days[0].stops[0].durationMinutes=90;const next=await repo.save('one',plan,first.revision);assert.notEqual(first.revision,next.revision);const loaded=await repo.get('one');assert.equal(loaded.plan.places[0].type,'food');assert.equal(loaded.plan.days[0].stops[0].durationMinutes,90);assert.equal(loaded.plan.days[0].stops[0].incomingMode,'rail');
});
