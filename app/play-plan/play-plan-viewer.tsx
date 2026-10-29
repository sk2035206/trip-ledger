'use client';
import {useEffect,useRef,useState,type ChangeEvent,type FormEvent} from 'react';
import {loadWorkbenchSession} from '@/frontend/auth-client';
import {createEmptyPlan} from '@/frontend/travel-guide/create-plan';
import {createSeed} from '@/frontend/travel-guide/seed';
import {parsePlan} from '@/frontend/travel-guide/plan';
import type {TripPlan} from '@/frontend/travel-guide/types';
import {PlanSyncController,type PlanSyncStatus} from '@/frontend/travel-guide/sync';
import {App as TravelGuide} from '@/modules/travel-guide/src/App';
import {createGuideApi} from '@/modules/travel-guide/src/adapters/api';
import {Modal} from '@/modules/travel-guide/src/components/Modal';
import {Icon} from '@/modules/travel-guide/src/components/Icon';
import '@/modules/travel-guide/src/style.css';
import {PlanShareDialog} from './plan-share-dialog';
import {createPlanShareUrl} from '@/frontend/travel-guide/share';
const api=createGuideApi('/api/maps','/_AMapService');
type Snapshot={trip:{id:string;title:string;dates:string};plan:TripPlan|null;revision:string};
async function planRequest<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch(path,{...init,cache:'no-store',credentials:'include',headers:{'Content-Type':'application/json',...init?.headers},signal:init?.signal??AbortSignal.timeout(20000)});
 const body=await response.json();if(!response.ok)throw Object.assign(new Error(body.error||'游玩计划服务暂不可用'),{status:response.status});return body as T;
}
function homeUrl(tripId:string){const prefix=typeof window!=='undefined'&&window.location.pathname.startsWith('/ledger/')?'/ledger':'';return `${prefix}/?${new URLSearchParams({tripId,tab:'overview'})}`;}
export function PlayPlanViewer({tripId}:{tripId:string}){
 const [shareLink,setShareLink]=useState(''),[sharing,setSharing]=useState(false),[shareError,setShareError]=useState('');
 const [phase,setPhase]=useState<'loading'|'ready'|'error'|'login'>('loading'),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0),[confirmReload,setConfirmReload]=useState(false);
 const [sync,setSync]=useState<PlanSyncStatus>({state:'idle',message:'已读取共享计划'});const controller=useRef<PlanSyncController|null>(null);
 useEffect(()=>{
  const abort=new AbortController();let disposed=false;
  (async()=>{
   if(!tripId)throw new Error('请从出行管理选择一次出行，再打开游玩计划');
   const session=await loadWorkbenchSession();if(disposed)return;if(!session.authenticated){setPhase('login');return;}
   const data=await planRequest<Snapshot>(`/api/trips/${encodeURIComponent(tripId)}/play-plan`,{signal:abort.signal});if(disposed)return;
   const plan=data.plan?parsePlan(data.plan):null;
   controller.current=new PlanSyncController(data.revision,(next,revision)=>planRequest(`/api/trips/${encodeURIComponent(tripId)}/play-plan`,{method:'PUT',body:JSON.stringify({plan:next,revision})}),setSync);
   setSnapshot({...data,plan});setSync({state:'idle',message:plan?'已读取共享计划':'为这次出行创建游玩计划'});setPhase('ready');
  })().catch(reason=>{if(disposed)return;setError(reason instanceof Error?reason.message:'计划读取失败');setPhase('error');});
  return()=>{disposed=true;abort.abort();controller.current?.dispose();controller.current=null;};
 },[tripId,reload]);
 useEffect(()=>{if(!['saving','error','conflict'].includes(sync.state))return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[sync.state]);
 async function sharePlan(){
  if(!snapshot?.plan||!['idle','saved'].includes(sync.state)||sharing)return;
  setSharing(true);setShareError('');
  try{const result=await planRequest<{token:string}>(`/api/trips/${encodeURIComponent(tripId)}/play-plan/share`);const prefix=window.location.pathname.startsWith('/ledger/')?'/ledger':'';const url=createPlanShareUrl(window.location.origin,prefix,result.token);
   if(/MicroMessenger/i.test(navigator.userAgent)){window.location.href=url;return;}setShareLink(url);
  }catch(error){setShareError(error instanceof Error?error.message:'分享链接生成失败');}finally{setSharing(false);}
 }
 function refresh(){setConfirmReload(false);setPhase('loading');setReload(n=>n+1);}
 function start(plan:TripPlan){if(!snapshot)return;setSnapshot({...snapshot,plan});controller.current?.enqueue(plan);}
 return <div className="travel-guide h5-travel-guide">
  {phase!=='ready'&&<div className="guide-setup"><section className="guide-setup-card"><p className="eyebrow">出行 · 游玩计划</p><h1>{phase==='loading'?'正在读取游玩计划':phase==='login'?'请先登录工作台':'暂时无法打开计划'}</h1><p>{phase==='login'?'游玩计划与出行账本共用登录状态。':error}</p><div className="guide-start-actions">{phase==='error'&&<button className="button primary" onClick={refresh}>重新读取</button>}<button className="button" onClick={()=>{window.location.href=homeUrl(tripId);}}>返回出行</button></div></section></div>}
  {shareError&&<aside className="global-warning" role="alert">{shareError}</aside>}
  {phase==='ready'&&snapshot&&<>
   {['error','conflict'].includes(sync.state)&&<aside className="global-warning" role="alert"><Icon name="info"/><div><strong>{sync.message}</strong><p>页面仍保留当前草稿，可使用右上角“导出计划”备份。</p><div className="guide-start-actions">{sync.state==='error'&&<button className="button small" onClick={()=>controller.current?.retry()}>重试保存</button>}<button className="button small" onClick={()=>setConfirmReload(true)}>读取最新计划</button></div></div></aside>}
   {snapshot.plan?<TravelGuide key={`${tripId}:${reload}`} initialPlan={snapshot.plan} onPlanChange={next=>controller.current?.enqueue(next)} externalSaveStatus={sync.state==='conflict'?'存在冲突，草稿未保存':sync.state==='error'?'保存失败，草稿已保留':sync.message} backUrl={homeUrl(tripId)} tripDates={snapshot.trip.dates} tripTitle={snapshot.trip.title} api={api} onShare={sharePlan} shareDisabled={sharing||!['idle','saved'].includes(sync.state)}/>:<CreatePlan trip={snapshot.trip} onStart={start} backUrl={homeUrl(tripId)}/>}
  </>}
  {shareLink&&<PlanShareDialog url={shareLink} title={`${snapshot?.trip.title||'旅行'} · 游玩计划`} onClose={()=>setShareLink('')}/>}
  {confirmReload&&<Modal title="读取最新的共享计划？" onClose={()=>setConfirmReload(false)}><p className="muted">这会放弃当前页面中尚未保存的草稿。请先关闭此弹窗并导出草稿，再读取最新计划。</p><div className="modal-actions"><button className="button" onClick={()=>setConfirmReload(false)}>返回导出草稿</button><button className="button primary" onClick={refresh}>确认重新读取</button></div></Modal>}
 </div>;
}
function CreatePlan({trip,onStart,backUrl}:{trip:Snapshot['trip'];onStart:(plan:TripPlan)=>void;backUrl:string}){
 const [city,setCity]=useState(''),[days,setDays]=useState(5),[error,setError]=useState(''),[imported,setImported]=useState<TripPlan|null>(null);const file=useRef<HTMLInputElement>(null);
 function create(event:FormEvent){event.preventDefault();try{onStart(createEmptyPlan(trip.title,city,days));}catch(error){setError(error instanceof Error?error.message:'无法创建计划');}}
 async function loadFile(event:ChangeEvent<HTMLInputElement>){const input=event.target.files?.[0];event.target.value='';if(!input)return;try{if(input.size>2*1024*1024)throw new Error('文件不能超过 2 MB');setImported(parsePlan(JSON.parse(await input.text())));}catch(error){setError(error instanceof Error?error.message:'无法导入计划');}}
 return <div className="guide-setup"><section className="guide-setup-card"><button className="text-button" onClick={()=>{window.location.href=backUrl;}}>← 返回出行</button><p className="eyebrow" style={{marginTop:24}}>为这次出行，安排想去的地方</p><h1>{trip.title}</h1>{trip.dates&&<p>{trip.dates}</p>}<p>把景点、美食和住宿排进每日行程，在地图上查看位置与路线。保存后，同伴可以在其他设备打开这次出行继续查看。</p><form onSubmit={create}><div className="guide-setup-fields"><label>目的地城市<input value={city} onChange={event=>setCity(event.target.value)} placeholder="例如：长沙" maxLength={80} required/></label><label>行程天数<input type="number" min={1} max={60} value={days} onChange={event=>setDays(Number(event.target.value))} required/></label></div>{error&&<p role="alert" className="danger">{error}</p>}<div className="guide-start-actions"><button className="button primary" type="submit">创建游玩计划</button><button className="button" type="button" onClick={()=>file.current?.click()}>导入已有攻略</button></div></form><input ref={file} className="sr-only" type="file" accept="application/json,.json" onChange={loadFile} aria-label="导入已有攻略"/><button className="text-button" style={{marginTop:24}} onClick={()=>setImported(createSeed())}>使用长沙 + 张家界五日示例</button></section>{imported&&<Modal title="将这份攻略关联当前出行？" onClose={()=>setImported(null)}><div className="import-preview"><h3>{imported.title}</h3><p>{imported.days.length} 天 · {imported.places.length} 个地点</p><p>将保存到「{trip.title}」的共享游玩计划。</p></div><div className="modal-actions"><button className="button" onClick={()=>setImported(null)}>取消</button><button className="button primary" onClick={()=>onStart(imported)}>确认使用</button></div></Modal>}</div>;
}
