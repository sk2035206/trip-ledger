import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../src/data/seed.ts';
import { uid, parsePlan, reorder, moveToDay, routeLegs, fromSearch, newStop, addSavedPlaceToDay, parseCoordinate } from '../src/domain/plan.ts';
import { localRepository, STORAGE_KEY } from '../src/adapters/repository.ts';
import { RoutePlanner } from '../src/adapters/planner.ts';
function resolvedPlan() { const plan = createSeed(); for (const [i, place] of plan.places.entries()) {
    place.coordinate = { lng: 112.9 + i * .001, lat: 28.1, system: 'GCJ02' };
    place.locationStatus = 'confirmed';
} return plan; }
test('seed is valid, unresolved, generic day counts and unknown fields are excluded', () => { const p = createSeed(); assert.equal(parsePlan(p).days.length, 5); p.days = p.days.slice(0, 2); p.securityCode = 'should-not-export'; p.places[0].key = 'not-exported'; const clean = parsePlan(p); assert.equal(clean.days.length, 2); assert.ok(!JSON.stringify(clean).includes('export')); assert.ok(clean.places.every(p => !p.coordinate)); });
test('import rejects broken references, duplicate IDs, invalid coordinates, enums and oversize text', () => {
    for (const mutate of [p => p.days[0].stops[0].placeId = 'missing', p => p.days[0].stops[1].id = p.days[0].stops[0].id, p => p.places[0].coordinate = { lng: Infinity, lat: 30, system: 'GCJ02' }, p => p.places[0].locationStatus = 'confirmed', p => p.places[0].coordinate = {lng:112,lat:28,system:'GCJ02'}, p => p.days[0].stops[0].incomingMode = 'flying', p => p.savedPlaceIds.push('missing'), p => p.places[0].name = 'a'.repeat(201), p => p.days = []]) {
        const p = createSeed();
        mutate(p);
        assert.throws(() => parsePlan(p));
    }
});
test('reorder and cross-day move preserve identities and do not mutate source', () => { const p = createSeed(), d = p.days[0], id = d.stops[0].id; const reordered = reorder(p, d.id, id, 1); assert.equal(p.days[0].stops[0].id, id); assert.equal(reordered.days[0].stops[1].id, id); assert.equal(reorder(p, d.id, id, -1), p); const moved = moveToDay(p, d.id, p.days[4].id, id); assert.equal(moved.days[4].stops[0].id, id); assert.equal(moved.days[0].stops.length, 1); assert.doesNotThrow(() => parsePlan(moved)); });
test('same POI can occur on several days without deleting shared place data', () => { const p = createSeed(), id = p.days[0].stops[0].placeId; p.days[4].stops.push(newStop(id)); p.days[0].stops.shift(); assert.ok(parsePlan(p).places.find(v => v.id === id)); assert.equal(p.days[4].stops[0].placeId, id); });
test('POI confirmation requires real valid coordinates', () => { assert.equal(parseCoordinate('181,20'), undefined); assert.equal(parseCoordinate('NaN,20'), undefined); assert.throws(() => fromSearch({ location: '', id: '1', name: 'test', city: '长沙', address: '' }, 'food')); assert.equal(fromSearch({ location: '112.9,28.1', id: '1', name: 'test', city: '长沙', address: '' }, 'food').coordinate.system, 'GCJ02'); });
test('unresolved endpoints block only adjacent segments and manual transport never routes', () => { const p = createSeed(); assert.equal(routeLegs(p, p.days[0].id)[0].status, 'missing'); const legs = routeLegs(p, p.days[2].id); assert.ok(legs.every(l => l.status === 'manual')); });
test('storage failures are surfaced and corrupted data is never overwritten on load', () => { let writes = 0; const repo = localRepository({ getItem: key => { assert.equal(key, STORAGE_KEY); return '{broken'; }, setItem: () => writes++ }); assert.throws(() => repo.load()); assert.equal(writes, 0); const full = localRepository({ getItem: () => null, setItem: () => { throw new Error('quota'); } }); assert.throws(() => full.save(createSeed()), /quota/); });
test('cancelled old request cannot publish results over a new day', async () => { const p = resolvedPlan(), planner = new RoutePlanner(); let finish; let oldUpdates = 0; const old = planner.generate(p, p.days[0].id, () => oldUpdates++, () => new Promise(resolve => { finish = resolve; })); assert.equal(oldUpdates, 1); planner.cancel(); const nextUpdates = []; await planner.generate(p, p.days[2].id, v => nextUpdates.push(v), () => { throw new Error('manual segments should not request'); }); finish({ distance: 10, duration: 10, points: [[112.9, 28.1], [112.91, 28.1]] }); assert.equal(await old, false); assert.equal(oldUpdates, 1); assert.ok(nextUpdates[0].every(l => l.status === 'manual')); });
test('route planner preserves successful legs, reports failures, and caches only success', async () => { const p = resolvedPlan(); p.days[0].stops.push(newStop(p.places[2].id)); const planner = new RoutePlanner(); let calls = 0, last; const fake = async () => { calls++; if (calls === 2)
    throw new Error('NO_ROUTE'); return { distance: 300, duration: 100, points: [[112.9, 28.1], [112.91, 28.1]] }; }; await planner.generate(p, p.days[0].id, v => last = v, fake); assert.equal(last[0].status, 'success'); assert.equal(last[1].status, 'error'); assert.match(last[1].message, /NO_ROUTE/); await planner.generate(p, p.days[0].id, () => { }, fake); assert.equal(calls, 3); });

test('LAN HTTP creates unique UUIDs without secure-context randomUUID', () => {
    const random = { getRandomValues: values => crypto.getRandomValues(values) };
    const ids = Array.from({length:100}, () => uid(random));
    assert.equal(new Set(ids).size, 100);
    assert.ok(ids.every(id => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)));
});

test('stay duration and new travel modes survive import while older plans remain valid',()=>{
 const plan=createSeed();const stop=plan.days[0].stops[1];stop.durationMinutes=90;
 for(const mode of ['cycling','subway','rail']){stop.incomingMode=mode;const parsed=parsePlan(plan);assert.equal(parsed.days[0].stops[1].incomingMode,mode);assert.equal(parsed.days[0].stops[1].durationMinutes,90);}
 for(const invalid of [-1,1441,1.5,'90',NaN,Infinity]){stop.durationMinutes=invalid;assert.throws(()=>parsePlan(plan),/停留时间/);}
 delete stop.durationMinutes;assert.equal(parsePlan(plan).days[0].stops[1].durationMinutes,undefined);
});

test('metro and high-speed rail remain named manual legs while cycling is routable',()=>{
 const plan=resolvedPlan();for(const mode of ['subway','rail']){plan.days[0].stops[1].incomingMode=mode;const leg=routeLegs(plan,plan.days[0].id)[0];assert.equal(leg.status,'manual');assert.equal(leg.mode,mode);}
 plan.days[0].stops[1].incomingMode='cycling';assert.equal(routeLegs(plan,plan.days[0].id)[0].status,'pending');
});

test('adding a candidate preserves favorites and creates independent daily stop instances',()=>{
 const plan=createSeed(),placeId=plan.savedPlaceIds[0],dayId=plan.days[0].id;
 const next=addSavedPlaceToDay(plan,dayId,placeId);assert.equal(plan.days[0].stops.length,2);assert.equal(next.days[0].stops.at(-1).placeId,placeId);assert.deepEqual(next.savedPlaceIds,plan.savedPlaceIds);assert.equal(next.places.length,plan.places.length);
 const another=addSavedPlaceToDay(next,next.days[1].id,placeId);assert.notEqual(another.days[1].stops.at(-1).id,next.days[0].stops.at(-1).id);assert.throws(()=>addSavedPlaceToDay(plan,dayId,'missing'));assert.doesNotThrow(()=>parsePlan(another));
});
