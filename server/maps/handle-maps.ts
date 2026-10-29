import type {IncomingMessage,ServerResponse} from 'node:http';
import {AmapConfig} from '../config/amap-config';
import {createAmapClient,ApiError,sdkTarget} from './amap-client.mjs';
import {sendJson} from '../http/json';
export async function handleMaps(request:IncomingMessage,response:ServerResponse,url:URL,path:string){
 try{
  const origin=request.headers.origin,host=request.headers.host;
  if(origin&&origin!==`http://${host}`&&origin!==`https://${host}`){sendJson(response,403,{error:'不允许跨站访问地图服务'});return;}
  const config=AmapConfig.load(),api=createAmapClient(config);
  if(path==='/api/maps/config'){sendJson(response,200,{webKey:config.webKey});return;}
  if(path==='/api/maps/places'){sendJson(response,200,await api.search(url.searchParams.get('q'),url.searchParams.get('city')));return;}
  if(path==='/api/maps/route'){sendJson(response,200,await api.route(url.searchParams.get('origin'),url.searchParams.get('destination'),url.searchParams.get('mode')));return;}
  if(path.startsWith('/api/maps/_AMapService/')){
   const target=sdkTarget(path.slice('/api/maps/_AMapService'.length),url.search,config);
   const upstream=await fetch(target,{signal:AbortSignal.timeout(15000)});
   response.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store'});
   response.end(Buffer.from(await upstream.arrayBuffer()));return;
  }
  sendJson(response,404,{error:'地图接口不存在'});
 }catch(error){sendJson(response,error instanceof ApiError?error.status:502,{error:error instanceof ApiError?error.message:'地图服务暂不可用，请检查服务端高德配置或网络'});}
}
