"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function DoneMark({ burst = false, size = 36 }: { burst?: boolean; size?: number }) {
  const sparks = burst ? Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2) : [];
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {burst ? <span className="done-ring absolute inset-0 rounded-full bg-primary/50" /> : null}
      {sparks.map((a, i) => (
        <span
          key={i}
          className={cn("done-spark absolute size-1.5 rounded-full", i % 2 ? "bg-primary" : "bg-brand-ink")}
          style={{ ["--dx" as string]: Math.cos(a) * size * 1.1 + "px", ["--dy" as string]: Math.sin(a) * size * 1.1 + "px", animationDelay: "120ms" }}
        />
      ))}
      <span className={cn("grid size-full place-items-center rounded-full bg-primary text-primary-foreground shadow-sm", burst && "done-pop")}>
        <Check style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={3} />
      </span>
    </span>
  );
}
