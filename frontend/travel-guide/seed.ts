import type { TripPlan, PlaceType, TravelMode, Day } from './types';
import { uid } from './plan';
export function createSeed(): TripPlan {
    const plan: TripPlan = { schemaVersion: 1, id: uid(), title: '长沙 + 张家界 · 山水五日', places: [], days: [], savedPlaceIds: [], updatedAt: new Date().toISOString() };
    function day(title: string, subtitle: string, city: string) { const d: Day = { id: uid(), title, subtitle, defaultSearchCity: city, stops: [] }; plan.days.push(d); return d; }
    function add(d: Day, name: string, type: PlaceType, note: string, mode: TravelMode = 'walking', city = d.defaultSearchCity) { const id = uid(); plan.places.push({ id, name, type, city, locationStatus: 'unresolved', source: 'original-guide' }); d.stops.push({ id: uid(), placeId: id, note, incomingMode: mode, manualTransportNote: mode === 'manual' ? '景区接驳 / 城际交通，出行前确认班次与入口' : undefined }); }
    let d = day('长沙初体验', '湘江的风，与城市的烟火', '长沙');
    add(d, '长沙站万家丽中路亚朵X酒店', 'hotel', '抵达后入住安顿。原攻略参考 ¥435 / 房晚。', 'driving');
    add(d, '橘子洲景区', 'sight', '下午沿湘江散步，看看青年毛泽东雕塑。请确认实际入口与预约规则。', 'driving');
    d = day('奔赴山野', '长沙 → 张家界，住进武陵源', '张家界');
    add(d, '张家界西站', 'transport', '原攻略车次 09:30—11:29；请重新核实车次与时刻。', 'manual');
    add(d, '宜必思张家界国家森林公园酒店', 'hotel', '武陵源附近入住。原攻略参考 ¥657 / 房晚。', 'driving');
    add(d, '金鞭溪', 'sight', '溪谷徒步，穿舒适的鞋，按实际入口和体力安排。', 'manual');
    d = day('武陵源深度游', '在群峰之间，走进山水画', '张家界');
    add(d, '武陵源标志门', 'sight', '早到检票，开放时间以官方为准。');
    for (const name of ['百龙天梯', '袁家界', '杨家界', '天子山'])
        add(d, name, 'sight', '景区环保车、步道或索道接驳，请按开放线路游览。', 'manual');
    add(d, '桔子张家界天门山索道站大庸路酒店', 'hotel', '晚间住到市区。原攻略参考 ¥591 / 房晚。', 'manual');
    d = day('山巅与长沙夜色', '天门山漫步，再回到城市', '张家界');
    add(d, '天门山索道下站', 'transport', '先确认票种、预约时段和对应入口。');
    add(d, '天门山国家森林公园', 'sight', '索道、扶梯与环保车接驳，游览顺序以票种为准。', 'manual');
    add(d, '张家界西站', 'transport', '前往车站，高铁返回长沙；车次待确认。', 'manual');
    add(d, '长沙国金中心芙蓉广场地铁站亚朵轻居酒店', 'hotel', '抵达长沙入住。原攻略参考 ¥345 / 房晚。', 'manual', '长沙');
    day('慢慢告别', '留一点空白，给自由与返程', '长沙');
    for (const [name, city] of [['小湘汇', '长沙'], ['新芙蓉', '长沙'], ['辉胖子', '长沙'], ['金碗牛肉', '长沙'], ['聚味瞿记', '长沙'], ['靓虾二哥', '长沙'], ['杨记口味虾', '长沙'], ['天宝兄弟', '长沙'], ['寨嫂当家', '张家界'], ['索溪山寨', '张家界']]) {
        const id = uid();
        plan.places.push({ id, name, type: 'food', city, locationStatus: 'unresolved', source: 'original-guide' });
        plan.savedPlaceIds.push(id);
    }
    return plan;
}
