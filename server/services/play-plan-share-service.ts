import {createPlanShareToken,verifyPlanShareToken} from '../auth/play-plan-share';
import {PlayPlanError,type getPlayPlanRepository} from '../mysql/play-plan-repository';
import {parsePlan,coordinateText} from '../../frontend/travel-guide/plan';
import type {SharedPlayPlan} from '../../frontend/travel-guide/share';
type Repository=Pick<ReturnType<typeof getPlayPlanRepository>,'get'>;
export function createPlayPlanShareService(repository:Repository,secret:string){
 return {
  async create(tripId:string){const snapshot=await repository.get(tripId);if(!snapshot.plan)throw new PlayPlanError('请先创建并保存游玩计划，再分享',409);return {token:createPlanShareToken(tripId,secret)};},
  async read(token:unknown):Promise<SharedPlayPlan>{
   const tripId=verifyPlanShareToken(token,secret);if(!tripId)throw new PlayPlanError('分享链接无效或已失效',404);
   const snapshot=await repository.get(tripId);if(!snapshot.plan)throw new PlayPlanError('这份游玩计划暂时无法查看',404);
   const plan=parsePlan(snapshot.plan),used=new Set([...plan.savedPlaceIds,...plan.days.flatMap(day=>day.stops.map(stop=>stop.placeId))]);
   return {trip:{title:snapshot.trip.title,dates:snapshot.trip.dates},plan:{...plan,places:plan.places.filter(place=>used.has(place.id))}};
  }
 };
}
export function isSharedRouteAllowed(snapshot:SharedPlayPlan,origin:string|null,destination:string|null,mode:string|null){
 if(!origin||!destination||!['walking','cycling','driving'].includes(mode||''))return false;
 const places=new Map(snapshot.plan.places.map(place=>[place.id,place]));
 return snapshot.plan.days.some(day=>day.stops.slice(1).some((to,index)=>{
  const a=places.get(day.stops[index].placeId),b=places.get(to.placeId);
  return a?.locationStatus==='confirmed'&&b?.locationStatus==='confirmed'&&coordinateText(a)===origin&&coordinateText(b)===destination&&to.incomingMode===mode;
 }));
}
