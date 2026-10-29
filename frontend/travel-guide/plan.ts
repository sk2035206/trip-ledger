import type { TripPlan, Place, Stop, SearchPlace, PlaceType, Coordinate, RouteLeg } from './types';
import {isManualMode} from './types';
// randomUUID is restricted to secure contexts; LAN HTTP still supports getRandomValues.
export function uid(random: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>> = crypto): string {
    if (typeof random.randomUUID === 'function') return random.randomUUID();
    const bytes = random.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function parseCoordinate(input: string): Coordinate | undefined {
    if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(input))
        return;
    const [lng, lat] = input.split(',').map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90)
        return { lng, lat, system: 'GCJ02' };
}
export const coordinateText = (p: Place) => p.coordinate ? `${p.coordinate.lng},${p.coordinate.lat}` : '';
export function reorder(plan: TripPlan, dayId: string, stopId: string, targetIndex: number): TripPlan {
    const next = structuredClone(plan), day = next.days.find(d => d.id === dayId);
    if (!day)
        return plan;
    const index = day.stops.findIndex(s => s.id === stopId);
    if (index < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= day.stops.length)
        return plan;
    const [stop] = day.stops.splice(index, 1);
    day.stops.splice(targetIndex, 0, stop);
    return next;
}
export function moveToDay(plan: TripPlan, fromId: string, toId: string, stopId: string): TripPlan {
    if (fromId === toId)
        return plan;
    const next = structuredClone(plan), from = next.days.find(d => d.id === fromId), to = next.days.find(d => d.id === toId);
    if (!from || !to)
        return plan;
    const index = from.stops.findIndex(s => s.id === stopId);
    if (index < 0)
        return plan;
    to.stops.push(...from.stops.splice(index, 1));
    return next;
}
export function fromSearch(p: SearchPlace, type: PlaceType): Place {
    const coordinate = parseCoordinate(p.location);
    if (!coordinate)
        throw new Error('此地点没有有效坐标，请选择其他结果');
    return { id: uid(), name: p.name, type, city: p.city, address: p.address, amapPoiId: p.id, coordinate, locationStatus: 'confirmed', source: 'amap' };
}
export const newStop = (placeId: string): Stop => ({ id: uid(), placeId, note: '', incomingMode: 'walking' });
export function routeLegs(plan: TripPlan, dayId: string): RouteLeg[] {
    const stops = plan.days.find(d => d.id === dayId)?.stops || [];
    return stops.slice(1).map((to, i) => {
        const from = stops[i], a = plan.places.find(p => p.id === from.placeId), b = plan.places.find(p => p.id === to.placeId);
        const base = { id: `${from.id}:${to.id}`, from, to, mode: to.incomingMode };
        if (isManualMode(to.incomingMode))
            return { ...base, status: 'manual', message: to.manualTransportNote || '高铁、索道或景区接驳，按实际交通安排' };
        const missing = [a, b].filter(p => !p?.coordinate || p.locationStatus !== 'confirmed').map(p => p?.name || '未知地点');
        return { ...base, status: missing.length ? 'missing' : 'pending', message: missing.length ? `请先确认位置：${missing.join('、')}` : '等待规划' };
    });
}
const record = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('数据结构无效'); return v as Record<string, unknown>; };
const str = (v: unknown, max = 200, empty = false): string => { if (typeof v !== 'string' || v.length > max || (!empty && !v.trim()))
    throw new Error('文本字段缺失或超出长度'); return v; };
const optional = (v: unknown, max = 200) => v === undefined ? undefined : str(v, max, true);
function list(v: unknown, max: number): unknown[] { if (!Array.isArray(v) || v.length > max)
    throw new Error('列表无效或超出数量限制'); return v; }
function enumValue<T extends string>(v: unknown, values: readonly T[]): T { if (!values.includes(v as T))
    throw new Error('包含不支持的类别或模式'); return v as T; }
function stayDuration(value:unknown):number|undefined{if(value===undefined)return undefined;if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>1440)throw new Error('停留时间需为 0—1440 的整数分钟');return value;}
function unique(ids: string[]) { if (new Set(ids).size !== ids.length)
    throw new Error('包含重复 ID'); }
export function parsePlan(input: unknown): TripPlan {
    const p = record(input);
    if (p.schemaVersion !== 1)
        throw new Error('不支持此文件版本');
    const places: Place[] = list(p.places, 2000).map(raw => {
        const v = record(raw);
        const status = enumValue(v.locationStatus, ['confirmed', 'unresolved']);
        let coordinate: Coordinate | undefined;
        if (v.coordinate !== undefined) {
            const c = record(v.coordinate);
            if (c.system !== 'GCJ02' || typeof c.lng !== 'number' || typeof c.lat !== 'number' || !Number.isFinite(c.lng) || !Number.isFinite(c.lat) || Math.abs(c.lng) > 180 || Math.abs(c.lat) > 90)
                throw new Error('地点坐标无效');
            coordinate = { lng: c.lng, lat: c.lat, system: 'GCJ02' };
        }
        if (status === 'unresolved' && coordinate) throw new Error('未确认地点不能包含坐标');
        if (status === 'confirmed' && !coordinate)
            throw new Error('已确认地点缺少坐标');
        return { id: str(v.id, 100), name: str(v.name), type: enumValue(v.type, ['sight', 'food', 'hotel', 'transport']), city: str(v.city, 80), address: optional(v.address, 500), amapPoiId: optional(v.amapPoiId, 100), coordinate, locationStatus: status, source: enumValue(v.source, ['original-guide', 'amap', 'user']) };
    });
    unique(places.map(p => p.id));
    const placeIds = new Set(places.map(p => p.id));
    const days = list(p.days, 60).map(raw => { const d = record(raw); return { id: str(d.id, 100), title: str(d.title, 100), subtitle: str(d.subtitle ?? '', 300, true), defaultSearchCity: str(d.defaultSearchCity, 80), stops: list(d.stops, 100).map(raw => { const s = record(raw); const placeId = str(s.placeId, 100); if (!placeIds.has(placeId))
            throw new Error('日程引用了不存在的地点'); return { id: str(s.id, 100), placeId, note: str(s.note, 2000, true), incomingMode: enumValue(s.incomingMode, ['walking', 'cycling', 'driving', 'subway', 'rail', 'manual']), manualTransportNote: optional(s.manualTransportNote, 500), durationMinutes: stayDuration(s.durationMinutes) }; }) }; });
    if (!days.length)
        throw new Error('至少需要一天行程');
    unique(days.map(d => d.id));
    unique(days.flatMap(d => d.stops.map(s => s.id)));
    const savedPlaceIds = list(p.savedPlaceIds, 2000).map(v => str(v, 100));
    unique(savedPlaceIds);
    if (savedPlaceIds.some(id => !placeIds.has(id)))
        throw new Error('收藏引用了不存在的地点');
    const updatedAt = str(p.updatedAt, 40);
    if (!Number.isFinite(Date.parse(updatedAt)))
        throw new Error('保存时间无效');
    // Explicitly reconstruct the schema: unknown fields, including credentials, cannot enter an export.
    return { schemaVersion: 1, id: str(p.id, 100), title: str(p.title, 150), places, days, savedPlaceIds, updatedAt };
}
export const distanceText = (meters: number) => meters < 1000 ? `${Math.round(meters)} 米` : `${(meters / 1000).toFixed(1)} 公里`;
export const durationText = (seconds: number) => { const m = Math.max(0, Math.round(seconds / 60)); return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分钟` : `${m} 分钟`; };

export function addSavedPlaceToDay(plan:TripPlan,dayId:string,placeId:string):TripPlan {
    if(!plan.savedPlaceIds.includes(placeId)||!plan.places.some(p=>p.id===placeId))throw new Error('待选地点不存在，请重新选择');
    const next=structuredClone(plan),day=next.days.find(d=>d.id===dayId);
    if(!day)throw new Error('当天行程不存在');
    if(day.stops.length>=100)throw new Error('每天最多安排 100 个地点');
    day.stops.push(newStop(placeId));return next;
}
