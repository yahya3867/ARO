"use client";

import { useEffect, useState } from "react";

import { HollowScene } from "../aro/hollow-scene";

import { Roamers } from "./scene";

const REPO_URL = "https://github.com/yahya3867/ARO";
const DEMO_ID = "gyXCHbkH4Xs";
// Verified against the published YouTube player.
const DEMO_DURATION_SECONDS = 135;
const DEMO_URL = `https://www.youtube.com/watch?v=${DEMO_ID}`;

function clock(s: number) {
    const t = Math.max(0, Math.floor(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function Landing({ appUrl = "/canvas" }: {
    resource?: boolean;
    appUrl?: string;
} = {}) {
    const [open, setOpen] = useState(false);
    // `open` mounts the popup; `shown` drives its fade and rise, a frame later on open and before unmount on close.
    const [shown, setShown] = useState(false);
    const openVideo = () => {
        setOpen(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    };
    const closeVideo = () => {
        setShown(false);
        setTimeout(() => setOpen(false), 250);
    };
    useEffect(() => {
        if (!open) return;
        const close = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [open]);
    return (<div className={"relative h-dvh overflow-hidden " + "bg-[#353733]"}>
      <HollowScene />
      <Roamers resource/>


      <main className="pointer-events-none absolute inset-x-0 top-0 z-[200] flex h-[62%] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-[96px] leading-none font-semibold tracking-[-0.05em] text-white sm:text-[160px]">
          aro
        </h1>
        <p className="mt-3 max-w-full whitespace-nowrap text-[clamp(11px,3vw,17px)] leading-relaxed font-medium text-white sm:text-[20px]">Autonomous resource operations for communities</p>

        <div className="pointer-events-auto mt-8 flex flex-wrap justify-center gap-3">
          <div className="group relative">
            <button type="button" onClick={openVideo} className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[15px] font-semibold text-[#1f3b5a] shadow-[0_4px_0_rgb(31_59_90/0.18)] transition-transform hover:-translate-y-0.5">
              <span className="h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-current"/>
              Watch the demo
            </button>
            {/* The top padding bridges the gap, so moving down from the button keeps the preview open. */}
            <div className="invisible absolute top-full left-1/2 w-[300px] -translate-x-1/2 translate-y-1 pt-4 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              <button type="button" onClick={openVideo} aria-label="Play the demo" className="relative block w-full overflow-hidden rounded-xl border-[3px] border-white bg-black shadow-[0_6px_0_rgb(31_59_90/0.2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${DEMO_ID}/hqdefault.jpg`} alt="" className="aspect-video w-full object-cover"/>
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow">
                    <span className="ml-1 h-0 w-0 border-y-[8px] border-l-[12px] border-y-transparent border-l-[#1f3b5a]"/>
                  </span>
                </span>
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{clock(DEMO_DURATION_SECONDS)}</span>
              </button>
            </div>
          </div>
          <a href={REPO_URL} className="flex items-center gap-2 rounded-xl bg-[#1f3b5a] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_4px_0_rgb(0_0_0/0.18)] transition-transform hover:-translate-y-0.5">
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            GitHub
          </a>
          {<a href={appUrl} className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[15px] font-semibold text-[#1f3b5a] shadow-[0_4px_0_rgb(31_59_90/0.18)] transition-transform hover:-translate-y-0.5">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/></svg>
            Open webapp
          </a>}
        </div>
      </main>

      {open && (<div role="dialog" aria-modal="true" aria-label="ARO demo video" className={`absolute inset-0 z-[300] flex items-center justify-center p-6 transition-all duration-300 ease-out ${shown ? "bg-[#1f3b5a]/60 backdrop-blur-sm" : "bg-[#1f3b5a]/0 backdrop-blur-none"}`} onClick={closeVideo}>
          <div className={`relative w-[min(960px,92vw)] overflow-hidden rounded-2xl border-4 border-white bg-black shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-[0.96] opacity-0"}`} onClick={(e) => e.stopPropagation()}>
            <iframe title="ARO demo — Patriot HackFest 2026" className="aspect-video w-full border-0" src={`https://www.youtube-nocookie.com/embed/${DEMO_ID}?autoplay=1&rel=0`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            <div className="flex items-center justify-between bg-white px-4 py-2 text-[12px] text-zinc-600">
              <a href={DEMO_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-950">Watch on YouTube ↗ · {clock(DEMO_DURATION_SECONDS)}</a>
              <button type="button" onClick={closeVideo} className="rounded-md px-2 py-1 font-medium hover:bg-zinc-100">Close video</button>
            </div>
          </div>
        </div>)}
    </div>);
}
