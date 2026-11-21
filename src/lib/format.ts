const tf = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function clockTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return tf.format(new Date(iso));
}

export function relativeTime(iso: string | null | undefined, now: number) {
  if (!iso) return "—";
  if (!now) return clockTime(iso);
  const diff = Math.max(0, now - Date.parse(iso));
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
