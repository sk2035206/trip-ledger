import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmapClient, isCoordinate, sdkTarget } from '../server/api.mjs';
const config = { webKey: 'test-web', serviceKey: 'test-service', securityCode: 'test-security' };
const response = data => ({ ok: true, json: async () => data });
test('server validates coordinates and transport modes before contacting provider', async () => { let calls = 0; const api = createAmapClient(config, async () => { calls++; }); for (const [a, b, mode] of [['181,30', '112,28', 'driving'], ['112,28', '112,28', 'manual'], ['foo', '112,28', 'walking']])
    await assert.rejects(api.route(a, b, mode), /参数无效/); await assert.rejects(api.search('', '长沙')); assert.equal(calls, 0); assert.ok(isCoordinate('112.9,28.2')); });
test('search exposes normalized POIs and uses only server service key', async () => { let requested; const api = createAmapClient(config, async (url) => { requested = url; return response({ status: '1', pois: [{ id: 'a', name: '餐厅', location: '112.9,28.1', cityname: '长沙市', address: '街道', type: '餐饮' }, { id: 'b', location: 'bad' }] }); }); const data = await api.search('餐厅', '长沙'); assert.equal(data.places.length, 1); assert.equal(requested.searchParams.get('key'), config.serviceKey); assert.ok(!JSON.stringify(data).includes(config.serviceKey)); });
test('routing rejects malformed success and retains road geometry and metric units', async () => { const api = createAmapClient(config, async () => response({ status: '1', route: { paths: [{ distance: '1200', duration: '600', steps: [{ polyline: '112.9,28.1;112.91,28.11' }] }] } })); assert.deepEqual(await api.route('112.9,28.1', '112.91,28.11', 'walking'), { distance: 1200, duration: 600, points: [[112.9, 28.1], [112.91, 28.11]] }); const broken = createAmapClient(config, async () => response({ status: '1', route: { paths: [{ distance: 'NaN', duration: '600', steps: [] }] } })); await assert.rejects(broken.route('112.9,28.1', '112.91,28.11', 'driving'), /有效道路/); });
test('provider quota and permission failures are useful without exposing request credentials', async () => { const api = createAmapClient(config, async () => response({ status: '0', info: 'INVALID_USER_KEY', infocode: '10001' })); await assert.rejects(api.search('餐厅', '长沙'), error => error.message.includes('INVALID_USER_KEY') && !error.message.includes(config.serviceKey)); });
test('map proxy cannot be used as a general URL or REST proxy', () => { assert.throws(() => sdkTarget('/v3/place/text', '?url=https://example.com', config)); assert.throws(() => sdkTarget('//example.com', '', config)); const url = sdkTarget('/v4/map/styles', '?key=attacker&jscode=attacker&callback=evil()', config); assert.equal(url.host, 'webapi.amap.com'); assert.equal(url.searchParams.get('jscode'), config.securityCode); assert.equal(url.searchParams.get('callback'), null); });

test('cycling parses AMap v4 response geometry and error codes',async()=>{
 let target;
 const api=createAmapClient(config,async url=>{target=url;return response({errcode:0,errmsg:'OK',data:{paths:[{distance:900,duration:320,steps:[{polyline:'112.9,28.1;112.91,28.11'}]}]}});});
 const route=await api.route('112.9,28.1','112.91,28.11','cycling');assert.equal(target.pathname,'/v4/direction/bicycling');assert.equal(route.duration,320);assert.equal(route.points.length,2);
 const blocked=createAmapClient(config,async()=>response({errcode:10001,errmsg:'INVALID_USER_KEY'}));await assert.rejects(blocked.route('112.9,28.1','112.91,28.11','cycling'),/INVALID_USER_KEY/);
 await assert.rejects(api.route('112.9,28.1','112.91,28.11','subway'),/参数无效/);
});
