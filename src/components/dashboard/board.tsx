"use client";

import { BOARD_STAGES, type BoardStage } from "@/lib/agent-steps";

import { ResourceMarker, type MarkerColor } from "../aro/resource-marker";

const STAGE_MARKER: Record<BoardStage, MarkerColor> = {
  investigate: "yellow",
  propose: "peach",
  needs_you: "pink",
  vendor: "purple",
  done: "green",
};

export function StageBoard({entries,resource=false}:{entries:(stage:BoardStage)=>{count:number;cards:React.ReactNode};resource?:boolean}){
  return (
    <div className="bg-canvas h-full overflow-auto">
      <div className="flex min-h-full min-w-max px-4 py-6">
        {BOARD_STAGES.map(({key,label})=>{
          const {count,cards}=entries(key);
          return (
            <div key={key} className="flex w-[208px] flex-1 flex-col border-r border-dashed border-zinc-200 px-5 last:border-r-0">
              <div className="mb-3 flex h-8 items-center gap-2">
                <ResourceMarker color={STAGE_MARKER[key]} size={16} />
                <span className="text-[14px] font-medium text-zinc-900">{resource && key==="vendor"?"Supplier":label}</span>
                <span className="text-[13px] text-zinc-400 tnum">{count}</span>
              </div>
              <div className="flex flex-1 flex-col gap-4 pt-2">
                {cards}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
