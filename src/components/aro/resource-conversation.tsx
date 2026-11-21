"use client";
import { Check, LoaderCircle } from "lucide-react";
import type { Snapshot } from "@/server/aro/runtime";
import { AroAvatar } from "./aro-avatar";

export function ResourceConversation({data,pending,onEvidence,onAction,busy,offline}:{
  data:Snapshot;pending:string|null;onEvidence:(id:number)=>void;
  onAction:(id:string,cancel:boolean)=>void;busy:boolean;offline:boolean;
}) {
  if(!data.messages.length && !pending) return null;
  const latest=data.messages.at(-1)?.id;
  return <div className="mt-5 space-y-4 border-t border-zinc-100 pt-5" role="log" aria-label="Conversation with Resource Allocator" aria-live="polite">
    {data.messages.map(m=>{
      const action=data.chatActions?.find(a=>a.message===m.id);
      return <div key={m.id} className="space-y-4">
        <UserMessage text={m.question} />
        <div className="animate-enter text-[13.5px] leading-relaxed whitespace-pre-wrap text-zinc-800">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-zinc-500"><AroAvatar actorId="finance" size={20}/>Resource Allocator</div>
          {m.answer}
          <button type="button" className="mt-2 block text-[12px] text-zinc-500 hover:text-zinc-900" onClick={()=>onEvidence(m.evidence)}>View evidence ↗</button>
          {action?.status==="pending" && latest===m.id ? <div className="animate-enter mt-3 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
            <div className="px-3.5 pt-3 text-[11.5px] text-zinc-500">On confirm</div>
            <div className="flex items-start gap-2.5 px-3.5 pt-2 pb-3"><AroAvatar actorId={action.kind==="reject"?"finance":"capacity"} size={24}/><div className="min-w-0 text-[13px] leading-snug font-medium text-zinc-900">{action.payload.summary}{action.payload.warnings.map(w=><p key={w} className="mt-2 text-[12px] font-normal text-amber-800">{w}</p>)}</div></div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-3 py-2">
              <button type="button" disabled={busy||offline||!!pending} onClick={()=>onAction(action.id,true)} className="rounded-md px-3 py-1.5 text-[12.5px] text-zinc-500 hover:bg-zinc-100 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={busy||offline||!!pending} onClick={()=>onAction(action.id,false)} className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{busy?<LoaderCircle size={13} className="animate-spin"/>:<Check size={13}/>}Confirm</button>
            </div>
          </div> : action?.status==="confirmed" ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent/70 px-4 py-3 text-[13px]"><Check size={15}/>{action.kind==="reject"?"Transfer declined.":"Transfer authorized."}</div> : action?.status==="cancelled" ? <p className="mt-2 text-[12px] text-zinc-500">Cancelled. No transfer was authorized.</p> : null}
        </div>
      </div>;
    })}
    {pending ? <><UserMessage text={pending}/><div role="status" aria-label="Resource Allocator is replying" className="flex gap-1 py-1">{[0,150,300].map(d=><span key={d} className="size-1.5 animate-pulse rounded-full bg-zinc-300 motion-reduce:animate-none" style={{animationDelay:d+"ms"}}/>)}</div></>:null}
  </div>;
}
function UserMessage({text}:{text:string}) {
  return <div className="animate-enter flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-3.5 py-2 text-[13.5px] leading-snug whitespace-pre-wrap text-zinc-900">{text}</div></div>;
}
