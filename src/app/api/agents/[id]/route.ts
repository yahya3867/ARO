import {requestRuntime,demoId} from "@/server/aro/runtime";
import {employeeView} from "@/server/aro/employees";
import {executionMode} from "@/server/aro/service";
import {crew} from "@/server/aro/catalog";
import {resourceHttp} from "@/server/aro/cloud-http";
export const dynamic="force-dynamic";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  return resourceHttp(req, () => read(req, params));
}
async function read(req:Request,params:Promise<{id:string}>){
  const {id}=await params;
  const member=crew.find(a=>"aro."+a.id===id);
  if(!member)return Response.json({error:"Unknown resource employee"},{status:404});
  const {ctx}=requestRuntime(req);
  return Response.json({...employeeView(ctx,member.id,executionMode(ctx)),demo:!!demoId(req)});
}
