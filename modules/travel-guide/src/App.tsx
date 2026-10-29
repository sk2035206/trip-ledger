import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Day, Place, PlaceType, RouteLeg, SearchPlace, Stop, TripPlan } from './domain/types';
import { typeLabels, isManualMode } from './domain/types';
import { distanceText, durationText, fromSearch, addSavedPlaceToDay, uid, moveToDay, newStop, parsePlan, reorder } from './domain/plan';
import { createSeed } from './data/seed';
import { localRepository } from './adapters/repository';
import { standaloneApi, type GuideApi } from './adapters/api';
import { RoutePlanner } from './adapters/planner';
import type { MapEntry } from './adapters/map';
import { Icon } from './components/Icon';
import { MapPanel } from './components/MapPanel';
import { SearchDialog, type SearchContext } from './components/SearchDialog';
import { Modal } from './components/Modal';
import { StopCard } from './components/StopCard';
import {EditStopDialog} from './components/EditStopDialog';
function boot(initialPlan?: TripPlan) { if (initialPlan) return {plan:initialPlan,warning:'',saved:true}; try {
    const saved = localRepository(localStorage).load();
    return { plan: saved || createSeed(), warning: '', saved: !!saved };
}
catch {
    return { plan: createSeed(), warning: '未能恢复浏览器中的计划，原存储尚未覆盖。你可以导入备份；开始编辑后将保存当前计划。', saved: false };
} }
export interface GuideProps {
    initialPlan?: TripPlan;
    onPlanChange?: (plan: TripPlan) => void;
    externalSaveStatus?: string;
    backUrl?: string;
    tripDates?: string;
    tripTitle?: string;
    api?: GuideApi;
    readOnly?: boolean;
    onShare?: () => void;
    shareDisabled?: boolean;
}
export function App({initialPlan,onPlanChange,externalSaveStatus,backUrl,tripDates,tripTitle,api=standaloneApi,readOnly=false,onShare,shareDisabled=false}:GuideProps = {}) {
    const [initial] = useState(() => boot(initialPlan));
    const [editingDay,setEditingDay]=useState<Day|null>(null);
    const [plan, setPlan] = useState(initial.plan), [dayIndex, setDayIndex] = useState(0), [tab, setTab] = useState<'itinerary' | 'saved'>('itinerary'), [overview, setOverview] = useState(false), [category, setCategory] = useState<PlaceType | 'all'>('all'), [mobileView, setMobileView] = useState<'list' | 'map'>('list');
    const [selected, setSelected] = useState<string>(), [search, setSearch] = useState<SearchContext | null>(null), [edit, setEdit] = useState<{
        stop: Stop;
        place: Place;
        day: Day;
    } | null>(null), [pendingImport, setPendingImport] = useState<TripPlan | null>(null);
    const [saveStatus, setSaveStatus] = useState(initial.saved ? '已载入本地计划' : '编辑后自动保存'), [warning, setWarning] = useState(initial.warning), [toast, setToast] = useState(''), [legs, setLegs] = useState<RouteLeg[]>([]), [routing, setRouting] = useState(false);
    const planner = useRef(new RoutePlanner()), fileRef = useRef<HTMLInputElement>(null), dragged = useRef<string | null>(null);
    const day = plan.days[dayIndex] || plan.days[0];
    const destinations = [...new Set(plan.days.map(d => d.defaultSearchCity))];
    const places = useMemo(() => new Map(plan.places.map(p => [p.id, p])), [plan.places]);
    const cancelRoutes = useCallback(() => { planner.current.cancel(); setLegs([]); setRouting(false); }, []);
    useEffect(() => { const p = planner.current; return () => p.cancel(); }, []);
    useEffect(() => { if (!toast)
        return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
    function commit(next: TripPlan): boolean {
        if(readOnly)return false;
        if (next === plan) return false;
        try { next = parsePlan({ ...next, updatedAt: new Date().toISOString() }); }
        catch (error) { setToast(error instanceof Error ? error.message : '计划数据无效'); return false; }
        cancelRoutes();
        setPlan(next);
        try {
            if (onPlanChange) onPlanChange(next);
            else localRepository(localStorage).save(next);
            setSaveStatus('已保存到此浏览器');
            setWarning('');
        } catch {
            setSaveStatus('尚未保存');
            setWarning('浏览器存储不可用或空间不足。当前修改仍在页面中，请导出备份。');
        }
        return true;
    }
    function addDay() {
        if(plan.days.length>=60){setToast('最多支持 60 天行程');return;}
        const next=structuredClone(plan);
        next.days.push({id:uid(),title:`第 ${plan.days.length+1} 天`,subtitle:'',defaultSearchCity:day.defaultSearchCity,stops:[]});
        if(commit(next)){setDayIndex(next.days.length-1);setTab('itinerary');setSelected(undefined);}
    }
    function changeDay(index: number) { cancelRoutes(); setDayIndex(index); setSelected(undefined); setTab('itinerary'); }
    function openSearch(place?: Place) { setSearch({ query: place?.name || '', city: place?.city || day.defaultSearchCity, type: place?.type || 'sight', replaceId: place?.id }); }
    function selectStop(stop: Stop) { const place = places.get(stop.placeId)!; setSelected(stop.id); if (!place.coordinate)
        {if(!readOnly)openSearch(place);}
    else if (window.innerWidth < 800)
        setMobileView('map'); }
    const onMapSelect = useCallback((entry: MapEntry) => { setSelected(entry.stopId || entry.place.id); if (entry.stopId) {
        if (entry.dayIndex !== dayIndex)
            cancelRoutes();
        setDayIndex(entry.dayIndex);
        requestAnimationFrame(() => document.getElementById(`stop-${entry.stopId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    } }, [cancelRoutes, dayIndex]);
    const entries = useMemo<MapEntry[]>(() => {
        if (tab === 'saved')
            return plan.savedPlaceIds.map((id, i) => ({ key: id, label: String(i + 1), place: places.get(id)!, dayIndex: 0 })).filter(e => e.place.locationStatus === 'confirmed' && e.place.coordinate && (category === 'all' || e.place.type === category));
        return plan.days.flatMap((d, di) => (overview || d.id === day.id) ? d.stops.map((s, i) => ({ key: s.id, label: overview ? `${di + 1}·${i + 1}` : String(i + 1), place: places.get(s.placeId)!, dayIndex: di, stopId: s.id })) : []).filter(e => e.place.locationStatus === 'confirmed' && e.place.coordinate && (category === 'all' || e.place.type === category));
    }, [plan, places, tab, category, day.id, overview]);
    const mapLegs = useMemo(() => tab === 'itinerary' && !overview && category === 'all' ? legs : [], [legs, tab, overview, category]);
    const confirmed = day.stops.filter(s => places.get(s.placeId)?.locationStatus === 'confirmed').length;
    const success = legs.filter(l => l.status === 'success');
    const roadLegCount = legs.filter(l => !isManualMode(l.mode)).length;
    const manualLegCount = legs.length - roadLegCount;
    const routeDistance = success.reduce((sum, l) => sum + (l.result?.distance || 0), 0), routeDuration = success.reduce((sum, l) => sum + (l.result?.duration || 0), 0);
    const stayMinutes=day.stops.reduce((sum,stop)=>sum+(stop.durationMinutes||0),0);
    const timedStops=day.stops.filter(stop=>stop.durationMinutes!==undefined).length;
    const selectedEntry = entries.find(e => e.key === selected);
    function addSaved(placeId:string,returnToDay=true){
        try{const next=addSavedPlaceToDay(plan,day.id,placeId);if(!commit(next))return;if(returnToDay){setTab('itinerary');setSelected(next.days[dayIndex].stops.at(-1)?.id);}setSearch(null);setToast(`已加入 Day ${dayIndex+1}`);}catch(error){setToast(error instanceof Error?error.message:'添加失败');}
    }
    function choose(result: SearchPlace, type: PlaceType, target: 'day' | 'saved') {
        try {
            const next = structuredClone(plan);
            let place = fromSearch(result, type);
            if (search?.replaceId) {
                const old = next.places.find(p => p.id === search.replaceId)!;
                place = { ...place, id: old.id };
                next.places[next.places.findIndex(p => p.id === old.id)] = place;
            }
            else {
                const existing = next.places.find(p => p.amapPoiId === result.id && p.type === type);
                if (existing)
                    place = existing;
                else
                    next.places.push(place);
                if (target === 'saved') {
                    if (!next.savedPlaceIds.includes(place.id))
                        next.savedPlaceIds.push(place.id);
                }
                else {
                    const stop = newStop(place.id);
                    next.days[dayIndex].stops.push(stop);
                    setSelected(stop.id);
                    setTab('itinerary');
                }
            }
            if (!commit(next)) return;
            setSearch(null);
            setToast(search?.replaceId ? '位置已确认，已加入地图' : target === 'saved' ? '已存入待选地点' : '已加入当天行程');
        }
        catch (error) {
            setToast(error instanceof Error ? error.message : '地点添加失败');
        }
    }
    async function generate() { cancelRoutes(); setRouting(true); setOverview(false); setCategory('all'); const done = await planner.current.generate(plan, day.id, setLegs, api.getRoute); if (done)
        setRouting(false); }
    function exportPlan() { const data = JSON.stringify(parsePlan(plan), null, 2), url = URL.createObjectURL(new Blob([data], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `旅行计划-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('计划已导出，可用于备份或迁移'); }
    async function importPlan(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ''; if (!file)
        return; try {
        if (file.size > 2 * 1024 * 1024)
            throw new Error('文件超过 2 MB，请选择有效计划文件');
        setPendingImport(parsePlan(JSON.parse(await file.text())));
    }
    catch (error) {
        setToast(`导入失败：${error instanceof Error ? error.message : '文件无法读取'}`);
    } }
    function saveEdit(stop: Stop, targetDay: string, placeType:PlaceType, remove = false) { if (!edit)
        return; let next = structuredClone(plan); const d = next.days.find(d => d.id === edit.day.id)!; if (remove)
        d.stops = d.stops.filter(s => s.id !== stop.id);
    else {
        const place=next.places.find(place=>place.id===stop.placeId);if(place)place.type=placeType;
        d.stops[d.stops.findIndex(s => s.id === stop.id)] = stop;
        next = moveToDay(next, edit.day.id, targetDay, stop.id);
    } if (!commit(next)) return; setEdit(null); setSelected(undefined); setToast(remove ? '已移除这一站' : '安排已更新'); }
    return <div className="app-shell">
  <aside className="brand-rail"><span className="brand-mark" aria-label="山水之间"><Icon name="mountain" size={27}/></span><span className="rail-line"/><span className="rail-active" title="旅行计划"><Icon name="book" size={21}/></span><span className="rail-caption">山水之间</span><span className="rail-bottom"><Icon name="leaf" size={21}/></span></aside>
  <div className="main-shell"><header className={`topbar ${!readOnly&&backUrl?'topbar-with-back':''}`}><div className="wordmark">山水之间<span>TRAVEL JOURNAL</span></div><div className="header-actions">{!readOnly&&backUrl&&<button className="button guide-back" onClick={()=>{window.location.href=backUrl;}}><Icon name="arrow" size={16}/><span>返回出行</span></button>}<span className={`save-state ${saveStatus === '尚未保存' ? 'bad' : ''}`}><span />{readOnly?'只读分享':externalSaveStatus ?? saveStatus}</span>{onShare&&<button className="button" disabled={shareDisabled} onClick={onShare}><Icon name="share" size={16}/><span>分享计划</span></button>}{!readOnly&&<><button className="button subtle" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16}/><span>导入</span></button><button className="button export-button" onClick={exportPlan}><Icon name="download" size={16}/><span>导出计划</span></button><input type="file" accept="application/json,.json" ref={fileRef} className="sr-only" onChange={importPlan} aria-label="导入旅行计划"/></>}</div></header>{onPlanChange&&<p className="guide-mobile-save" role="status">{externalSaveStatus}</p>}
  <section className="trip-header"><div><div className="eyebrow"><span /> A LITTLE CITY, A LITTLE WILDERNESS</div><h1>{tripTitle?`${tripTitle} · 游玩计划`:plan.title}</h1><p>把想去的地方，排成刚刚好的旅程。</p><div className="trip-meta"><span><Icon name="pin" size={15}/>{destinations.join(' / ')}</span><span><Icon name="clock" size={15}/>{plan.days.length} 天行程</span><span className="meta-tag">{readOnly?'只读分享':'自由行手账'}</span>{tripDates&&<span>{tripDates}</span>}</div></div><div className="trip-stamp"><span>GO SLOW</span><Icon name="mountain" size={56}/><small>走走 · 停停 · 看看</small></div></section>
  {warning && <div className="global-warning" role="alert"><Icon name="info" size={17}/><span>{warning}</span><button className="text-button" onClick={exportPlan}>导出当前计划</button></div>}
  <nav className="day-nav" aria-label="选择游玩日期"><div className="day-buttons">{plan.days.map((d, i) => <button key={d.id} className={`day-button ${i === dayIndex ? 'active' : ''}`} aria-current={i === dayIndex ? 'step' : undefined} onClick={() => changeDay(i)}><span>DAY {String(i + 1).padStart(2, '0')}</span><strong>{d.title}</strong><small>{d.defaultSearchCity}</small></button>)}</div>{!readOnly&&<button className="day-add" aria-label="添加一天" title="添加一天" onClick={addDay}><Icon name="plus" size={19}/></button>}</nav>
  <div className="mobile-switch"><button className={mobileView === 'list' ? 'active' : ''} onClick={() => setMobileView('list')}><Icon name="book" size={17}/>行程安排</button><button className={mobileView === 'map' ? 'active' : ''} onClick={() => setMobileView('map')}><Icon name="pin" size={17}/>地图探索</button></div>
  <main className={`workspace mobile-${mobileView}`}>
   <section className="itinerary-panel"><div className="panel-tabs"><button className={tab === 'itinerary' ? 'active' : ''} onClick={() => { setTab('itinerary'); setSelected(undefined); }}><Icon name="book" size={17}/>每日行程</button><button className={tab === 'saved' ? 'active' : ''} onClick={() => { setTab('saved'); setSelected(undefined); }}><Icon name="pin" size={17}/>待选地点<span>{plan.savedPlaceIds.length}</span></button></div>
   <div className="itinerary-content">{tab === 'itinerary' ? <>
    <div className="day-heading"><div className="eyebrow">DAY {String(dayIndex + 1).padStart(2, '0')} <span className="little-line"/>{day.defaultSearchCity}</div><h2>{day.title}</h2><p>{day.subtitle}</p><div className="day-count"><span>{day.stops.length} 个安排</span><span>·</span><span>{confirmed} 个位置已确认</span>{!readOnly&&<button className="text-button green" onClick={()=>setEditingDay(day)}>编辑当天</button>}</div></div>
    <div className="day-toolbar"><span><Icon name={readOnly?'book':'grip'} size={15}/>{readOnly?'按游玩顺序查看':'拖动调整顺序'}</span>{!readOnly&&<button className="text-button green" onClick={() => openSearch()}><Icon name="plus" size={16}/>添加地点</button>}</div>
    {!day.stops.length && <div className="empty-state empty-day"><span className="empty-illustration"><Icon name="leaf" size={40}/></span><h3>留一点空白，也很好</h3><p>{readOnly?'这一天暂时没有具体安排，可以稍后再来查看。':<>慢慢逛，随心走。<br />找到想去的地方，再加进今天。</>}</p>{!readOnly&&<button className="button primary" onClick={() => openSearch()}><Icon name="plus" size={17}/>添加第一站</button>}</div>}
    <div className="timeline">{day.stops.map((stop, i) => <StopCard readOnly={readOnly} key={stop.id} stop={stop} place={places.get(stop.placeId)!} index={i} day={day} selected={selected === stop.id} leg={legs.find(l => l.to.id === stop.id)} onSelect={() => selectStop(stop)} onResolve={() => openSearch(places.get(stop.placeId))} onEdit={() => setEdit({ stop, place: places.get(stop.placeId)!, day })} onMove={delta => commit(reorder(plan, day.id, stop.id, i + delta))} onDrag={() => { dragged.current = stop.id; }} onDrop={() => { if (dragged.current)
            commit(reorder(plan, day.id, dragged.current, i)); dragged.current = null; }}/>)}</div>
    {!readOnly && day.stops.length > 0 && <button className="add-stop" onClick={() => openSearch()}><Icon name="plus" size={18}/>为今天再添一站</button>}
    <div className="day-note"><Icon name="info" size={17}/><p>{readOnly?'此为只读分享，内容以分享者最新保存的计划为准。交通、开放时间与预约信息请在出行前核实。':onPlanChange?'此计划关联当前出行并同步保存。景区预约、交通和价格请以实际出行时的信息为准。':'行程来自你的历史攻略。酒店价格、车次与预约规则为原攻略参考，出行前请重新核实。'}</p></div>
   </> : <><div className="day-heading"><div className="eyebrow">SOMEDAY, SOMEWHERE</div><h2>先收藏，再出发</h2><p>还没决定的美食与风景，都先放在这里。</p></div>{!readOnly&&<button className="add-stop" onClick={() => openSearch()}><Icon name="plus" size={18}/>搜索待选地点</button>}<div className="saved-list">{plan.savedPlaceIds.map(id => { const p = places.get(id)!; return <article className={`saved-card ${selected === id ? 'selected' : ''}`} key={id}><span className={`place-icon ${p.type}`}><Icon name={p.type === 'sight' ? 'mountain' : p.type}/></span><div><button className="place-title" onClick={() => {setSelected(id);if(!p.coordinate&&!readOnly)openSearch(p);}}>{p.name}</button><p>{p.city} · {p.locationStatus === 'confirmed' ? p.address || '位置已确认' : '待选择具体分店 / 入口'}</p>{!readOnly&&<div className="saved-actions"><button className="text-button green" onClick={() => addSaved(id,false)}>加入 Day {dayIndex + 1}</button><button className="text-button" onClick={() => openSearch(p)}>{p.coordinate ? '重新定位' : '确认位置'}</button><button className="text-button" aria-label={`移除收藏 ${p.name}`} onClick={() => { const next = structuredClone(plan); next.savedPlaceIds = next.savedPlaceIds.filter(v => v !== id); commit(next); }}><Icon name="close" size={14}/></button></div>}</div></article>; })}</div>{!plan.savedPlaceIds.length && <div className="empty-state"><Icon name="pin" size={36}/><h3>收藏下一次心动</h3><p>{readOnly?'此计划暂时没有待选地点。':'搜索地点后选择“存入待选”。'}</p></div>}</>}
   </div>
   {tab === 'itinerary' && <footer className="route-footer"><div><span className="eyebrow">TODAY’S ROUTE</span><p>{success.length ? `${distanceText(routeDistance)} · ${durationText(routeDuration)}` : '把想去的地方，串成一条路线'}</p><p className="stay-summary">{timedStops?`计划停留 ${durationText(stayMinutes*60)} · 已设置 ${timedStops}/${day.stops.length} 站`:(readOnly?'分享者尚未设置停留时间':'可在“编辑安排”中设置每站停留时间')}{success.length>0&&timedStops>0?` · 已知交通+停留 ${durationText(routeDuration+stayMinutes*60)}`:''}</p><small>{legs.length ? `已规划 ${success.length} / ${roadLegCount} 道路段 · ${manualLegCount} 段手动交通不计入合计` : '按当前顺序 · 步行 / 骑行 / 驾车等'}</small></div><button className="button primary" disabled={day.stops.length < 2 || routing} onClick={generate}><Icon name="route" size={18}/>{routing ? '规划中…' : '生成路线'}</button></footer>}
   </section>
   <section className="map-workspace"><div className="map-toolbar"><div className="segmented"><button className={!overview ? 'active' : ''} onClick={() => setOverview(false)}>当日地图</button><button className={overview ? 'active' : ''} onClick={() => setOverview(true)} disabled={tab === 'saved'}>全程一览</button></div>{!readOnly&&<button className="button small map-search" onClick={() => openSearch()}><Icon name="search" size={16}/>搜索地点</button>}</div><div className="map-wrapper"><MapPanel entries={entries} legs={mapLegs} selectedKey={selected} onSelect={onMapSelect} city={day.defaultSearchCity} overview={overview} visible={mobileView === 'map'} api={api}/><div className="map-filters" aria-label="地图分类筛选">{(['all', 'sight', 'food', 'hotel', 'transport'] as const).map(type => <button key={type} className={`filter-chip ${category === type ? 'active' : ''}`} aria-pressed={category === type} onClick={() => setCategory(type)}>{type !== 'all' && <span className={`filter-dot ${type}`}/>} {type === 'all' ? '全部' : typeLabels[type]}</button>)}</div>
    {selectedEntry && <div className="map-place-card"><span className={`place-icon ${selectedEntry.place.type}`}><Icon name={selectedEntry.place.type === 'sight' ? 'mountain' : selectedEntry.place.type}/></span><div><small>{typeLabels[selectedEntry.place.type]} · {selectedEntry.place.city}</small><strong>{selectedEntry.place.name}</strong><p>{selectedEntry.place.address || '已确认高德位置'}</p></div><button className="icon-button" aria-label="取消选中地点" onClick={() => setSelected(undefined)}><Icon name="close" size={18}/></button></div>}
   </div><div className="map-bottom"><span><span className="live-dot"/> {entries.length} 个已确认点位</span><span>{!entries.length ? (category !== 'all' ? '当前分类暂无已确认点位' : (readOnly?'此日暂无可显示的已确认点位':'确认地点位置或搜索添加，即可显示点位')) : category !== 'all' ? '分类筛选时隐藏路线' : overview ? '按天编号，查看整段旅程' : '确认位置后，地图与行程会同步更新'}</span></div></section>
  </main><footer className="page-footer"><span>山水之间 · 每段旅程，慢慢计划</span><span>{readOnly?'只读分享 · 地图与路线由高德提供':onPlanChange?'当前出行共享计划 · 地图与路线由高德提供':'原攻略内容参考 · 地图与路线由高德提供'}</span></footer></div>
  {!readOnly&&editingDay&&<DayDialog day={editingDay} onClose={()=>setEditingDay(null)} onSave={updated=>{const next=structuredClone(plan);next.days=next.days.map(d=>d.id===updated.id?updated:d);if(commit(next))setEditingDay(null);}}/>}
  {!readOnly&&search && <SearchDialog savedPlaces={plan.savedPlaceIds.map(id=>places.get(id)!)} onChooseSaved={addSaved} api={api} context={search} onClose={() => setSearch(null)} onChoose={choose}/>}
  {!readOnly&&edit && <EditStopDialog value={edit} days={plan.days} onClose={() => setEdit(null)} onSave={saveEdit} onResolve={() => { setEdit(null); openSearch(edit.place); }}/>}
  {!readOnly&&pendingImport && <Modal title="导入这份旅行计划？" onClose={() => setPendingImport(null)}><div className="import-preview"><h3>{pendingImport.title}</h3><p>{pendingImport.days.length} 天 · {pendingImport.places.length} 个地点</p><p className="muted">导入会替换当前浏览器中的计划。建议先导出当前计划作为备份。</p></div><div className="modal-actions"><button className="button" onClick={exportPlan}>先导出当前计划</button><button className="button primary" onClick={() => { commit(pendingImport); setDayIndex(0); setTab('itinerary'); setSelected(undefined); setPendingImport(null); setToast('计划已导入'); }}>确认替换</button></div></Modal>}
  {toast && <div className="toast" role="status"><Icon name="info" size={18}/>{toast}<button aria-label="关闭提示" onClick={() => setToast('')}><Icon name="close" size={16}/></button></div>}
 </div>;
}
function DayDialog({day,onSave,onClose}:{day:Day;onSave:(day:Day)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState({...day});
 return <Modal title="编辑当天安排" onClose={onClose}><form onSubmit={event=>{event.preventDefault();onSave({...draft,title:draft.title.trim(),defaultSearchCity:draft.defaultSearchCity.trim()});}}><div className="edit-form"><label>当天主题<input value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})} maxLength={100} required/></label><label>主要城市<input value={draft.defaultSearchCity} onChange={event=>setDraft({...draft,defaultSearchCity:event.target.value})} maxLength={80} required/></label><label>当天说明<input value={draft.subtitle} onChange={event=>setDraft({...draft,subtitle:event.target.value})} maxLength={300}/></label></div><div className="modal-actions"><button type="button" className="button" onClick={onClose}>取消</button><button className="button primary" type="submit">保存当天安排</button></div></form></Modal>;
}
