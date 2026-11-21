"use client";

import { useEffect, useRef, useState } from "react";



export function Typed({ text, onDone }: { text: string; onDone?: () => void }) {
  const [shown, setShown] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const next = Math.min(text.length, Math.floor(((now - start) / 1000) * 110));
      setShown(next);
      if (next < text.length) raf = requestAnimationFrame(tick);
      else done.current?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  // Links appear once the line has finished typing.
  return shown >= text.length ? <>{text}</> : <>{text.slice(0, shown)}</>;
}
