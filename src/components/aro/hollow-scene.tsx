"use client";

import "./hollow-scene.css";

const WIDTH = 320;
const HEIGHT = 180;

// Seeded texture keeps server and browser artwork identical.
function texture(count: number, seed: number, top: number, height: number) {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: Math.floor(random() * WIDTH),
    y: top + Math.floor(random() * height),
    wide: random() > .8 ? 2 : 1,
    light: random() > .5,
  }));
}
const CEILING = texture(180, 17, 0, 23);
const FLOOR = texture(330, 31, 130, 50);
const FAR_WALL = texture(65, 47, 90, 35);

function Shelter({ x, y, color, wide = 24 }: { x: number; y: number; color: string; wide?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="0" y="6" width={wide} height="13" fill="#252f2a" />
    <rect x="1" y="5" width={wide - 2} height="13" fill={color} />
    <rect x="4" y="2" width={wide - 8} height="3" fill={color} />
    <rect x="6" y="0" width={wide - 12} height="2" fill={color} />
    <rect x={wide / 2 - 3} y="9" width="6" height="9" fill="#29372f" />
    <rect x={wide / 2 - 2} y="10" width="4" height="8" fill="#e8bd61" />
    <rect x="4" y="8" width="3" height="3" fill="#e8bd61" />
    <rect x={wide - 7} y="8" width="3" height="3" fill="#e8bd61" />
    <rect x="1" y="17" width={wide - 2} height="2" fill="#514b3e" />
  </g>;
}

function Crates({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}>
    {[0, 7].map(offset => <g key={offset} transform={`translate(${offset} 0)`}>
      <rect width="6" height="6" fill="#51483e" />
      <rect x="1" y="1" width="4" height="4" fill="#c5a16a" />
      <path d="M1 1h1v1h1v2h1v1h1V4H4V2H3V1z" fill="#746044" />
    </g>)}
  </g>;
}

/** Full-height landing companion to the supplied 96 by 16 HollowStrip. */
export function HollowScene() {
  return <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMax slice"
    shapeRendering="crispEdges" className="absolute inset-0 size-full" aria-hidden="true" data-hollow-scene>
    {/* Quiet central cavern keeps the title readable. */}
    <rect width={WIDTH} height={HEIGHT} fill="#353733" />
    <rect y="77" width={WIDTH} height="51" fill="#3d4139" />
    <path d="M0 89h22v-7h18v9h23v-5h22v10h27v-5h23v8h31v-6h26v-6h22v7h25v-9h21v6h27v-5h33v42H0z" fill="#484c40" />
    {FAR_WALL.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.wide} height="1" fill={p.light ? "#515747" : "#41463c"} />)}
    {/* Ceiling and stepped rock formations frame the open middle. */}
    <rect width={WIDTH} height="9" fill="#57544c" />
    <path d="M0 9h32v5h-9v7H11v12H0z M35 9h27v5H53v9h-7v-7H35z M84 9h18v8h-6v7h-4v-9h-8z M123 9h16v5h-6v8h-4v-7h-6z M183 9h26v5h-8v11h-6v-8h-12z M238 9h26v6h-8v12h-6v-9h-12z M284 9h36v29h-8V26h-12v-9h-16z" fill="#57544c" />
    {CEILING.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.wide} height="1" fill={p.light ? "#686357" : "#484842"} />)}
    <path d="M0 20h5v28H3v19H0z M320 29h-5v17h-4v23h3v32h6z" fill="#57544c" />
    {/* Utility cables and warm lamps at the edges. */}
    <path d="M0 36h24v4h21v3h24v-1h13 M238 36h19v-3h23v-5h40" fill="none" stroke="#252c28" strokeWidth="1" />
    {[{ x: 30, y: 40 }, { x: 281, y: 28 }].map(lamp => <g key={lamp.x}>
      <rect x={lamp.x} y={lamp.y} width="1" height="7" fill="#252c28" />
      <rect x={lamp.x - 2} y={lamp.y + 7} width="5" height="2" fill="#978169" />
      <rect x={lamp.x - 1} y={lamp.y + 9} width="3" height="2" fill="#e8bd61" />
    </g>)}
    {/* Settlement rests at the back of the walkable floor. */}
    <rect y="126" width={WIDTH} height="54" fill="#70604e" />
    <rect y="126" width={WIDTH} height="2" fill="#8d7a60" />
    <rect y="128" width={WIDTH} height="4" fill="#78664f" />
    {FLOOR.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.wide} height="1" fill={p.light ? "#88735b" : "#665743"} />)}
    <Shelter x={10} y={108} color="#857b6b" wide={35} />
    <Shelter x={54} y={111} color="#6b735f" wide={24} />
    {/* Supply warehouse. */}
    <g>
      <rect x="86" y="108" width="32" height="18" fill="#9b7d55" />
      <rect x="89" y="105" width="26" height="3" fill="#bd9a63" />
      <rect x="88" y="109" width="28" height="2" fill="#b5905b" />
      <rect x="97" y="113" width="10" height="13" fill="#3a4135" />
      <rect x="98" y="114" width="8" height="12" fill="#d4ad5f" />
      <rect x="101" y="114" width="1" height="12" fill="#a2834e" />
      <Crates x={83} y={123} />
    </g>
    {/* Bunker and beacon mirror the strip's central shelter. */}
    <g>
      <rect x="141" y="103" width="38" height="23" fill="#949087" />
      <rect x="146" y="97" width="28" height="6" fill="#949087" />
      <rect x="151" y="94" width="18" height="3" fill="#949087" />
      <rect x="143" y="105" width="34" height="2" fill="#aaa394" />
      <rect x="154" y="111" width="12" height="15" fill="#273831" />
      <rect x="156" y="113" width="8" height="13" fill="#e8bd61" />
      <rect x="159" y="113" width="1" height="13" fill="#ad8d4f" />
      <rect x="145" y="111" width="5" height="5" fill="#c6c5a0" />
      <rect x="170" y="111" width="5" height="5" fill="#c6c5a0" />
      <rect x="184" y="118" width="2" height="8" fill="#273831" />
      <rect x="182" y="115" width="6" height="4" fill="#978169" />
      <rect x="183" y="116" width="4" height="2" fill="#f2cb6a" className="hollow-beacon" />
    </g>
    {/* Water processing tanks and pipe. */}
    <g>
      <rect x="198" y="111" width="37" height="15" fill="#777768" />
      <rect x="202" y="106" width="11" height="4" fill="#989887" />
      <rect x="220" y="106" width="11" height="4" fill="#989887" />
      <rect x="202" y="111" width="11" height="11" fill="#618b87" />
      <rect x="203" y="112" width="9" height="3" fill="#90bcb9" />
      <rect x="220" y="111" width="11" height="11" fill="#618b87" />
      <rect x="221" y="112" width="9" height="3" fill="#90bcb9" />
      <path d="M233 120h7v13h5" fill="none" stroke="#949087" strokeWidth="2" />
    </g>
    {/* Clinic window and a neighboring shelter. */}
    <Shelter x={253} y={106} color="#857b6b" wide={30} />
    <rect x="265" y="109" width="5" height="2" fill="#e4ddbc" />
    <rect x="266" y="108" width="2" height="5" fill="#e4ddbc" />
    <Shelter x={293} y={111} color="#686f5d" wide={24} />
    {/* Shared growing beds, a cistern and bioluminescent cave plants. */}
    <g>
      <rect x="5" y="151" width="33" height="12" fill="#51483e" />
      <rect x="7" y="152" width="29" height="9" fill="#3d4635" />
      {[10, 16, 22, 28, 34].map(x => <g key={x}>
        <rect x={x} y="151" width="1" height="8" fill="#7d9567" />
        <rect x={x - 2} y="153" width="2" height="2" fill="#a9b887" />
        <rect x={x + 1} y="155" width="2" height="2" fill="#a9b887" />
      </g>)}
      <rect x="268" y="148" width="40" height="15" fill="#51483e" />
      <rect x="270" y="150" width="36" height="11" fill="#537b77" />
      <path d="M274 153h8 M291 157h9 M280 159h5" stroke="#90bcb9" strokeWidth="1" className="hollow-water" />
      {[{x:3,y:125},{x:126,y:126},{x:189,y:127},{x:312,y:141},{x:48,y:168}].map(p => <g key={p.x}>
        <rect x={p.x} y={p.y} width="1" height="4" fill="#758363" />
        <rect x={p.x - 1} y={p.y} width="3" height="2" fill="#a9b887" />
      </g>)}
    </g>
    <Crates x={71} y={147} />
    <Crates x={222} y={164} />
    {/* Foreground rock edges add depth without covering the walkers. */}
    <path d="M0 174h18v3h24v3H0z M268 180v-3h22v-3h30v6z" fill="#575044" />
  </svg>;
}
