import type {ServerResponse} from 'node:http';
import {AmapConfig} from '../config/amap-config';
import {createAmapClient,ApiError} from './amap-client.mjs';
import type {SharedPlayPlan} from '../../frontend/travel-guide/share';
import {isSharedRouteAllowed} from '../services/play-plan-share-service';
import {sendJson} from '../http/json';
export async function handleSharedMaps(response:ServerResponse,url:URL,action:string,snapshot:SharedPlayPlan){
 try{
  const config=AmapConfig.load();
  if(action==='config'){sendJson(response,200,{webKey:config.webKey});return;}
  if(action==='route'){
   const origin=url.searchParams.get('origin'),destination=url.searchParams.get('destination'),mode=url.searchParams.get('mode');
   if(!isSharedRouteAllowed(snapshot,origin,destination,mode)){sendJson(response,403,{error:'分享页只能查看计划中相邻地点的既定路线'});return;}
   sendJson(response,200,await createAmapClient(config).route(origin,destination,mode));return;
  }
  sendJson(response,404,{error:'分享页不提供此功能'});
 }catch(error){sendJson(response,error instanceof ApiError?error.status:502,{error:error instanceof ApiError?error.message:'地图服务暂不可用'});}
}
