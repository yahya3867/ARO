"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { PixelAgent } from "../pixel-agent";

const CREW = ["agent.capacity", "agent.compute", "agent.finance", "you", "agent.vendor", "agent.budget", "agent.policy"] as const;

const RESOURCE_LINES: Record<(typeof CREW)[number], string[]> = {
    "agent.capacity": ["taking the lower tunnel", "room for one more crate", "next stop: level eight"],
    "agent.compute": ["these crates don't add up", "counted every last kit", "found the missing shipment!"],
    "agent.finance": ["every level counts", "a fair share for everyone", "need comes before rank"],
    you: ["hi team!", "let's reach the deep levels", "who needs a hand?"],
    "agent.vendor": ["someone has spare supplies", "sharing beats stockpiling", "checking the next depot"],
    "agent.budget": ["planning past the next ration", "watching the water supply", "let's catch shortages early"],
    "agent.policy": ["deep levels count too", "the quota needs a second look", "fairness is in the policy"],
};

type Walker = {
    x: number;
    y: number;
    /** Seconds for the current move; 0 while held. */
    dur: number;
    ease: string;
    left: boolean;
    moving: boolean;
    held: boolean;
    /** Bumped on each landing, so the squash replays. */
    landed: number;
    /** Degrees it swings away from the direction you drag it. */
    lean: number;
};

const ZONE = { x0: 8, x1: 92, y0: 72, y1: 92 };

function start(i: number): Walker {
    const x = ZONE.x0 + ((i + 0.5) / CREW.length) * (ZONE.x1 - ZONE.x0);
    const y = ZONE.y0 + ((i * 37) % 100) / 100 * (ZONE.y1 - ZONE.y0);
    return { x, y, dur: 0, ease: "linear", left: false, moving: false, held: false, landed: 0, lean: 0 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Roamers({}: {
    resource?: boolean;
} = {}) {
    const [walkers, setWalkers] = useState<Walker[]>(() => CREW.map((_, i) => start(i)));
    // The live positions; state is a copy for rendering.
    const cur = useRef<Walker[]>(walkers);
    const timers = useRef<number[]>([]);
    const box = useRef<HTMLDivElement>(null);
    const drag = useRef<{
        i: number;
        dx: number;
        dy: number;
        lastX: number;
        t: number;
    } | null>(null);
    const settle = useRef(0);
    const still = useRef(false);
    const stepRef = useRef<(i: number) => void>(() => { });
    const [say, setSay] = useState<{
        i: number;
        text: string;
        n: number;
    } | null>(null);
    // Every so often one of them says something short.
    useEffect(() => {
        let t = 0;
        let n = 0;
        const next = (wait: number) => {
            t = window.setTimeout(() => {
                const free = CREW.map((_, i) => i).filter((i) => !cur.current[i].held);
                if (free.length) {
                    const i = free[Math.floor(Math.random() * free.length)];
                    const lines = (RESOURCE_LINES)[CREW[i]];
                    setSay({ i, text: lines[Math.floor(Math.random() * lines.length)], n: ++n });
                    t = window.setTimeout(() => {
                        setSay(null);
                        next(2500 + Math.random() * 4000);
                    }, 2800);
                }
                else
                    next(1500);
            }, wait);
        };
        next(1800);
        return () => window.clearTimeout(t);
    }, []);
    const update = (i: number, patch: (w: Walker) => Walker) => {
        cur.current = cur.current.map((w, j) => (j === i ? patch(w) : w));
        setWalkers(cur.current);
    };
    useEffect(() => {
        still.current = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
        const list = timers.current;
        const step = (i: number) => {
            const w = cur.current[i];
            if (w.held)
                return;
            if (w.moving) {
                update(i, (v) => ({ ...v, moving: false }));
                list[i] = window.setTimeout(() => step(i), 1200 + Math.random() * 3200);
                return;
            }
            const x = ZONE.x0 + Math.random() * (ZONE.x1 - ZONE.x0);
            const y = ZONE.y0 + Math.random() * (ZONE.y1 - ZONE.y0);
            const dur = Math.max(1.6, Math.hypot(x - w.x, (y - w.y) * 2) / 4.5);
            update(i, (v) => ({ ...v, x, y, dur, ease: "linear", left: x < v.x, moving: true }));
            list[i] = window.setTimeout(() => step(i), dur * 1000);
        };
        stepRef.current = step;
        if (!still.current)
            CREW.forEach((_, i) => (list[i] = window.setTimeout(() => step(i), 400 + i * 450)));
        return () => list.forEach((t) => window.clearTimeout(t));
    }, []);
    /** Pointer position as % of the scene. */
    const at = (e: {
        clientX: number;
        clientY: number;
    }) => {
        const r = box.current!.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
    };
    const grab = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        window.clearTimeout(timers.current[i]);
        const p = at(e);
        // Hold it where you grabbed it, but the left/top transition is still running: read where it is now.
        const r = box.current!.getBoundingClientRect();
        const el = e.currentTarget.getBoundingClientRect();
        const feetX = ((el.left + el.width / 2 - r.left) / r.width) * 100;
        const feetY = ((el.bottom - r.top) / r.height) * 100;
        drag.current = { i, dx: feetX - p.x, dy: feetY - p.y, lastX: e.clientX, t: e.timeStamp };
        update(i, (w) => ({ ...w, x: feetX, y: feetY, dur: 0, moving: false, held: true }));
    };
    const move = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.i !== i)
            return;
        const p = at(e);
        const x = clamp(p.x + d.dx, 2, 98);
        // Swing like a pendulum: drag right and the body trails left.
        const speed = (e.clientX - d.lastX) / Math.max(8, e.timeStamp - d.t);
        d.lastX = e.clientX;
        d.t = e.timeStamp;
        const lean = clamp(-speed * 28, -40, 40);
        update(i, (w) => ({ ...w, x, y: clamp(p.y + d.dy, 12, 99), lean, left: x < w.x ? true : x > w.x ? false : w.left }));
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => update(i, (w) => ({ ...w, lean: 0 })), 90);
    };
    const drop = (i: number) => () => {
        if (drag.current?.i !== i)
            return;
        drag.current = null;
        update(i, (w) => {
            const y = clamp(w.y, ZONE.y0, ZONE.y1);
            // Falls under gravity when let go above the meadow.
            const fall = y > w.y + 1 ? Math.min(0.9, 0.25 + Math.sqrt((y - w.y) / 100) * 0.7) : 0.15;
            return { ...w, lean: 0, x: clamp(w.x, ZONE.x0, ZONE.x1), y, dur: fall, ease: "cubic-bezier(0.55, 0, 1, 0.45)", held: false, landed: w.landed + 1 };
        });
        if (!still.current)
            timers.current[i] = window.setTimeout(() => stepRef.current(i), 1600 + Math.random() * 1500);
    };
    return (<div ref={box} className="pointer-events-none absolute inset-0" aria-hidden>
      {walkers.map((w, i) => {
            const id = CREW[i];
            // Further back is smaller.
            const depth = w.held ? 1.25 : clamp((w.y - ZONE.y0) / (ZONE.y1 - ZONE.y0), 0, 1);
            const size = (id === "you" ? 56 : 44) * (0.78 + depth * 0.32);
            return (<div key={id} className={cn("pointer-events-auto absolute touch-none select-none", w.held ? "cursor-grabbing" : "cursor-grab")} onPointerDown={grab(i)} onPointerMove={move(i)} onPointerUp={drop(i)} onPointerCancel={drop(i)} style={{
                    left: w.x + "%",
                    top: w.y + "%",
                    zIndex: w.held ? 400 : Math.round(w.y),
                    transform: "translate(-50%, -100%)",
                    transition: w.dur ? `left ${w.dur}s ${w.ease}, top ${w.dur}s ${w.ease}` : "none",
                }}>
            {say?.i === i && !w.held && (<div key={say.n} className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap">
                <div className="px-say relative rounded-lg border-2 border-[#1f3b5a] bg-white px-2 py-1 text-[12px] leading-none font-semibold text-[#1f3b5a] shadow-[0_2px_0_rgb(31_59_90/0.2)]">
                  {say.text}
                  <span className="absolute top-full left-1/2 -mt-px size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r-2 border-b-2 border-[#1f3b5a] bg-white"/>
                </div>
              </div>)}
            <div className="px-lean" style={{ transform: "rotate(" + w.lean + "deg)" }}>
              <div key={w.landed} className={cn(w.held ? "px-held" : w.landed ? "px-land" : undefined)} style={{ "--px-fall": w.dur + "s", animationDelay: w.held ? -(i * 0.13) + "s" : undefined } as React.CSSProperties}>
                <div className={cn(w.moving && "px-run")} style={{ transform: w.left ? "scaleX(-1)" : undefined }}>
                  <div className="px-kick">
                    <PixelAgent actorId={(id === "you" ? "aro.operator" : id.replace("agent.", "aro."))} size={Math.round(size)} working={w.moving || w.held} className="h-auto"/>
                  </div>
                </div>
              </div>
            </div>
            {/* a soft shadow under the feet, left on the ground while held */}
            <div className="mx-auto -mt-1 h-1.5 rounded-full bg-[#3f7a2c]/25 transition-opacity" style={{ width: size * 0.6, opacity: w.held ? 0 : 1 }}/>
          </div>);
        })}
    </div>);
}
