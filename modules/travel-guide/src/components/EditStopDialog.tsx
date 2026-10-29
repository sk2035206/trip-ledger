import {useState,type FormEvent} from 'react';
import type {Day,Place,PlaceType,Stop,TravelMode} from '../domain/types';
import {isManualMode,modeLabels,typeLabels} from '../domain/types';
import {Modal} from './Modal';
import {Icon} from './Icon';
export function EditStopDialog({value,days,onClose,onSave,onResolve}:{
 value:{stop:Stop;place:Place;day:Day};days:Day[];onClose:()=>void;
 onSave:(stop:Stop,target:string,placeType:PlaceType,remove?:boolean)=>void;onResolve:()=>void;
}){
 const [stop,setStop]=useState({...value.stop}),[target,setTarget]=useState(value.day.id),[placeType,setPlaceType]=useState(value.place.type),[remove,setRemove]=useState(false),[error,setError]=useState('');
 function submit(event:FormEvent){event.preventDefault();if(stop.durationMinutes!==undefined&&(!Number.isInteger(stop.durationMinutes)||stop.durationMinutes<0||stop.durationMinutes>1440)){setError('停留时间需为 0—1440 的整数分钟');return;}onSave(stop,target,placeType);}
 return <Modal title="编辑这一站" onClose={onClose}>
  <div className="edit-place"><span className={`place-icon ${placeType}`}><Icon name={placeType==='sight'?'mountain':placeType}/></span><div><h3>{value.place.name}</h3><p>{value.place.address||`${value.place.city} · 位置尚待确认`}</p></div></div>
  <form onSubmit={submit}>
   <div className="edit-form">
    <label>地点类型<select value={placeType} onChange={event=>setPlaceType(event.target.value as PlaceType)}>{Object.entries(typeLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><small>同一地点在其他日期和待选列表中的类型也会同步更新。</small></label>
    <label>安排在哪一天<select value={target} onChange={event=>setTarget(event.target.value)}>{days.map((d,i)=><option key={d.id} value={d.id}>Day {i+1} · {d.title}</option>)}</select></label>
    <label>从上一站如何抵达<select value={stop.incomingMode} onChange={event=>setStop({...stop,incomingMode:event.target.value as TravelMode})}>{Object.entries(modeLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><small>第一站无前序交通；地铁、高铁按实际线路或车次安排。</small></label>
    {isManualMode(stop.incomingMode)&&<label>交通说明<input value={stop.manualTransportNote||''} onChange={event=>setStop({...stop,manualTransportNote:event.target.value})} placeholder="例如：地铁2号线 / G1234 次高铁 / 索道 + 环保车" maxLength={500}/><small>可记录线路、车次和发车时间，此类交通段不计入道路路线用时。</small></label>}
    <label>计划停留（分钟）<input type="number" min={0} max={1440} step={1} value={stop.durationMinutes??''} onChange={event=>{setStop({...stop,durationMinutes:event.target.value===''?undefined:Number(event.target.value)});setError('');}} placeholder="例如：90"/><small>游览、用餐或休息的预留时间；留空表示尚未安排。</small></label>
    <label>行程备注<textarea rows={4} maxLength={2000} value={stop.note} onChange={event=>setStop({...stop,note:event.target.value})} placeholder="想做的事、需要准备的东西…"/></label>
    <button type="button" className="text-button green" onClick={onResolve}><Icon name="pin" size={16}/>{value.place.coordinate?'重新选择具体位置':'在高德中确认位置'}</button>
    {error&&<p className="edit-error" role="alert">{error}</p>}
   </div>
   <div className="modal-actions edit-actions">{remove?<span className="remove-confirm">移除这一站？<button type="button" className="text-button danger" onClick={()=>onSave(stop,target,placeType,true)}>确认移除</button><button type="button" className="text-button" onClick={()=>setRemove(false)}>取消</button></span>:<button type="button" className="text-button danger" onClick={()=>setRemove(true)}><Icon name="trash" size={16}/>移除这一站</button>}<button className="button primary" type="submit">保存安排</button></div>
  </form>
 </Modal>;
}
