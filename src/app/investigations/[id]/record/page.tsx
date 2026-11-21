import Link from "next/link";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {snapshot,requestRuntime} from "@/server/aro/runtime";
import {scenarios,crew} from "@/server/aro/catalog";
import {WorkspaceHeader} from "@/components/workspace-header";
import {AroLogo} from "@/components/aro/aro-logo";
import {headline} from "@/lib/resource-headlines";
import {resourceRead} from "@/server/aro/cloud-http";
export default async function RecordPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const req=new Request("http://localhost",{headers:await headers()});
 const data=await resourceRead(req,()=>snapshot(id,requestRuntime(req)));
 if(!data.current||data.current.id!==id)notFound();
 const current=data.current;
 return <div className="h-dvh overflow-y-auto"><WorkspaceHeader active="canvas" logo={<AroLogo/>}><Link className="text-sm" href={"/canvas?task="+id}>Back to task</Link></WorkspaceHeader><main className="mx-auto max-w-3xl px-6 py-10"><small>{id} · {current.state}</small><h1 className="my-2 text-3xl font-semibold tracking-tight">{scenarios[current.resource]}</h1><p className="mb-6 text-sm text-zinc-500">Operational record · {data.events.length} execution events</p>
 {data.lines.map(l=><p key={l.route} className="border-t py-2 text-sm">{data.facilities[l.source??""]} → {data.facilities[l.facility]} · {l.units} {current.unit}</p>)}
 {data.order&&<p className="mb-5 text-sm">Replenishment · {data.order.units} {current.unit} · {data.order.status}</p>}
 {data.events.slice().reverse().map(e=><details key={e.id} className="border-t py-3"><summary className="cursor-pointer text-sm"><span className="mr-3 text-xs text-zinc-500">{crew.find(a=>a.id===e.actor)?.name??e.actor}</span>{headline(e,current.unit)}</summary><pre className="mt-2 overflow-auto rounded bg-zinc-50 p-3 text-xs">{JSON.stringify(e.result,null,2)}</pre></details>)}
 <Link className="mt-5 block underline" href={"/audit?task="+id}>Open audit record</Link></main></div>;
}
