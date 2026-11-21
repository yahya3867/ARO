import Link from "next/link";
import { Network, ShieldCheck, SquareKanban } from "lucide-react";
import { cn } from "@/lib/utils";
const TABS = [
  { key: "canvas", href: "/canvas", label: "Canvas", icon: Network },
  { key: "board", href: "/board", label: "Board", icon: SquareKanban },
  { key: "audit", href: "/audit", label: "Audit trail", icon: ShieldCheck },
] as const;

export function WorkspaceHeader({
  active,
  logo,
  children,
  offline = false,
}: {
  active: string;
  logo: React.ReactNode;
  children: React.ReactNode;
  offline?: boolean;
}) {
  const Navigation = offline ? "a" : Link;
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200/80 bg-white px-4">
      <Navigation
        href="/"
        className="flex items-center gap-1.5 pr-1 text-[17px] font-semibold tracking-[-0.03em] text-zinc-950"
      >
        {logo}
      </Navigation>
      <nav className="flex gap-0.5">
        {TABS.map((t) => (
          <Navigation
            key={t.key}
            href={t.href}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
              active === t.key
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </Navigation>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-4">{children}</div>
    </header>
  );
}
