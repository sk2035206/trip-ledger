// Local-only browser fixture. All plan and ledger writes stay in memory.
import {createServer} from 'node:http';
import {fakePool} from './play-plan-db.mjs';
import {createPlayPlanRepository} from '../../server/mysql/play-plan-repository.ts';
import {handleMaps} from '../../server/maps/handle-maps.ts';
const pool=fakePool(),repo=createPlayPlanRepository(pool);
const state={people:[],categories:[],trips:[{id:'one',title:'长沙 + 张家界',dates:'5天4晚',members:[],sharedExpenses:[],travelCosts:[],personalExpenses:[]},{id:'two',title:'另一场旅行',dates:'2026-11',members:[],sharedExpenses:[],travelCosts:[],personalExpenses:[]}]};
for(const trip of state.trips)pool.data.trips.set(trip.id,trip);
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/auth/session')return json(res,200,{authenticated:true,sessionDays:7});
 if(url.pathname==='/api/state'&&req.method==='GET')return json(res,200,{state,revision:'preview-ledger'});
 if(url.pathname.startsWith('/api/maps/'))return await handleMaps(req,res,url,url.pathname);
 const match=url.pathname.match(/^\/api\/trips\/(one|two)\/play-plan$/);
 if(match){
  if(req.method==='GET')return json(res,200,await repo.get(match[1]));
  if(req.method==='PUT'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());return json(res,200,await repo.save(match[1],body.plan,body.revision));}
 }
 if(url.pathname==='/__preview/status')return json(res,200,{writes:pool.data.writes,planCount:pool.data.plans.size});
 json(res,404,{error:'Preview endpoint not found'});
 }catch(error){json(res,error.status||500,{error:error.message});}
}).listen(5178,'127.0.0.1',()=>console.log('Isolated browser fixture: http://127.0.0.1:5178'));
