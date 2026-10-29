import type { Day, Place, RouteLeg, Stop } from '../domain/types';
import { modeLabels, typeLabels, isManualMode } from '../domain/types';
import { distanceText, durationText } from '../domain/plan';
import { Icon } from './Icon';
export function StopCard({ stop, place, index, day, selected, leg, onSelect, onResolve, onEdit, onMove, onDrop, onDrag, readOnly = false }: {
    readOnly?: boolean;
    stop: Stop;
    place: Place;
    index: number;
    day: Day;
    selected: boolean;
    leg?: RouteLeg;
    onSelect: () => void;
    onResolve: () => void;
    onEdit: () => void;
    onMove: (delta: number) => void;
    onDrop: () => void;
    onDrag: () => void;
}) {
    return <div className="timeline-item" onDragOver={readOnly?undefined:e=>e.preventDefault()} onDrop={readOnly?undefined:e=>{e.preventDefault();onDrop();}}>
 {index > 0 && <div className={`travel-leg ${leg?.status === 'error' || leg?.status === 'missing' ? 'leg-warning' : ''}`}><Icon name={stop.incomingMode === 'walking' ? 'walk' : stop.incomingMode === 'cycling' ? 'bike' : stop.incomingMode === 'driving' || stop.incomingMode === 'subway' || stop.incomingMode === 'rail' ? 'transport' : 'route'} size={14}/><span>{modeLabels[stop.incomingMode]}</span><span className="leg-dot">·</span><span>{leg?.status === 'success' && leg.result ? `${distanceText(leg.result.distance)} / ${durationText(leg.result.duration)}` : leg?.status === 'error' || leg?.status === 'missing' ? leg.message : isManualMode(stop.incomingMode) ? (stop.manualTransportNote || '按实际交通安排') : leg ? '规划中…' : '生成路线后查看距离与用时'}</span></div>}
 <div className="timeline-stop"><span className={`stop-number ${selected ? 'selected' : ''}`}>{String(index + 1).padStart(2, '0')}</span><article id={`stop-${stop.id}`} className={`stop-card ${selected ? 'selected' : ''}`}>
 <div className="stop-card-top"><span className={`type-label ${place.type}`}><Icon name={place.type === 'sight' ? 'mountain' : place.type} size={14}/>{typeLabels[place.type]}</span>{!readOnly&&<div className="stop-tools"><button className="icon-button compact" aria-label={`上移 ${place.name}`} disabled={index === 0} onClick={() => onMove(-1)}><Icon name="up" size={16}/></button><button className="icon-button compact" aria-label={`下移 ${place.name}`} disabled={index === day.stops.length - 1} onClick={() => onMove(1)}><Icon name="down" size={16}/></button><span className="drag-handle" draggable onDragStart={e => { e.dataTransfer.setData('text/plain', stop.id); onDrag(); }} title="拖动以调整顺序"><Icon name="grip" size={16}/></span></div>}</div>
 <button className="place-title" onClick={onSelect}>{place.name}</button>
 <p className="stop-note">{stop.note || '给这一站留一点期待。'}</p>
 {stop.durationMinutes!==undefined&&<p className="stop-duration"><Icon name="clock" size={13}/>计划停留 {durationText(stop.durationMinutes*60)}</p>}
 <div className="stop-bottom">{place.locationStatus === 'confirmed' ? <button className="location-status confirmed" onClick={onSelect}><Icon name="check" size={13}/>已确认位置</button> : <button className="location-status unresolved" onClick={readOnly?undefined:onResolve} disabled={readOnly}><Icon name="pin" size={13}/>{readOnly?'位置待确认':'确认位置'}{!readOnly&&<Icon name="arrow" size={13}/>}</button>}{!readOnly&&<button className="text-button" onClick={onEdit}>编辑安排</button>}</div>
 </article></div></div>;
}
