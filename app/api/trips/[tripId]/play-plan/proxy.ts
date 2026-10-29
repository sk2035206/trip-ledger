const backendBaseUrl=process.env.TRIP_LEDGER_API_URL??'http://127.0.0.1:5174';
export async function proxyPlanRequest(request:Request,path:string,method:'GET'|'PUT'){
 const headers=new Headers({Accept:'application/json','Content-Type':'application/json'});
 for(const name of ['Cookie','X-Trip-Ledger-Client','X-Workbench-Session']){const value=request.headers.get(name);if(value)headers.set(name,value);}
 try{
  const response=await fetch(backendBaseUrl+path,{method,headers,cache:'no-store',signal:AbortSignal.timeout(25000),...(method==='PUT'?{body:await request.text()}:{})});
  const responseHeaders=new Headers({'Content-Type':response.headers.get('Content-Type')||'application/json','Cache-Control':'no-store'});
  const cookie=response.headers.get('Set-Cookie');if(cookie)responseHeaders.set('Set-Cookie',cookie);
  return new Response(await response.arrayBuffer(),{status:response.status,headers:responseHeaders});
 }catch{return Response.json({error:'无法连接游玩计划服务，请稍后重试'},{status:502});}
}
