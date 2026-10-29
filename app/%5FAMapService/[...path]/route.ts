import {proxyPlanRequest} from '../../api/trips/[tripId]/play-plan/proxy';
// AMap's security mode requires _AMapService as a first-level URL segment.
export async function GET(request:Request,context:{params:Promise<{path:string[]}>}){
 const {path}=await context.params;
 return proxyPlanRequest(request,`/api/maps/_AMapService/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`,'GET');
}
