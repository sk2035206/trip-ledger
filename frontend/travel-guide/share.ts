import type {TripPlan} from './types';
export type SharedPlayPlan={trip:{title:string;dates:string};plan:TripPlan};
export function createPlanShareUrl(origin:string,basePath:string,token:string){
 const url=new URL(`${basePath}/play-plan/share`,origin);url.searchParams.set('token',token);return url.toString();
}
