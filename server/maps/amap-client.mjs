export function isCoordinate(value) {
    if (typeof value !== 'string' || !/^[-]?\d+(\.\d+)?,[-]?\d+(\.\d+)?$/.test(value))
        return false;
    const [lng, lat] = value.split(',').map(Number);
    return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}
export class ApiError extends Error {
    constructor(message, status = 502) { super(message); this.status = status; }
}
export function createAmapClient(config, fetcher = fetch) {
    async function call(path, params) {
        const url = new URL(path, 'https://restapi.amap.com');
        for (const [k, v] of Object.entries(params))
            url.searchParams.set(k, v);
        url.searchParams.set('key', config.serviceKey);
        let response;
        try {
            response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
        }
        catch {
            throw new ApiError('连接高德超时或失败，请检查网络后重试');
        }
        if (!response.ok)
            throw new ApiError('高德服务暂不可用，请稍后重试');
        let data;
        try {
            data = await response.json();
        }
        catch {
            throw new ApiError('高德返回的数据无法读取');
        }
        const successful=path==='/v4/direction/bicycling' ? data.errcode===0||data.errcode==='0' : data.status==='1';
        if (!successful) {
            const info = String(data.info || data.errmsg || 'UNKNOWN').replace(/[^A-Z0-9_]/g, '').slice(0, 80);
            throw new ApiError(`高德服务返回 ${info}（${String(data.infocode ?? data.errcode ?? '未知').replace(/[^0-9]/g, '').slice(0, 10)}），请检查对应产品权限、配额或来源限制`);
        }
        return data;
    }
    return {
        async search(query, city) {
            if (typeof query !== 'string' || !query.trim() || query.length > 100 || typeof city !== 'string' || !city.trim() || city.length > 80)
                throw new ApiError('请输入地点名称与搜索城市', 400);
            const data = await call('/v5/place/text', { keywords: query.trim(), region: city.trim(), city_limit: 'true', page_size: '10' });
            return { places: (Array.isArray(data.pois) ? data.pois : []).filter(p => typeof p.id === 'string' && typeof p.name === 'string' && isCoordinate(p.location)).map(p => ({ id: p.id, name: p.name, location: p.location, address: typeof p.address === 'string' ? p.address : '', city: typeof p.cityname === 'string' ? p.cityname : city, category: typeof p.type === 'string' ? p.type : '' })) };
        },
        async route(origin, destination, mode) {
            if (!isCoordinate(origin) || !isCoordinate(destination) || !['walking', 'cycling', 'driving'].includes(mode))
                throw new ApiError('路线参数无效', 400);
            const cycling=mode==='cycling';
            const data = await call(cycling?'/v4/direction/bicycling':`/v3/direction/${mode}`, { origin, destination, ...(!cycling?{extensions:'all'}:{}) });
            const path = cycling?data.data?.paths?.[0]:data.route?.paths?.[0];
            if (!path)
                throw new ApiError('未找到可用路线，请更换入口或交通方式', 422);
            const distance = Number(path.distance), duration = Number(path.duration);
            const points = (Array.isArray(path.steps) ? path.steps : []).flatMap(step => typeof step.polyline === 'string' ? step.polyline.split(';').filter(isCoordinate).map(p => p.split(',').map(Number)) : []);
            if (!Number.isFinite(distance) || !Number.isFinite(duration) || distance < 0 || duration < 0 || points.length < 2)
                throw new ApiError('高德未返回有效道路折线', 422);
            return { distance, duration, points };
        }
    };
}
// Only SDK map-style/vector requests go through this proxy. Search/routing use dedicated validated APIs.
export function sdkTarget(path, search, config) {
    const hosts = { '/v4/map/styles': 'https://webapi.amap.com', '/v3/vectormap': 'https://fmap01.amap.com' };
    const host = hosts[path];
    if (!host)
        throw new ApiError('不支持的地图代理路径', 404);
    const target = new URL(path, host);
    target.search = search;
    target.searchParams.delete('callback');
    // The SDK may use JSONP callbacks. Preserve only an identifier/property chain, never arbitrary text.
    const callback = new URLSearchParams(search).get('callback');
    if (callback && /^[\w$.]+$/.test(callback))
        target.searchParams.set('callback', callback);
    target.searchParams.set('key', config.webKey);
    target.searchParams.set('jscode', config.securityCode);
    return target;
}
