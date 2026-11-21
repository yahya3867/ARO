import { z } from "zod";
import { cloudScope, cloudEnabled } from "@/server/aro/cloud-scope";
import { cloudStore } from "@/server/aro/cloud-store";
import { resourceHttp } from "@/server/aro/cloud-http";
import { verifyVisitorKey } from "@/server/aro/model";
import { setVisitorModelEnabled, visitorModelConfigured } from "@/server/aro/visitor-model";
import { appendAudit } from "@/server/audit";

export const dynamic="force-dynamic";
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("connect"),apiKey:z.string().trim().min(20).max(256)}).strict(),
  z.object({action:z.enum(["remove","enable","disable"])}).strict(),
]);
export function POST(req:Request) {return resourceHttp(req,mutate);}
async function mutate(req:Request) {
  const scope=cloudScope.getStore();
  if(!cloudEnabled() || !scope || !visitorModelConfigured()) return Response.json({error:"Visitor AI connections are unavailable in this deployment."},{status:409});
  const parsed=input.safeParse(await req.json().catch(()=>null));
  if(!parsed.success) return Response.json({error:"Invalid AI connection request."},{status:400});
  const {ctx}=scope.runtime;
  // This counter is persisted per workspace, including across Function instances.
  const recent=ctx.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='visitor.ai.connect.attempt' AND ts>?").get(new Date(Date.now()-3600000).toISOString()) as {n:number};
  if(parsed.data.action==="connect" && recent.n>=12) return Response.json({error:"Too many key connection attempts. Try again later."},{status:429});
  try {
    const store=cloudStore(),action=parsed.data.action;
    if(action==="connect") {
      appendAudit(ctx,{actorId:"operator",category:"system",action:"visitor.ai.connect.attempt",details:{provider:"openrouter"}});
      // Only the verified key reaches the separate encrypted credential store.
      await verifyVisitorKey(parsed.data.apiKey);
      ctx.modelCredential=await store.saveVisitorKey(scope.id,parsed.data.apiKey);
      ctx.config.llmAvailable=true;
      setVisitorModelEnabled(ctx,true);
    } else if(action==="remove") {
      await store.removeVisitorKey(scope.id);delete ctx.modelCredential;
      ctx.config.llmAvailable=false;setVisitorModelEnabled(ctx,false);
    } else {
      if(action==="enable" && !ctx.modelCredential) throw Error("Connect your OpenRouter key first.");
      setVisitorModelEnabled(ctx,action==="enable");
    }
    appendAudit(ctx,{actorId:"operator",category:"system",action:"visitor.ai."+action,details:{mode:ctx.config.defaultMode}});
    return Response.json({ok:true});
  } catch(error) {
    return Response.json({error:error instanceof Error && !/sk-or-|Bearer/i.test(error.message)?error.message:"Could not connect this API key."},{status:409});
  }
}
