"use client";

import type { SVGProps } from "react";

const W = 96;
const H = 16;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type HollowStripProps = {
  seed?: number;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "children">;

export function HollowStrip({ seed = 3, className, ...props }: HollowStripProps) {
  const random = rng(seed);
  const rocks = Array.from({ length: 60 }, () => ({
    x: Math.floor(random() * W),
    y: Math.floor(random() * 5),
    color: random() > 0.5 ? "#777166" : "#484842",
  }));
  const debris = Array.from({ length: 35 }, () => ({
    x: Math.floor(random() * W),
    y: 13 + Math.floor(random() * 3),
    color: random() > 0.5 ? "#978169" : "#51483E",
  }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges" className={className} aria-hidden="true" {...props}>
      {/* Cave background and rocky ceiling */}
      <rect width={W} height={H} fill="#353733" />
      <rect x={0} y={0} width={W} height={3} fill="#57544C" />
      <rect x={4} y={3} width={10} height={2} fill="#57544C" />
      <rect x={21} y={3} width={15} height={1} fill="#57544C" />
      <rect x={45} y={3} width={8} height={3} fill="#57544C" />
      <rect x={69} y={3} width={14} height={2} fill="#57544C" />
      {rocks.map((rock, i) => <rect key={`rock-${i}`} x={rock.x} y={rock.y} width={1} height={1} fill={rock.color} />)}
      {/* Ground */}
      <rect x={0} y={13} width={W} height={3} fill="#70604E" />
      {debris.map((rock, i) => <rect key={`debris-${i}`} x={rock.x} y={rock.y} width={1} height={1} fill={rock.color} />)}
      {/* Left shelter */}
      <g>
        <rect x={5} y={10} width={17} height={3} fill="#857B6B" />
        <rect x={8} y={8} width={11} height={2} fill="#857B6B" />
        <rect x={11} y={10} width={5} height={3} fill="#26332F" />
        <rect x={12} y={11} width={3} height={2} fill="#E8BD61" />
      </g>
      {/* Supply warehouse */}
      <g>
        <rect x={27} y={10} width={10} height={3} fill="#9B7D55" />
        <rect x={28} y={9} width={8} height={1} fill="#BD9A63" />
        <rect x={30} y={11} width={2} height={2} fill="#EAC77A" />
        <rect x={34} y={11} width={2} height={2} fill="#DDB45F" />
      </g>
      {/* Central underground bunker and signal beacon */}
      <g>
        <rect x={44} y={9} width={12} height={4} fill="#949087" />
        <rect x={46} y={7} width={8} height={2} fill="#949087" />
        <rect x={48} y={10} width={4} height={3} fill="#273831" />
        <rect x={49} y={11} width={2} height={2} fill="#F2CB6A" />
        <rect x={49} y={5} width={2} height={2} fill="#F2CB6A" />
        <rect x={50} y={3} width={1} height={1} fill="#F2CB6A" />
      </g>
      {/* Water processing station */}
      <g>
        <rect x={62} y={9} width={13} height={4} fill="#777768" />
        <rect x={64} y={10} width={3} height={2} fill="#90BCB9" />
        <rect x={70} y={10} width={3} height={2} fill="#90BCB9" />
      </g>
      {/* Right shelter */}
      <g>
        <rect x={81} y={10} width={12} height={3} fill="#686F5D" />
        <rect x={83} y={8} width={8} height={2} fill="#686F5D" />
        <rect x={85} y={10} width={4} height={3} fill="#D4AD5F" />
      </g>
      {/* Bioluminescent cave plants */}
      <g>
        <rect x={2} y={11} width={2} height={2} fill="#A9B887" />
        <rect x={40} y={12} width={2} height={1} fill="#A9B887" />
        <rect x={78} y={12} width={2} height={1} fill="#A9B887" />
      </g>
    </svg>
  );
}
