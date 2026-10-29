import type { Place, RouteLeg } from '../domain/types';
import { standaloneApi, type GuideApi } from './api';
export interface MapEntry {
    key: string;
    label: string;
    place: Place;
    dayIndex: number;
    stopId?: string;
}
type Overlay = {
    on(event: string, callback: () => void): void;
    setContent?(content: HTMLElement): void;
};
type MapInstance = {
    add(overlays: Overlay | Overlay[]): void;
    remove(overlays: Overlay[]): void;
    setFitView(overlays?: Overlay[], immediately?: boolean, padding?: number[], maxZoom?: number): void;
    setZoomAndCenter(zoom: number, center: number[]): void;
    setCenter(center: number[]): void;
    setCity(city: string): void;
    getZoom(): number;
    zoomIn(): void;
    zoomOut(): void;
    resize(): void;
    destroy(): void;
};
type SDK = {
    Map: new (element: HTMLElement, options: object) => MapInstance;
    Marker: new (options: object) => Overlay;
    Polyline: new (options: object) => Overlay;
    Pixel: new (x: number, y: number) => unknown;
};
let loading: Promise<SDK> | undefined;
function sdk(): SDK | undefined { return (window as unknown as {
    AMap?: SDK;
}).AMap; }
export function loadMap(api: GuideApi = standaloneApi): Promise<SDK> {
    if (sdk())
        return Promise.resolve(sdk()!);
    if (loading)
        return loading;
    loading = (async () => {
        const { webKey } = await api.getConfig();
        (window as unknown as {
            _AMapSecurityConfig: object;
        })._AMapSecurityConfig = { serviceHost: location.origin + api.sdkBase };
        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            const timer = setTimeout(() => { script.remove(); reject(new Error('地图加载超时，请检查网络或 Key 的来源限制')); }, 20000);
            script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(webKey)}`;
            script.async = true;
            script.onload = () => { clearTimeout(timer); if (sdk())
                resolve();
            else
                reject(new Error('高德地图初始化失败，请检查 Key 的产品类型')); };
            script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('无法连接高德地图，请检查网络后重试')); };
            document.head.append(script);
        });
        return sdk()!;
    })().catch(error => { loading = undefined; throw error; });
    return loading;
}
const colors = ['#28594b', '#9b6038', '#4a6c94', '#8a668e', '#748355'];
export class AmapAdapter {
    private map: MapInstance;
    private markers: Overlay[] = [];
    private lines: Overlay[] = [];
    private entries: MapEntry[] = [];
    private observer: ResizeObserver;
    private selectedKey?: string;
    constructor(private api: SDK, element: HTMLElement) { this.map = new api.Map(element, { zoom: 12, center: [112.976, 28.195], viewMode: '2D', mapStyle: 'amap://styles/normal', showLabel: true }); this.observer = new ResizeObserver(() => this.map.resize()); this.observer.observe(element); }
    private content(entry: MapEntry, selected = false) { const node = document.createElement('button'); node.type = 'button'; node.className = `map-pin ${selected ? 'selected' : ''} pin-${entry.place.type}`; node.style.setProperty('--pin-color', colors[entry.dayIndex % colors.length]); const label = document.createElement('span'); label.textContent = entry.label; node.append(label); node.title = entry.place.name; node.setAttribute('aria-label', `${entry.label} ${entry.place.name}`); return node; }
    update(entries: MapEntry[], legs: RouteLeg[], onSelect: (entry: MapEntry) => void) {
        this.map.remove([...this.markers, ...this.lines]);
        this.entries = entries;
        this.markers = entries.filter(e => e.place.coordinate).map(entry => { const c = entry.place.coordinate!; const marker = new this.api.Marker({ position: [c.lng, c.lat], content: this.content(entry, entry.key === this.selectedKey), offset: new this.api.Pixel(-18, -38), zIndex: 120 }); marker.on('click', () => onSelect(entry)); return marker; });
        this.entries = entries.filter(e => e.place.coordinate);
        this.lines = legs.filter(l => l.status === 'success' && l.result).map(leg => new this.api.Polyline({ path: leg.result!.points, strokeColor: '#28594b', strokeWeight: 5, strokeOpacity: .85, lineJoin: 'round', showDir: true, zIndex: 60 }));
        this.map.add([...this.markers, ...this.lines]);
        this.fit();
    }
    select(key: string | undefined) { this.selectedKey = key; this.markers.forEach((marker, i) => marker.setContent?.(this.content(this.entries[i], this.entries[i].key === key))); const p = this.entries.find(e => e.key === key)?.place.coordinate; if (p)
        this.map.setZoomAndCenter(Math.max(this.map.getZoom(), 14), [p.lng, p.lat]); }
    fit() { if (this.markers.length || this.lines.length)
        this.map.setFitView([...this.markers, ...this.lines], false, [60, 45, 80, 45], 15); }
    city(city: string) { this.map.setCity(city); }
    zoom(delta: number) { if (delta > 0)
        this.map.zoomIn();
    else
        this.map.zoomOut(); }
    destroy() { this.observer.disconnect(); this.map.destroy(); }
}
