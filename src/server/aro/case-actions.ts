import { randomUUID } from "node:crypto";
import type { AppContext } from "../context";
import { nowIso, txImmediate } from "../context";
import { appendAudit } from "../audit";
import { recordActivity } from "../activity";
import { decide, needs, network, reviewTransfer } from "./service";
import type { Resource } from "./catalog";
import { transferRequest } from "./transfer-request";

export type CaseActionPayload = {amounts:{facility:string;units:number}[];fillRemaining:boolean;summary:string;warnings:string[]};
export type CaseAction = {id:string;kind:"approve"|"reject"|"revise";status:string;payload:CaseActionPayload};
export function caseBase(ctx:AppContext,id:string) {
  const i=ctx.sqlite.prepare("SELECT state,resource FROM incidents WHERE id=?").get(id) as {state:string;resource:Resource};
  return JSON.stringify({state:i.state,lines:transferRequest(ctx,id).lines,needs:needs(ctx,i.resource),network:network(ctx,i.resource)});
}
export function pendingCaseAction(ctx:AppContext,id:string) {
  const row=ctx.sqlite.prepare("SELECT id,kind,status,payload FROM case_actions WHERE incident=? AND status='pending' ORDER BY rowid DESC LIMIT 1").get(id) as (Omit<CaseAction,"payload"> & {payload:string})|undefined;
  return row?{...row,payload:JSON.parse(row.payload) as CaseActionPayload}:undefined;
}
export function proposeCaseAction(ctx:AppContext,id:string,message:number,kind:CaseAction["kind"],payload:CaseActionPayload) {
  const actionId=randomUUID();
  ctx.sqlite.prepare("INSERT INTO case_actions(id,message,incident,kind,payload,base) VALUES (?,?,?,?,?,?)").run(actionId,message,id,kind,JSON.stringify(payload),caseBase(ctx,id));
  return actionId;
}
/** Called only by the authenticated operations endpoint, never by a model tool. */
export function confirmCaseAction(ctx:AppContext,id:string,actionId:string,cancel=false) {
  return txImmediate(ctx,()=>{
    const action=ctx.sqlite.prepare("SELECT * FROM case_actions WHERE id=? AND incident=?").get(actionId,id) as {status:string;base:string;kind:CaseAction["kind"];payload:string;message:number}|undefined;
    if(!action) throw Error("Confirmation not found in this incident.");
    if(action.status===(cancel?"cancelled":"confirmed")) return;
    if(action.status!=="pending") throw Error("This confirmation is no longer current.");
    if(cancel) {
      ctx.sqlite.prepare("UPDATE case_actions SET status='cancelled' WHERE id=?").run(actionId);
      appendAudit(ctx,{actorId:"operator",category:"decision",action:"chat.cancel",workItemId:id,details:{actionId}});
      return;
    }
    if(caseBase(ctx,id)!==action.base) throw Error("Stock, routes or the request changed. Ask the agent to check the plan again.");
    if(action.kind==="revise") {
      const payload=JSON.parse(action.payload) as CaseActionPayload;
      const reviewed=reviewTransfer(ctx,id,payload.amounts,payload.fillRemaining);
      ctx.sqlite.prepare("INSERT INTO transfer_revisions VALUES (?,?,?,?,?)").run(actionId,id,JSON.stringify(reviewed.lines),JSON.stringify(reviewed.comparison),nowIso());
      ctx.sqlite.prepare("UPDATE replenishments SET units=? WHERE incident=? AND status='draft'").run(reviewed.comparison.aro.metrics.unmet,id);
      appendAudit(ctx,{actorId:"operator",category:"decision",action:"transfer.revise",workItemId:id,details:{actionId,lines:reviewed.lines,comparison:reviewed.comparison}});
      recordActivity(ctx,{actorId:"finance",workItemId:id,type:"TOOL_CALL",toolName:"revise_transfer_request",title:"Revised transfer request",result:{lines:reviewed.lines,comparison:reviewed.comparison,agentSummary:"I checked the operator’s revised split against current stock, routes and essential coverage. "+payload.summary+".",confirmation:actionId}});
    }
    decide(ctx,id,action.kind==="reject"?"reject":"approve");
    ctx.sqlite.prepare("UPDATE case_actions SET status='confirmed' WHERE id=?").run(actionId);
    ctx.sqlite.prepare("UPDATE case_actions SET status='superseded' WHERE incident=? AND status='pending'").run(id);
    appendAudit(ctx,{actorId:"operator",category:"decision",action:"chat.confirm",workItemId:id,details:{actionId,message:action.message}});
  });
}
