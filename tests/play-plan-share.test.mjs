import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {createRequire} from 'node:module';
const fromGuide=createRequire(new URL('../modules/travel-guide/package.json',import.meta.url));
const {renderToStaticMarkup}=fromGuide('react-dom/server'),{createElement}=fromGuide('react');
import {createPlanShareToken,verifyPlanShareToken,serializePlanViewCookie,readPlanViewCookie} from '../server/auth/play-plan-share.ts';
import {createPlayPlanShareService,isSharedRouteAllowed,isSharedCityAllowed} from '../server/services/play-plan-share-service.ts';
import {PlayPlanShareConfig} from '../server/config/play-plan-share-config.ts';
import {createEmptyPlan} from '../frontend/travel-guide/create-plan.ts';
import {createPlanShareUrl} from '../frontend/travel-guide/share.ts';
import {getWorkbenchSessionExpiration} from '../server/auth/workbench-auth.ts';
import {App} from '../modules/travel-guide/src/App.tsx';
const secret='independent-random-secret-for-tests';
function fixture(){const plan=createEmptyPlan('分享示例','长沙',2);plan.places=[{id:'p1',name:'第一站',type:'sight',city:'长沙',source:'user',locationStatus:'confirmed',coordinate:{lng:112.9,lat:28.1,system:'GCJ02'}},{id:'p2',name:'第二站',type:'food',city:'长沙',source:'user',locationStatus:'confirmed',coordinate:{lng:112.91,lat:28.11,system:'GCJ02'}},{id:'saved',name:'待选餐厅',type:'food',city:'长沙',source:'user',locationStatus:'unresolved'},{id:'removed',name:'已移除的私人备注',type:'sight',city:'长沙',source:'user',locationStatus:'unresolved'}];plan.days[0].stops=[{id:'s1',placeId:'p1',note:'',incomingMode:'walking',durationMinutes:60},{id:'s2',placeId:'p2',note:'午餐',incomingMode:'cycling',durationMinutes:90}];plan.savedPlaceIds=['saved'];return {trip:{id:'trip-one',title:'共享旅程',dates:'2026-10',members:[{name:'private-person'}],sharedExpenses:[{amount:999,title:'private-ledger'}]},plan,revision:'private-revision'};}
test('opaque authenticated share tokens resist guessing, tampering and key changes',()=>{
 const a=createPlanShareToken('trip-one',secret),b=createPlanShareToken('trip-one',secret);assert.notEqual(a,b);assert.equal(verifyPlanShareToken(a,secret),'trip-one');assert.equal(verifyPlanShareToken(b,secret),'trip-one');assert.ok(!Buffer.from(a,'base64url').includes(Buffer.from('trip-one')));
 const changed=Buffer.from(a,'base64url');changed[changed.length-1]^=1;assert.equal(verifyPlanShareToken(changed.toString('base64url'),secret),null);
 for(const token of [undefined,'','trip-one',a+'=',a+'/more','x'.repeat(401)])assert.equal(verifyPlanShareToken(token,secret),null);
 assert.equal(verifyPlanShareToken(a,'rotated-key'),null);
 const config={password:'unused',sessionDays:7,cookieName:'workbench',sessionSecret:secret};assert.equal(getWorkbenchSessionExpiration({headers:{'x-workbench-session':a}},config),null);
});
test('public share returns only one plan, without ledger/member/revision or deleted place data',async()=>{
 const original=fixture();const service=createPlayPlanShareService({get:async id=>{assert.equal(id,'trip-one');return original;}},secret);const {token}=await service.create('trip-one');const result=await service.read(token);const json=JSON.stringify(result);
 assert.deepEqual(Object.keys(result),['trip','plan']);assert.deepEqual(Object.keys(result.trip),['title','dates']);assert.ok(!json.includes('private-person')&&!json.includes('private-ledger')&&!json.includes('private-revision')&&!json.includes('已移除的私人备注'));assert.equal(result.plan.places.length,3);assert.equal(original.plan.places.length,4);
 original.plan.days[0].title='分享后更新';assert.equal((await service.read(token)).plan.days[0].title,'分享后更新');
});
test('invalid, removed or uncreated shares cannot reveal any plan',async()=>{
 let reads=0;const source=fixture(),service=createPlayPlanShareService({get:async()=>{reads++;return source;}},secret);await assert.rejects(service.read('invalid'),e=>e.status===404);assert.equal(reads,0);source.plan=null;await assert.rejects(service.create('trip-one'),e=>e.status===409);await assert.rejects(service.read(createPlanShareToken('trip-one',secret)),e=>e.status===404);
});
test('public routes require confirmed adjacent stops and the configured transportation mode',async()=>{
 const source=fixture(),service=createPlayPlanShareService({get:async()=>source},secret),shared=await service.read(createPlanShareToken('trip-one',secret));
 assert.equal(isSharedRouteAllowed(shared,'112.9,28.1','112.91,28.11','cycling'),true);
 for(const [a,b,mode]of [['112.9,28.1','112.91,28.11','driving'],['112.91,28.11','112.9,28.1','cycling'],['113,29','112.91,28.11','cycling'],['112.9,28.1','112.91,28.11','rail']])assert.equal(isSharedRouteAllowed(shared,a,b,mode),false);
 shared.plan.places[0].locationStatus='unresolved';assert.equal(isSharedRouteAllowed(shared,'112.9,28.1','112.91,28.11','cycling'),false);
});
test('anonymous city centering only accepts cities from the shared itinerary',async()=>{
 const shared=await createPlayPlanShareService({get:async()=>fixture()},secret).read(createPlanShareToken('trip-one',secret));
 assert.equal(isSharedCityAllowed(shared,'长沙'),true);
 for(const city of [null,'','北京','长沙&key=attacker'])assert.equal(isSharedCityAllowed(shared,city),false);
});
test('map-view cookie is scoped to SDK paths and never grants a workbench session',()=>{
 const token=createPlanShareToken('trip-one',secret),cookie=serializePlanViewCookie(token,true);assert.match(cookie,/Path=\/_AMapService\//);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);const request={headers:{cookie:cookie.split(';')[0]}};assert.equal(readPlanViewCookie(request),token);assert.equal(getWorkbenchSessionExpiration(request,{cookieName:'workbench',password:'x',sessionSecret:secret,sessionDays:7}),null);
});
test('share encryption key is stable, private and never silently replaced on malformed config',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'plan-share-key-'));try{const file=path.join(dir,'secret.json');const one=PlayPlanShareConfig.load(file);assert.match(one,/^[a-f0-9]{64}$/);assert.equal(PlayPlanShareConfig.load(file),one);assert.equal((await stat(file)).mode&0o777,0o600);await writeFile(file,'{broken');assert.throws(()=>PlayPlanShareConfig.load(file));assert.equal(await readFile(file,'utf8'),'{broken');}finally{await rm(dir,{recursive:true,force:true});}
});
test('read-only rendering has navigation and route viewing but no edit, import or search controls',t=>{
 // The root Next-style tsconfig preserves JSX; tsx uses the classic runtime for this test.
 const previous=globalThis.React;globalThis.React=fromGuide('react');t.after(()=>{if(previous===undefined)delete globalThis.React;else globalThis.React=previous;});
 const source=fixture();const html=renderToStaticMarkup(createElement(App,{initialPlan:source.plan,readOnly:true,tripTitle:'共享旅程'}));for(const text of ['只读分享','第一站','第二站','生成路线','1 小时'])assert.ok(html.includes(text));for(const text of ['编辑安排','编辑当天','添加地点','添加一天','添加第一站','搜索地点','导入旅行计划','导出计划','拖动以调整顺序','type="file"'])assert.ok(!html.includes(text),text+' should be absent');assert.ok(!html.includes('draggable="true"'));
});
test('sharing URL preserves the H5 deployment prefix and only carries a view token',()=>{
 const url=new URL(createPlanShareUrl('https://example.com','/ledger','opaque-token'));assert.equal(url.pathname,'/ledger/play-plan/share');assert.equal(url.searchParams.get('token'),'opaque-token');assert.equal(url.searchParams.has('tripId'),false);
});
