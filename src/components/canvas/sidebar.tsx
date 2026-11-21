"use client";

import { useEffect, useRef, useState } from "react";

import { ArrowLeft, ArrowUp, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { AgentAvatar } from "../status";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function useStickToBottom(ref: React.RefObject<HTMLElement | null>, key: string | null) {
  useEffect(() => {
    const el = ref.current;
    if (!el || key === null) return;
    let pinned = true;
    const follow = () => {
      if (pinned) el.scrollTop = el.scrollHeight;
    };
    const onScroll = () => {
      pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    follow();
    const resize = new ResizeObserver(follow);
    const watch = () => {
      resize.disconnect();
      for (const c of Array.from(el.children)) resize.observe(c);
    };
    watch();
    const mutate = new MutationObserver(() => {
      watch();
      follow();
    });
    mutate.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      resize.disconnect();
      mutate.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [ref, key]);
}

function Linked({ text, onTask }: { text: string; onTask: (id: string) => void }) {
  const parts = text.split(/(INC-\d{4})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^INC-\d{4}$/.test(p) ? (
          <button key={i} type="button" onClick={() => onTask(p)} className="rounded bg-zinc-100 px-1 font-mono text-[12px] text-zinc-700 hover:bg-accent hover:text-brand-ink">
            {p}
          </button>
        ) : (
          <span key={i}>
            <span>{p}</span>
          </span>
        ),
      )}
    </>
  );
}

function Thread({
  messages,
  pending,
  onTask,
  speaker,
  inset,
}: {
  messages: ChatMessage[];
  pending: boolean;
  onTask: (id: string) => void;
  /** Who answers, when it is one employee rather than the assistant. */
  speaker?: { actorId: string; name: string };
  /** Inside a padded view: no padding of its own. */
  inset?: boolean;

}) {
  return (
    <div className={cn("space-y-4", inset ? "border-t border-zinc-100 pt-5" : "px-5 pt-5 pb-4")}>
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="animate-enter flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-3.5 py-2 text-[13.5px] leading-snug whitespace-pre-wrap text-zinc-900">{m.content}</div>
          </div>
        ) : (
          <div key={i} className="animate-enter text-[13.5px] leading-relaxed whitespace-pre-wrap text-zinc-800">
            {speaker ? (
              <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
                <AgentAvatar actorId={speaker.actorId} size="sm" />
                {speaker.name}
              </div>
            ) : null}
            <Linked text={m.content} onTask={onTask} />
          </div>
        ),
      )}
      {pending ? (
        <div className="flex gap-1 py-1">
          {[0, 150, 300].map((d) => (
            <span key={d} className="size-1.5 animate-pulse rounded-full bg-zinc-300" style={{ animationDelay: d + "ms" }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Composer({ placeholder, onSend, disabled, focusKey = 0 }: { placeholder: string; onSend: (text: string) => void; disabled: boolean; focusKey?: number }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusKey) ref.current?.focus();
  }, [focusKey]);
  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [text]);
  return (
    <div className="flex items-end gap-2 rounded-2xl bg-white p-1.5 pl-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-zinc-200 transition-shadow focus-within:ring-zinc-400">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-snug outline-none placeholder:text-zinc-400"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!text.trim() || disabled}
        aria-label="Send"
        className="grid size-8 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400"
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  );
}

function Suggestions({ items, onPick }: { items: string[]; onPick: (s: string) => void }) {
  return (
    <div className="mb-2 px-0.5">
      {items.map((s) => (
        <button key={s} type="button" onClick={() => onPick(s)} className="group flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-950">
          <span className="min-w-0 flex-1 truncate">{s}</span>
          <ArrowUpRight className="size-3.5 text-zinc-300 group-hover:text-zinc-600" />
        </button>
      ))}
    </div>
  );
}

export type FrameChatTarget = {
  /** Tagged frame id, unique across tasks; chats are kept per frame. */
  key: string;
  taskId: string;
  /** Untagged frame id as the server builds it. */
  frameId: string;
  actorId: string;
  agentName: string;
  job: string;
  label: string;
  title: string;
  tone: "ok" | "warn" | "denied" | "live";
};

const FRAME_TONE_DOT: Record<FrameChatTarget["tone"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-400",
  denied: "bg-red-500",
  live: "bg-primary animate-pulse",
};

function frameSuggestions(f: FrameChatTarget) {
  if (f.tone === "denied") return ["Why was this blocked?", "What happens next?"];
  if (f.tone === "live") return ["What are you doing right now?", "What have you found so far?"];
  return ["Walk me through this", "Where do these numbers come from?", "What would change your call?"];
}

export function FrameChat({
  f,
  messages,
  pending,
  onAsk,
  onClose,
  onTask,
}: {
  f: FrameChatTarget;
  messages: ChatMessage[];
  pending: boolean;
  onAsk: (text: string) => void;
  onClose: () => void;
  onTask: (id: string) => void;

}) {
  const scroller = useRef<HTMLDivElement>(null);
  useStickToBottom(scroller, f.key);
  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-100 px-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <ArrowLeft className="size-3.5" />
          Back to task
        </button>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-5">
          <div className="flex items-center gap-3">
            <AgentAvatar actorId={f.actorId} size="lg" />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-zinc-900">{f.agentName}</div>
              <div className="text-[12.5px] text-zinc-500">{f.job}</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-zinc-50 px-3.5 py-3 ring-1 ring-zinc-100">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-500">
              <span className={cn("size-1.5 rounded-full", FRAME_TONE_DOT[f.tone])} />
              {f.label}
            </div>
            <div className="mt-1 text-[13.5px] leading-snug font-medium text-zinc-800">{f.title}</div>
          </div>
        </div>
        {messages.length ? (
          <Thread messages={messages} pending={pending} onTask={onTask} speaker={{ actorId: f.actorId, name: f.agentName }} />
        ) : (
          <p className="px-5 pt-5 text-[13px] leading-relaxed text-zinc-500">Ask about this frame. {f.agentName.split(" ")[0]} answers from the records behind it.</p>
        )}
      </div>
      <div className="shrink-0 px-3 pt-2 pb-3">
        {!messages.length ? (
          <Suggestions items={frameSuggestions(f)} onPick={onAsk} />
        ) : null}
        <Composer placeholder={"Ask " + f.agentName + " about this"} onSend={onAsk} disabled={pending} />
      </div>
    </>
  );
}
