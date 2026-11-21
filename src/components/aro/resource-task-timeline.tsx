"use client";

import type { ReactNode } from "react";
import type { Snapshot } from "@/server/aro/runtime";
import { ResourceFeed } from "./resource-feed";
import { ResourceDoneFinale } from "./resource-done-card";

/** Stable, distinct child identities across approval, completion and polling.
 * Like ARO, a completed task ends with its finale, after the recorded work. */
export function ResourceTaskTimeline({data,showHistory,justFinished,paused,onEvidence,conversation}:{
  data:Snapshot;showHistory:boolean;justFinished:boolean;paused:boolean;
  onEvidence:(id:number)=>void;conversation:ReactNode;
}) {
  const id=data.current?.id;
  const completed=data.current?.state==="completed";
  return <div className="space-y-5">
    {(showHistory||completed) && <ResourceFeed key={`feed:${id}`} data={data} onEvidence={onEvidence} paused={paused}/>}
    {completed && <ResourceDoneFinale key={`completion:${id}`} data={data} justFinished={justFinished}/>}
    {conversation}
  </div>;
}
