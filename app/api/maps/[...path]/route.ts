import {proxyPlanRequest} from '../../trips/[tripId]/play-plan/proxy';
export async function GET(request:Request,context:{params:Promise<{path:string[]}>}){
 const {path}=await context.params;
 return proxyPlanRequest(request,`/api/maps/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`,'GET');
}
