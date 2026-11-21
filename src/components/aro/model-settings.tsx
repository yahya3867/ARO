"use client";

import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import type { Snapshot } from "@/server/aro/runtime";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

export function ModelSettings({data,offline,onChanged}:{data?:Snapshot;offline:boolean;onChanged:()=>Promise<void>}) {
  const [open,setOpen]=useState(false),[apiKey,setApiKey]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [showKey,setShowKey]=useState(false);
  const access=data?.modelAccess;
  if(!access?.supported) return null;
  const active=data?.mode==="Model-assisted" && access.connected;
  async function act(action:"connect"|"remove"|"enable"|"disable") {
    if(busy||offline) return;
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/model-session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...(action==="connect"?{apiKey}:{})})});
      const result=await response.json();
      if(!response.ok) throw Error(result.error??"Could not update AI mode.");
      setApiKey("");setShowKey(false);await onChanged();
    } catch(e) {setError(e instanceof Error?e.message:"Could not update AI mode.");}
    finally {setBusy(false);}
  }
  return <>
    <Button variant="ghost" size="sm" aria-label="AI mode settings" onClick={()=>{setOpen(true);setError("");}}><Sparkles/>{active?"AI on":"AI mode"}</Button>
    <Dialog open={open} onOpenChange={value=>{setOpen(value);if(!value){setApiKey("");setShowKey(false);setError("");}}}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold tracking-tight">Connect your AI</DialogTitle>
          <DialogDescription>The crew can use your OpenRouter key to investigate, explain its work and discuss decisions with you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-[13px] leading-relaxed text-zinc-600">
          <div className="rounded-xl bg-zinc-50 px-3.5 py-3 ring-1 ring-zinc-100"><b className="text-zinc-900">{active?"LLM mode":access.connected?"Deterministic mode · key connected":"Deterministic mode"}</b><p className="mt-1">{access.connected?`Connection expires ${new Date(access.expiresAt!).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}.`:"No key is needed for the deterministic demo."}</p></div>
          {!access.connected ? <form onSubmit={event=>{event.preventDefault();void act("connect");}} className="space-y-3">
            <div>
              <label htmlFor="openrouter-api-key" className="block text-[12.5px] font-medium text-zinc-900">OpenRouter API key</label>
              <div className="relative mt-1.5">
                <input id="openrouter-api-key" type={showKey?"text":"password"} aria-label="OpenRouter API key" autoComplete="off" autoCapitalize="none" spellCheck={false} value={apiKey} onChange={event=>setApiKey(event.target.value)} placeholder="sk-or-v1-…" disabled={busy||offline} className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pr-16 pl-3 font-normal outline-none focus:border-zinc-400"/>
                <button type="button" aria-label={showKey?"Hide API key":"Show API key"} aria-controls="openrouter-api-key" aria-pressed={showKey} disabled={busy||offline} onClick={()=>setShowKey(value=>!value)} className="absolute inset-y-1 right-1 rounded-md px-2 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{showKey?"Hide":"Show"}</button>
              </div>
            </div>
            <p className="text-[12px] text-zinc-500">Your key is sent securely to ARO’s server and OpenRouter. It is encrypted on the server, scoped to this workspace, and expires after one hour. It is never saved in browser storage or operational records.</p>
            <p className="text-[12px] text-zinc-500">Model: {access.model}. Usage is billed to your OpenRouter account. We recommend a dedicated key with a spending limit.</p>
            <Button type="submit" disabled={busy||offline||!apiKey.trim()} className="w-full">{busy&&<LoaderCircle className="animate-spin"/>}Connect and enable LLM mode</Button>
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="block text-center text-[12px] text-brand-ink underline underline-offset-2">Get an OpenRouter key ↗</a>
          </form> : <div className="flex flex-wrap gap-2">
            <Button disabled={busy||offline} onClick={()=>void act(active?"disable":"enable")}>{busy&&<LoaderCircle className="animate-spin"/>}{active?"Use deterministic mode":"Enable LLM mode"}</Button>
            <Button variant="outline" disabled={busy||offline} onClick={()=>void act("remove")}>Remove key</Button>
          </div>}
          <p className="text-[12px] text-zinc-500">Inventory calculations and transfer approvals stay under application control. Removing the key stops new AI work; a request already in flight may finish. Reset demo clears the connection.</p>
          {offline&&<p role="status" className="text-amber-800">Reconnect to manage your AI connection.</p>}
          {error&&<p role="alert" className="text-red-700">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
