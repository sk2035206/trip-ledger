import http from 'node:http';
import {isIP} from 'node:net';
import {networkInterfaces} from 'node:os';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createAmapClient,ApiError,sdkTarget} from './server/api.mjs';
const root=fileURLToPath(new URL('./',import.meta.url));
let local={};try{local=JSON.parse(await readFile(new URL('config/local.json',import.meta.url),'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('无法读取 config/local.json，请检查 JSON 格式');}
const config={webKey:process.env.AMAP_WEB_KEY||local.webKey,securityCode:process.env.AMAP_SECURITY_CODE||local.securityCode,serviceKey:process.env.AMAP_SERVICE_KEY||local.serviceKey,port:Number(process.env.TRAVEL_GUIDE_PORT||local.port||5180)};
if(['webKey','securityCode','serviceKey'].some(k=>typeof config[k]!=='string'||!/^[a-f\d]{32}$/i.test(config[k])))throw new Error('请在 config/local.json 或环境变量中配置有效的高德三项密钥');
if(!Number.isInteger(config.port)||config.port<1024||config.port>65535)throw new Error('端口应为 1024—65535');
config.host=process.env.TRAVEL_GUIDE_HOST||(process.argv.includes('--lan')?'0.0.0.0':local.host||'127.0.0.1');
if(!isIP(config.host)&&config.host!=='localhost')throw new Error('监听地址应为有效 IP 或 localhost');
const production=process.argv.includes('--production');
let vite;
if(!production){const {createServer}=await import('vite');vite=await createServer({root,server:{middlewareMode:true},appType:'spa'});}
const amap=createAmapClient(config);
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  const api=url.pathname.startsWith('/api/')||url.pathname.startsWith('/_AMapService/');
  if(api){
   if(req.method!=='GET')return json(res,405,{error:'仅支持 GET 请求'});
   const host=req.headers.host;
   if(req.headers.origin&&req.headers.origin!==`http://${host}`&&req.headers.origin!==`https://${host}`)return json(res,403,{error:'不允许跨站访问'});
   if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'不允许跨站访问'});
   if(url.pathname==='/api/config')return json(res,200,{webKey:config.webKey});
   if(url.pathname==='/api/places')return json(res,200,await amap.search(url.searchParams.get('q'),url.searchParams.get('city')));
   if(url.pathname==='/api/route')return json(res,200,await amap.route(url.searchParams.get('origin'),url.searchParams.get('destination'),url.searchParams.get('mode')));
   if(url.pathname.startsWith('/_AMapService/')){
    const target=sdkTarget(url.pathname.slice('/_AMapService'.length),url.search,config);
    const upstream=await fetch(target,{signal:AbortSignal.timeout(15000)});
    res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store'});
    return res.end(Buffer.from(await upstream.arrayBuffer()));
   }
   return json(res,404,{error:'接口不存在'});
  }
  if(/^\/(config|server)(\/|\.|$)/.test(url.pathname)||url.pathname.startsWith('/@fs/'))return json(res,404,{error:'文件不存在'});
  if(!production)return vite.middlewares(req,res,()=>json(res,404,{error:'页面不存在'}));
  const dist=resolve(root,'dist'),path=resolve(dist,`.${decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)}`);
  if(!path.startsWith(dist+sep))return json(res,404,{error:'文件不存在'});
  let data;try{data=await readFile(path);}catch{return json(res,404,{error:'文件不存在，请先执行 npm run build'});}
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(data);
 }catch(error){json(res,error instanceof ApiError?error.status:502,{error:error instanceof ApiError?error.message:'服务请求失败，请检查网络后重试'});}
});
server.listen(config.port,config.host,()=>{
 console.log(`Travel Guide: http://127.0.0.1:${config.port}`);
 if(config.host==='0.0.0.0'||config.host==='::'){
  for(const addresses of Object.values(networkInterfaces()))for(const address of addresses||[])if(address.family==='IPv4'&&!address.internal)console.log(`LAN: http://${address.address}:${config.port}`);
 }else if(!['127.0.0.1','localhost','::1'].includes(config.host))console.log(`LAN: http://${config.host}:${config.port}`);
});
async function close(){await vite?.close();server.close(()=>process.exit(0));}
process.once('SIGINT',close);process.once('SIGTERM',close);
