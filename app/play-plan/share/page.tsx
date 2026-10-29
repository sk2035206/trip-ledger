import type {Metadata} from 'next';
import {ReadOnlyPlanViewer} from './read-only-plan-viewer';
import type {SharedPlayPlan} from '@/frontend/travel-guide/share';
export const dynamic='force-dynamic';
const backend=process.env.TRIP_LEDGER_API_URL??'http://127.0.0.1:5174';
const siteUrl=(process.env.NEXT_PUBLIC_SITE_URL??'https://jcxxy.cn/ledger/').replace(/\/?$/,'/');
type Props={searchParams:Promise<{token?:string}>};
export async function generateMetadata({searchParams}:Props):Promise<Metadata>{
 const query=await searchParams,token=typeof query.token==='string'?query.token:'';let snapshot:SharedPlayPlan|null=null;
 try{if(token&&token.length<=400){const response=await fetch(`${backend}/api/play-plan-shares/${encodeURIComponent(token)}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(response.ok)snapshot=await response.json();}}catch{/* Metadata must still render a generic title if the service is unavailable. */}
 const title=snapshot?`${snapshot.trip.title} · 游玩计划`:'只读游玩计划';
 const description=snapshot?`${snapshot.plan.days.length} 天游玩安排，查看景点、美食、住宿及地图路线。`:'查看分享的游玩计划与地图路线。';
 const url=new URL('play-plan/share',siteUrl);if(token)url.searchParams.set('token',token);
 return {title,description,referrer:'origin',robots:{index:false,follow:false},openGraph:{title,description,url:url.toString(),type:'website',locale:'zh_CN',images:[{url:new URL('/api/share-card.png',siteUrl).toString(),width:1200,height:630,alt:title}]},twitter:{card:'summary_large_image',title,description,images:[new URL('/api/share-card.png',siteUrl).toString()]}};
}
export default async function SharePlayPlanPage({searchParams}:Props){const query=await searchParams;return <ReadOnlyPlanViewer key={typeof query.token==='string'?query.token:''} token={typeof query.token==='string'?query.token:''}/>;}
