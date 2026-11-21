"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Check, LoaderCircle, Minus, X } from "lucide-react";

import type { Check as CheckRow, FrameSpec, MatchSpec, StackSpec, ThreadSpec, TimelineSpec, Tone } from "@/lib/frames";

import { cn } from "@/lib/utils";

export const DW = 640;

export const DH = 480;

type Timeline = {
  lanes: number[];
  match: number[];
  result: number;
  stack: number;
  legend: number[];
  forecast: [number, number];
  steps: number[];
  messages: number[];
  query?: [number, number];
  rows: number[];
  bars: number[];
  draftHead: number;
  draftBody?: [number, number];
  checks: number[];
  summary: number;
  total: number;
};

const RESOLVE_MS = 260;

export function buildTime(spec: FrameSpec) {
  return timeline(spec).total;
}

function timeline(spec: FrameSpec): Timeline {
  let t = 200;
  const tl: Timeline = {
    lanes: [],
    match: [],
    result: 0,
    stack: 0,
    legend: [],
    forecast: [0, 0],
    steps: [],
    messages: [],
    rows: [],
    bars: [],
    draftHead: 0,
    checks: [],
    summary: 0,
    total: 0,
  };
  const each = (count: number, gap: number, into: number[]) => {
    for (let i = 0; i < count; i++) {
      into.push(t);
      t += gap;
    }
  };

  if (spec.timeline) {
    each(spec.timeline.lanes.length, 420, tl.lanes);
    t += 300;
  }
  if (spec.match) {
    each(spec.match.rows.length + 1, 300, tl.match);

    tl.result = t;
    t += 400;
  }
  if (spec.stack) {
    tl.stack = t;
    t += 700;
    each(spec.stack.parts.length, 160, tl.legend);
  }
  if (spec.stockForecast) {
    tl.forecast = [t, 1400];
    t += 1600;
  }
  if (spec.thread) {
    each(spec.thread.steps.length, 220, tl.steps);
    each(spec.thread.messages.length, 500, tl.messages);
  }
  if (spec.query) {
    const d = Math.min(1500, spec.query.text.length * 14);
    tl.query = [t, d];
    t += d + 220;
  }
  each(spec.table?.rows.length ?? 0, 130, tl.rows);
  if (spec.table) t += 150;
  each(spec.bars?.length ?? 0, 300, tl.bars);

  if (spec.draft) {
    tl.draftHead = t;
    t += 260;
    const d = Math.min(2800, spec.draft.body.length * 11);
    tl.draftBody = [t, d];
    t += d + 220;
  }
  each(spec.checks?.length ?? 0, 360, tl.checks);
  tl.summary = t;
  t += 300;

  tl.total = t + 200;
  return tl;
}

function useElapsed(play: boolean, delay: number, total: number) {
  const [t, setT] = useState(play ? -delay : Infinity);
  useEffect(() => {
    if (!play) return;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const e = now - start;
      if (e >= total) {
        setT(Infinity);
        return;
      }
      setT(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, delay, total]);
  return t;
}

function typed(text: string, t: number, span?: [number, number]) {
  if (!span) return text;
  const [start, dur] = span;
  if (t >= start + dur) return text;
  if (t <= start) return "";
  return text.slice(0, Math.floor(((t - start) / dur) * text.length));
}

const SQL_WORDS = /\b(SELECT|FROM|WHERE|JOIN|ON|AND|AS|ORDER BY|GROUP BY|LIMIT|MATCH|SUM)\b|('[^']*'?)/g;

function Highlight({ text, lang }: { text: string; lang: "sql" | "json" | "call" }) {
  if (lang === "json") {
    return (
      <>
        {text.split(/("[^"]*"\s*:)/g).map((part, i) =>
          part.endsWith(":") ? (
            <span key={i} className="text-zinc-400">
              {part}
            </span>
          ) : (
            <span key={i} className="text-[#c4ebb2]">
              {part}
            </span>
          ),
        )}
      </>
    );
  }
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(SQL_WORDS)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={m.index} className={m[2] ? "text-[#c4ebb2]" : "text-[#7cc95d]"}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

function Caret({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="ml-0.5 inline-block h-[1.05em] w-[0.5em] translate-y-[0.15em] animate-pulse bg-current" />;
}

function CheckIcon({ ok, resolving }: { ok?: boolean; resolving: boolean }) {
  const box = "grid size-6 shrink-0 place-items-center rounded-full";
  if (resolving) return <span className={cn(box, "bg-zinc-100 text-zinc-500")}><LoaderCircle className="size-3.5 animate-spin" /></span>;
  if (ok === true) return <span className={cn(box, "bg-accent text-brand-ink")}><Check className="size-3.5" strokeWidth={3} /></span>;
  if (ok === false) return <span className={cn(box, "bg-red-50 text-destructive")}><X className="size-3.5" strokeWidth={3} /></span>;
  return <span className={cn(box, "bg-zinc-100 text-zinc-400")}><Minus className="size-3.5" /></span>;
}

function CheckList({ checks, at, t }: { checks: CheckRow[]; at: number[]; t: number }) {
  return (
    <ul className="mt-4 space-y-1.5">
      {checks.map((c, i) =>
        t >= at[i] ? (
          <li key={i} className="animate-enter flex items-start gap-3 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
            <CheckIcon ok={c.ok} resolving={t < at[i] + RESOLVE_MS} />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-zinc-800">{c.label}</div>
              {c.detail ? <div className="text-[12.5px] leading-snug text-zinc-500">{c.detail}</div> : null}
            </div>
          </li>
        ) : null,
      )}
    </ul>
  );
}

const TONE_BG: Record<Tone, string> = { base: "bg-zinc-400", ok: "bg-primary", warn: "bg-amber-400", bad: "bg-red-500", muted: "bg-zinc-200" };

const TONE_PILL: Record<Tone, string> = {
  base: "bg-zinc-100 text-zinc-600",
  ok: "bg-accent text-brand-ink",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-destructive",
  muted: "bg-zinc-100 text-zinc-500",
};

const grow = (t: number, start: number, dur: number) => Math.min(1, Math.max(0, (t - start) / dur));

const LANE_LABEL = 148;

function TimelineView({ spec, at, t }: { spec: TimelineSpec; at: number[]; t: number }) {
  const marksAt = (at.at(-1) ?? 0) + 500;
  return (
    <div className={cn("mt-4", spec.marks.length > 1 ? "pt-9" : "pt-5")}>
      <div className="relative">
        {spec.lanes.map((l, i) => {
          // Each lane fills left to right, in time order, so later spans never appear before earlier ones.
          const sweep = grow(t, at[i] + 100, 900);
          return t >= at[i] ? (
            <div key={l.key} className="animate-enter flex items-center gap-3 py-1.5">
              <div style={{ width: LANE_LABEL }} className="shrink-0">
                <div className="text-[13px] font-medium text-zinc-700">{l.label}</div>
                <div className={cn("text-[12px] tnum", l.tone === "bad" ? "text-destructive" : "text-zinc-500")}>{l.value}</div>
              </div>
              <div className="relative h-6 flex-1 rounded-md bg-zinc-50 ring-1 ring-zinc-100">
                {l.spans.map((s, j) =>
                  sweep > s.from ? (
                    <div
                      key={j}
                      className={cn("absolute inset-y-1 rounded-sm", TONE_BG[s.tone ?? l.tone])}
                      style={{ left: s.from * 100 + "%", width: Math.max(0.5, (Math.min(s.to, sweep) - s.from) * 100) + "%" }}
                    />
                  ) : null,
                )}
              </div>
            </div>
          ) : null;
        })}
        {t >= marksAt ? (
          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LANE_LABEL + 12 }}>
            {spec.marks.map((m, i) => (
              <div key={i} className="animate-enter absolute inset-y-0 border-l border-dashed border-zinc-500" style={{ left: m.at * 100 + "%" }}>
                <span
                  className={cn("absolute -translate-x-1/2 rounded px-1 text-[11px] whitespace-nowrap", m.tone === "ok" ? "bg-accent text-brand-ink" : "bg-zinc-800 text-white")}
                  style={{ top: -18 - (i % 2) * 18 }}
                >
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-zinc-400" style={{ marginLeft: LANE_LABEL + 12 }}>
        {spec.ticks.map((tk) => (
          <span key={tk.at} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: tk.at * 100 + "%" }}>
            {tk.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MatchView({ m, at, result, t }: { m: MatchSpec; at: number[]; result: number; t: number }) {
  const deltaTone = (r: MatchSpec["rows"][number]): Tone => (r.tone === "ok" || r.tone === "muted" ? "base" : r.tone);
  return (
    <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-zinc-200">
      {t >= at[0] ? (
        <div className="animate-enter flex items-center gap-3 bg-zinc-50 px-4 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">{m.head.label}</div>
            <div className="truncate text-[12px] text-zinc-500">{m.head.detail}</div>
          </div>
          <div className="text-[16px] font-semibold tnum">{m.head.value}</div>
        </div>
      ) : null}
      {m.rows.map((r, i) =>
        t >= at[i + 1] ? (
          <div key={i} title={r.detail} className="animate-enter flex items-center gap-3 border-t px-4 py-1.5">
            <span className={cn("size-2 shrink-0 rounded-full", TONE_BG[r.tone])} />
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="shrink-0 text-[13.5px] text-zinc-800">{r.label}</span>
              {r.detail ? <span className="truncate text-[12px] text-zinc-400">{r.detail}</span> : null}
            </div>
            {r.delta ? <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] whitespace-nowrap tnum", TONE_PILL[deltaTone(r)])}>{r.delta}</span> : null}
            <span className="w-[88px] shrink-0 text-right text-[14px] tnum">{r.value}</span>
          </div>
        ) : null,
      )}
      {t >= result ? (
        <div className={cn("animate-enter flex items-center justify-between gap-3 px-4 py-2 text-[14px] font-semibold", TONE_PILL[m.result.tone])}>
          <span className="truncate">{m.result.label}</span>
          <span className="tnum">{m.result.value}</span>
        </div>
      ) : null}
    </div>
  );
}

const PALETTE = ["bg-primary", "bg-brand-ink", "bg-zinc-700", "bg-zinc-400", "bg-amber-400"];

function StackView({ s, at, legend, t }: { s: StackSpec; at: number; legend: number[]; t: number }) {
  let next = 0;
  const colors = s.parts.map((p) => (p.tone === "muted" ? "bg-zinc-200" : PALETTE[next++ % PALETTE.length]));
  const sum = s.parts.reduce((a, p) => a + p.share, 0) || 1;
  const g = grow(t, at, 700);
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] tracking-wider text-zinc-400 uppercase">Split</span>
        <span className="text-[13px] text-zinc-600 tnum">{s.total}</span>
      </div>
      <div className="mt-1.5 flex h-8 overflow-hidden rounded-lg bg-zinc-100">
        {s.parts.map((p, i) => (
          <div key={i} className={cn("h-full border-r-2 border-white last:border-r-0", colors[i])} style={{ width: (p.share / sum) * 100 * g + "%" }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {s.parts.map((p, i) =>
          t >= legend[i] ? (
            <li key={i} className="animate-enter flex items-center gap-2.5 text-[13px]">
              <span className={cn("size-2.5 shrink-0 rounded-sm", colors[i])} />
              <span className="min-w-0 flex-1 truncate text-zinc-700">{p.label}</span>
              <span className="w-12 text-right text-zinc-400 tnum">{Math.round(p.share * 100)}%</span>
              <span className="w-[120px] text-right text-zinc-800 tnum">{p.display}</span>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

function StockForecastView({ forecast: f, span, t }: {
  forecast: NonNullable<FrameSpec["stockForecast"]>; span: [number, number]; t: number;
}) {
  const progress = grow(t, span[0], span[1]);
  const maximum = Math.max(1, f.stock, f.minimum) * 1.15;
  const x = (h: number) => 44 + h / f.hours * 516;
  const y = (stock: number) => 204 - stock / maximum * 164;
  const end = f.hours * progress;
  const remaining = Math.max(0, f.stock - f.daily * end / 24);
  const stockout = f.daily > 0 ? f.stock / f.daily * 24 : Infinity;
  const bend = Math.min(end, stockout);
  const line = `M 44 ${y(f.stock)} L ${x(bend)} ${y(Math.max(0, f.stock - f.daily * bend / 24))} L ${x(end)} ${y(remaining)}`;
  return (
    <div className="mt-4">
      <div className="text-[13px] text-zinc-500">{f.name} · {f.unit} on hand</div>
      <svg viewBox="0 0 600 238" role="img" aria-label={`Projected stock at ${f.name} over ${f.hours} hours, based on ${f.daily} ${f.unit} consumed per day`} className="mt-2 w-full">
        {[0, 0.5, 1].map(r => <g key={r}>
          <line x1="44" x2="560" y1={y(maximum * r)} y2={y(maximum * r)} stroke="#f4f4f5" />
          <text x="36" y={y(maximum * r) + 4} textAnchor="end" fill="#a1a1aa" fontSize="10">{Math.round(maximum * r)}</text>
        </g>)}
        <line x1="44" x2="560" y1={y(f.minimum)} y2={y(f.minimum)} stroke="#d97706" strokeDasharray="4 4" />
        <text x="560" y={y(f.minimum) - 7} textAnchor="end" fill="#a16207" fontSize="11">Essential minimum {f.minimum}</text>
        {progress > 0 && <g>
          <path d={line + ` L ${x(end)} 204 L 44 204 Z`} fill="#fee2e2" opacity=".5" />
          <path d={line} fill="none" stroke="#b91c1c" strokeWidth="2.5" />
          <circle cx={x(end)} cy={y(remaining)} r="4" fill="#b91c1c" />
        </g>}
        <text x="44" y="225" fill="#a1a1aa" fontSize="11">Now</text>
        <text x="560" y="225" textAnchor="end" fill="#a1a1aa" fontSize="11">{f.hours} h forecast</text>
      </svg>
      <p className="text-[13px] leading-relaxed text-zinc-600">{f.stock} {f.unit} counted. Weighted consumption is {f.daily} per day.
        {Number.isFinite(stockout) ? ` Projected stockout in ${Math.round(stockout * 10) / 10} hours without replenishment.` : " No consumption recorded."}
      </p>
    </div>
  );
}

function ThreadView({ th, steps, messages, t, scroll }: { th: ThreadSpec; steps: number[]; messages: number[]; t: number; scroll?: boolean }) {
  return (
    <div className="mt-4">
      <ol className="flex flex-wrap items-center gap-y-1 text-[12px]">
        {th.steps.map((s, i) =>
          t >= steps[i] ? (
            <li key={i} className="animate-enter flex items-center">
              {i > 0 ? <span className={cn("mx-2 h-px w-3", s.state === "todo" ? "bg-zinc-200" : "bg-zinc-300")} /> : null}
              <span
                className={cn(
                  "flex items-center gap-1 whitespace-nowrap",
                  s.state === "done" ? (s.tone === "bad" ? "text-destructive" : "text-zinc-700") : s.state === "now" ? "font-medium text-zinc-900" : "text-zinc-400",
                )}
              >
                {s.state === "done" ? (
                  s.tone === "bad" ? <X className="size-3" strokeWidth={3} /> : <Check className="size-3 text-brand-ink" strokeWidth={3} />
                ) : null}
                {s.state === "now" ? <LoaderCircle className="size-3 animate-spin text-zinc-500" /> : null}
                {s.label}
              </span>
            </li>
          ) : null,
        )}
      </ol>
      <div className="mt-4 space-y-2.5">
        {th.messages.map((m, i) =>
          t >= messages[i] ? (
            <EmailCard key={i} m={m} reply={i > 0} scroll={scroll} />
          ) : null,
        )}
      </div>
    </div>
  );
}

function EmailCard({ m, reply, scroll }: { m: ThreadSpec["messages"][number]; reply: boolean; scroll?: boolean }) {
  return (
    <div className={cn("animate-enter overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-zinc-200", reply && "ml-8")}>
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2 text-[11.5px] text-zinc-500">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/gmail.svg" alt="" className="h-3 w-4" />
        <span className="font-medium text-zinc-600">Gmail</span>
        {reply ? <span className="text-zinc-400">· Reply</span> : null}
        {m.at ? <span className="ml-auto tnum">{m.at}</span> : null}
      </div>
      <div className="px-4 pt-3 pb-3.5">
        {m.subject ? <div className="text-[14.5px] leading-snug font-semibold text-zinc-900">{m.subject}</div> : null}
        <div className={cn("flex items-center gap-2.5", m.subject && "mt-2.5")}>
          {m.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.logo} alt="" className="size-8 shrink-0 rounded-full object-cover ring-1 ring-zinc-200" />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-900 text-[12px] font-semibold text-white">{m.from[0]}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-zinc-900">{m.from}</div>
            <div className="truncate text-[11.5px] text-zinc-500">to {m.to}</div>
          </div>
          {m.tag ? (
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", m.tone === "bad" ? "bg-red-50 text-destructive" : "bg-accent text-brand-ink")}>{m.tag}</span>
          ) : null}
        </div>
        <div className={cn("mt-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-zinc-600", !scroll && "line-clamp-4")}>{m.body}</div>
      </div>
    </div>
  );
}

export function FrameView({
  spec,
  play,
  delay = 0,
  scroll,
  fit,
  open,
}: {
  spec: FrameSpec;
  play: boolean;
  delay?: number;
  scroll?: boolean;
  fit?: boolean;
  /** Opened in full: long text is not clamped. */
  open?: boolean;
}) {
  const tl = timeline(spec);
  const t = useElapsed(play, delay, tl.total);
  const done = t === Infinity;
  const queryText = spec.query ? typed(spec.query.text, t, tl.query) : "";
  const queryTyping = Boolean(spec.query && tl.query && !done && t < tl.query[0] + tl.query[1]);
  const bodyText = spec.draft ? typed(spec.draft.body, t, tl.draftBody) : "";
  const bodyTyping = Boolean(spec.draft && tl.draftBody && !done && t >= tl.draftBody[0] && t < tl.draftBody[0] + tl.draftBody[1]);

  return (
    <div
      style={fit ? { width: DW, minHeight: DH } : { width: DW, height: DH }}
      className={cn("flex flex-col bg-white p-6 text-zinc-800 [&>*]:shrink-0", fit ? "" : scroll ? "overflow-y-auto overscroll-contain" : "overflow-hidden")}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 truncate font-mono text-[12px] tracking-wider text-zinc-400 uppercase">{spec.eyebrow}</div>
        {spec.source ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-50 py-0.5 pr-2.5 pl-1 text-[12px] text-zinc-500 ring-1 ring-zinc-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spec.source.logo} alt="" className="size-[18px] rounded-full object-cover" />
            {spec.source.write ? "Writes to " : "From "}
            <span className="font-medium text-zinc-700">{spec.source.name}</span>
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[21px] leading-snug font-semibold tracking-tight">{spec.title}</div>
      {spec.status ? (
        <span className={cn("mt-2 inline-flex w-fit rounded-full px-2.5 py-0.5 text-[12px] font-medium first-letter:uppercase", TONE_PILL[spec.status.tone])}>{spec.status.label}</span>
      ) : null}


      {spec.timeline ? <TimelineView spec={spec.timeline} at={tl.lanes} t={t} /> : null}
      {spec.match ? <MatchView m={spec.match} at={tl.match} result={tl.result} t={t} /> : null}





      {spec.stack ? <StackView s={spec.stack} at={tl.stack} legend={tl.legend} t={t} /> : null}
      {spec.stockForecast ? <StockForecastView forecast={spec.stockForecast} span={tl.forecast} t={t} /> : null}

      {spec.thread ? <ThreadView th={spec.thread} steps={tl.steps} messages={tl.messages} t={t} scroll={scroll || open} /> : null}

      {spec.query ? (
        <pre className="mt-4 rounded-xl bg-zinc-950 p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-zinc-100">
          <Highlight text={queryText} lang={spec.query.lang} />
          <Caret on={queryTyping} />
        </pre>
      ) : null}

      {spec.table && (done || t >= (tl.rows[0] ?? 0)) ? (
        <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-zinc-200">
          <div className="flex gap-3 border-b bg-zinc-50 px-3 py-1.5 font-mono text-[11px] tracking-wider text-zinc-400 uppercase">
            {spec.table.cols.map((c, i) => (
              <span key={c} className={i === 0 ? "w-[34%] shrink-0" : "min-w-0 flex-1"}>
                {c}
              </span>
            ))}
          </div>
          {spec.table.rows.map((r, i) =>
            t >= tl.rows[i] ? (
              <div key={i} className="animate-enter flex gap-3 border-b px-3 py-1.5 text-[13px] last:border-b-0">
                {r.map((cell, j) => (
                  <span key={j} className={j === 0 ? "w-[34%] shrink-0 truncate text-zinc-500" : "min-w-0 flex-1 truncate text-zinc-800 tnum"}>
                    {cell}
                  </span>
                ))}
              </div>
            ) : null,
          )}
        </div>
      ) : null}

      {spec.bars?.length ? (
        <div className="mt-4 space-y-2.5">
          {spec.bars.map((b, i) => (
            <div key={i}>
              <div className="flex justify-between text-[13px]">
                <span className="text-zinc-600">{b.label}</span>
                <span className="text-zinc-800 tnum">{t >= tl.bars[i] ? b.display : ""}</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                  style={{ width: (t >= tl.bars[i] ? Math.min(1, Math.max(0.02, b.share)) * 100 : 0) + "%" }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}



      {spec.draft && t >= tl.draftHead ? (
        <div className="animate-enter mt-4 rounded-xl ring-1 ring-zinc-200">
          <div className="space-y-0.5 border-b px-4 py-2.5 text-[13px]">
            <div>
              <span className="text-zinc-400">To </span>
              {spec.draft.to}
            </div>
            <div>
              <span className="text-zinc-400">Subject </span>
              <span className="font-medium">{spec.draft.subject}</span>
            </div>
          </div>
          <div className="min-h-[96px] px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap text-zinc-700">
            {bodyText}
            <Caret on={bodyTyping} />
          </div>
        </div>
      ) : null}

      {spec.checks?.length ? <CheckList checks={spec.checks} at={tl.checks} t={t} /> : null}

      {spec.summary && t >= tl.summary ? (
        <p title={spec.summary} className={cn("animate-enter mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-zinc-600", !open && "[&_a]:pointer-events-none")}>
          <span>{spec.summary}</span>
        </p>
      ) : null}



      {spec.sources?.length && t >= tl.summary ? <div className="animate-enter mt-3 flex flex-wrap items-center gap-1.5"><span className="text-[11.5px] text-zinc-400">Read</span>{spec.sources.map(source=><span key={source} className="rounded-full bg-white px-2 py-0.5 text-[11.5px] text-zinc-600 ring-1 ring-zinc-200">{source}</span>)}</div> : null}
    </div>
  );
}
