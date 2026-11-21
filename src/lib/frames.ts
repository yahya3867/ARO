



export type OrbitNodeId = "compute" | "finance" | "vendor" | "budget" | "policy" | "capacity";

export type Check = { label: string; detail?: string; ok?: boolean };

export type Tone = "base" | "ok" | "warn" | "bad" | "muted";

export type TimelineSpec = {
  ticks: { at: number; label: string }[];
  lanes: { key: string; label: string; value: string; tone: Tone; spans: { from: number; to: number; tone?: Tone }[] }[];
  marks: { at: number; label: string; tone: Tone }[];
};

export type MatchSpec = {
  head: { label: string; detail: string; value: string };
  rows: { label: string; detail?: string; value: string; delta?: string; tone: Tone }[];
  result: { label: string; value: string; tone: Tone };
};

export type StackSpec = { total: string; parts: { label: string; share: number; display: string; tone?: Tone }[] };

export type ThreadSpec = {
  steps: { label: string; state: "done" | "now" | "todo"; tone?: Tone }[];
  messages: {
    from: string;
    to: string;
    subject?: string;
    body: string;
    tone?: Tone;
    /** Sender's logo; otherwise an initial. */
    logo?: string;
    /** When it was sent, already formatted. */
    at?: string;
    /** A short outcome tag on a reply, e.g. "Delivered". */
    tag?: string;
  }[];
};

export type FrameSpec = {
  eyebrow: string;
  title: string;
  /** The system of record this frame read from or wrote to. */
  source?: { id: string; name: string; logo: string; write?: boolean };
  status?: { label: string; tone: Tone };
  timeline?: TimelineSpec;
  match?: MatchSpec;
  stack?: StackSpec;
  stockForecast?: { name: string; stock: number; daily: number; minimum: number; hours: number; unit: string };
  thread?: ThreadSpec;
  query?: { lang: "sql" | "json" | "call"; text: string };
  table?: { cols: string[]; rows: string[][] };
  bars?: { label: string; share: number; display: string }[];
  checks?: Check[];
  draft?: { to: string; subject: string; body: string };
  summary?: string;
  evidence?: string[];
  /** Records the employee read on the way to this frame. */
  sources?: string[];
};

export type Frame = {
  tool?: string;
  id: string;
  node: OrbitNodeId;
  label: string;
  createdAt: string;
  tone: "ok" | "warn" | "denied" | "live";
  spec: FrameSpec;
  /** Other activity ids folded into this frame (reads, follow-up calls). */
  members?: string[];
};
