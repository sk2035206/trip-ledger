import { useEffect, useRef, useState } from 'react';
import { AmapAdapter, loadMap, type MapEntry } from '../adapters/map';
import type { RouteLeg } from '../domain/types';
import { Icon } from './Icon';
import type { GuideApi } from '../adapters/api';
export function MapPanel({ entries, legs, selectedKey, onSelect, city, overview, visible, api }: {
    entries: MapEntry[];
    legs: RouteLeg[];
    selectedKey?: string;
    onSelect: (entry: MapEntry) => void;
    city: string;
    overview: boolean;
    visible: boolean;
    api?: GuideApi;
}) {
    const container = useRef<HTMLDivElement>(null), adapter = useRef<AmapAdapter | null>(null);
    const [status, setStatus] = useState('loading');
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => { let disposed = false; loadMap(api).then(api => { if (disposed || !container.current)
        return; adapter.current = new AmapAdapter(api, container.current); setStatus('ready'); }).catch(error => { if (!disposed) {
        setStatus('error');
        setError(error.message);
    } }); return () => { disposed = true; adapter.current?.destroy(); adapter.current = null; }; }, [attempt, api]);
    useEffect(() => { if (status !== 'ready')
        return; adapter.current?.update(entries, legs, onSelect); if (!entries.length)
        adapter.current?.city(city); }, [entries, legs, onSelect, city, status]);
    useEffect(() => { if (status === 'ready')
        adapter.current?.select(selectedKey); }, [selectedKey, status, entries]);
    useEffect(() => { if (visible)
        requestAnimationFrame(() => adapter.current?.fit()); }, [visible]);
    return <section className="map-panel" aria-label="行程地图">
  <div ref={container} className="amap-container"/>
  <div className="map-heading"><span className="live-dot"/><span>高德地图</span><span className="map-heading-divider"/>{overview ? '全程点位' : `${city} · 当日点位`}</div>
  {status === 'loading' && <div className="map-state"><span className="spinner"/><strong>正在展开旅途地图</strong><p>连接高德地图服务…</p></div>}
  {status === 'error' && <div className="map-state"><Icon name="pin" size={32}/><strong>地图暂时没有加载成功</strong><p>{error}</p><button className="button" onClick={() => { setStatus('loading'); setAttempt(n => n + 1); }}>重新加载</button></div>}
  <div className="map-controls"><button aria-label="查看全部点位" title="查看全部点位" onClick={() => adapter.current?.fit()}><Icon name="target"/></button><button aria-label="放大地图" onClick={() => adapter.current?.zoom(1)}><Icon name="plus"/></button><button aria-label="缩小地图" onClick={() => adapter.current?.zoom(-1)}><span className="minus">−</span></button></div>
  <div className="map-caption"><span className="caption-line"/>实线为已生成的道路路线 <span>·</span> 未确认地点不显示标记</div>
 </section>;
}
