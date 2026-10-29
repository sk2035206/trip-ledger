'use client';
import {useEffect,useMemo,useState} from 'react';
import type {SharedPlayPlan} from '@/frontend/travel-guide/share';
import {createPlanShareUrl} from '@/frontend/travel-guide/share';
import {parsePlan} from '@/frontend/travel-guide/plan';
import {App as TravelGuide} from '@/modules/travel-guide/src/App';
import {createGuideApi} from '@/modules/travel-guide/src/adapters/api';
import {WechatShare} from '@/app/wechat-share';
import {PlanShareDialog} from '../plan-share-dialog';
import '@/modules/travel-guide/src/style.css';
const signatureUrl=process.env.NEXT_PUBLIC_WECHAT_SIGNATURE_URL??'https://jcxxy.cn/gzh/api/wechat/signature';
export function ReadOnlyPlanViewer({token}:{token:string}){
 const [snapshot,setSnapshot]=useState<SharedPlayPlan|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[sharing,setSharing]=useState(false),[hint,setHint]=useState('');
 useEffect(()=>{const controller=new AbortController();
  (async()=>{
   if(!token||token.length>400)throw new Error('分享链接无效，请联系分享者重新提供链接');
   // Always fetch in the visitor's browser: this also sets the restricted, HTTP-only map-view cookie.
   const response=await fetch(`/api/play-plan-shares/${encodeURIComponent(token)}`,{cache:'no-store',credentials:'include',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});const body=await response.json();
   if(!response.ok)throw new Error(body.error||'暂时无法查看这份计划');
   if(typeof body.trip?.title!=='string'||typeof body.trip?.dates!=='string')throw new Error('分享内容暂时无法读取');
   if(!controller.signal.aborted)setSnapshot({trip:{title:body.trip.title,dates:body.trip.dates},plan:parsePlan(body.plan)});
  })().catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'读取分享计划失败');});
  return()=>controller.abort();
 },[token,retry]);
 const prefix=typeof window!=='undefined'&&window.location.pathname.startsWith('/ledger/')?'/ledger':'';
 const url=typeof window!=='undefined'?createPlanShareUrl(window.location.origin,prefix,token):'';
 const title=snapshot?`${snapshot.trip.title} · 游玩计划`:'只读游玩计划';
 const stableApi=useMemo(()=>createGuideApi(`/api/play-plan-shares/${encodeURIComponent(token)}/maps`,'/_AMapService'),[token]);
 function share(){if(/MicroMessenger/i.test(navigator.userAgent)){setHint('请点击微信右上角，分享给好友或朋友圈');return;}setSharing(true);}
 return <div className="travel-guide h5-travel-guide read-only-plan">
  {!snapshot&&<div className="guide-setup"><section className="guide-setup-card"><p className="eyebrow">只读游玩计划</p><h1>{error?'暂时无法查看计划':'正在读取游玩计划'}</h1><p>{error||'无需登录，即可查看分享者最新保存的每日安排与地图。'}</p>{error&&<button className="button" onClick={()=>{setError('');setRetry(value=>value+1);}}>重新读取</button>}</section></div>}
  {snapshot&&<><WechatShare title={title} description={`${snapshot.plan.days.length} 天行程 · 景点、美食、住宿与地图路线，只读查看。`} link={url} imageUrl={typeof window!=='undefined'?new URL('/api/share-card.png',window.location.origin).toString():''} signatureEndpoint={signatureUrl} priority={1}/><TravelGuide key={token} initialPlan={snapshot.plan} readOnly tripTitle={snapshot.trip.title} tripDates={snapshot.trip.dates} api={stableApi} onShare={share}/></>}
  {sharing&&<PlanShareDialog title={title} url={url} onClose={()=>setSharing(false)}/>}
  {hint&&<div className="toast" role="status">{hint}<button aria-label="关闭提示" onClick={()=>setHint('')}>×</button></div>}
 </div>;
}
