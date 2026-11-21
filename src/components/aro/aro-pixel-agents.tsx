"use client";
import type { SpriteMood } from "../pixel-agent";

import React from "react";
import "./aro-pixel-agents.css";

/** Retro-corporate pixel-art character studies inspired by the user-provided Fallout
 * mascot categories. These are original miniature interpretations, NOT official
 * game assets. Use the original ARO crew for commercial branding. */
type Sprite = { label: string; promise: string; palette: Record<string,string>; rows: string[] };

export const ARO_SPRITES: Record<string, Sprite> = {
  "vault-boy": {
    "label": "Shelter Scout",
    "promise": "Safety",
    "palette": {
      "K": "#2B2826",
      "Y": "#F4C952",
      "H": "#F0B92E",
      "S": "#F5CBA7",
      "P": "#D99B80",
      "B": "#315C9C",
      "D": "#223F72",
      "W": "#FDF1CC",
      "T": "#72B6A4"
    },
    "rows": [
      ".....KKKKKK.....",
      "....KYYYYYYK....",
      "...KYYYYYYYYK...",
      "...KHHYYYYHHK...",
      "...KSSSSSSSSK...",
      "...KSKSSSSKSK...",
      "...KSSSSSSSSK...",
      "...KSSSPPSSSK...",
      "....KSSSSSSK....",
      "...KBBYYYYBBK...",
      "..KBBBBYYBBBK...",
      "..KBBBBYYBBBBK..",
      "..KBDDDDDDDDK...",
      "...KDDK..KDDK...",
      "...KKKK..KKKK...",
      "................"
    ]
  },
  "cappy": {
    "label": "Joy Cap",
    "promise": "Happiness",
    "palette": {
      "K": "#292E34",
      "R": "#C74F4C",
      "W": "#FEF3D4",
      "B": "#A9D3E4",
      "P": "#EFBAA1",
      "Y": "#F1D16D",
      "D": "#6B3444"
    },
    "rows": [
      "....KKKKKKKK....",
      "...KRRRRRRRRK...",
      "..KRRWRRWRRRRK..",
      "..KRWRRRRWRRRK..",
      "..KRRRRRRRRRRK..",
      "..KRRKRRRRKRRK..",
      "..KRRRRRRRRRRK..",
      "...KRRRWWRRRK...",
      "....KRRRRRRK....",
      "...KWWWWWWWWK...",
      "..KWWKWWWWKWWK..",
      "..KWWWWWWWWWWK..",
      "...KWWWWWWWWK...",
      "....KKK..KKK....",
      "....KKK..KKK....",
      "................"
    ]
  },
  "bottle": {
    "label": "Joy Bottle",
    "promise": "Happiness",
    "palette": {
      "K": "#292E34",
      "R": "#C74F4C",
      "W": "#FDF3D4",
      "B": "#A9D3E4",
      "Y": "#F1D16D",
      "D": "#7D3F42"
    },
    "rows": [
      "......KKKK......",
      "......KRRK......",
      "......KRRK......",
      ".....KRRRRK.....",
      ".....KRRRRK.....",
      "....KRRRRRRK....",
      "....KRRRRRRK....",
      "....KRWRRWRK....",
      "....KRRRRRRK....",
      "....KRKRRKRK....",
      "....KRRWWRRK....",
      "....KRRRRRRK....",
      "....KRRRRRRK....",
      "....KRRRRRRK....",
      ".....KKKKKK.....",
      "................"
    ]
  },
  "nuka-girl": {
    "label": "Rocket Courier",
    "promise": "Better future",
    "palette": {
      "K": "#2C2932",
      "S": "#F4C6A8",
      "P": "#DA947E",
      "R": "#C2474F",
      "W": "#F9F4DE",
      "G": "#A9D7DC",
      "Y": "#F5C75B",
      "D": "#684C63"
    },
    "rows": [
      ".....KKKKKK.....",
      "....KGGGGGGK....",
      "...KGSSSSSSGK...",
      "...KGSSSSSSGK...",
      "...KGSKSSKSGK...",
      "...KGSSPPSSGK...",
      "....KSSSSSSK....",
      "...KRRRWWRRRK...",
      "..KRRWRRWRRRK...",
      "..KRRRRRRRRRRK..",
      "..KWRRRRRRRRWK..",
      "...KRRRRRRRRK...",
      "....KWWKKWWK....",
      "....KRRKKRRK....",
      "....KKKKKKKK....",
      "................"
    ]
  },
  "petro-chico": {
    "label": "Power Keeper",
    "promise": "Dependable energy",
    "palette": {
      "K": "#29282A",
      "S": "#E9BA92",
      "P": "#C78966",
      "O": "#DF8C4A",
      "Y": "#E4C45A",
      "B": "#416A75",
      "D": "#34515B",
      "W": "#F8F0CD"
    },
    "rows": [
      ".....KKKKKK.....",
      "....KOOOOOOK....",
      "...KOOOYYOOOK...",
      "...KSSSSSSSSK...",
      "...KSKSSSSKSK...",
      "...KSSSSSSSSK...",
      "...KSSSPPSSSK...",
      "....KSSSSSSK....",
      "...KBBBBBBBBK...",
      "..KBBBWYBBBBK...",
      "..KBBBBBBBBBBK..",
      "..KBBBBDDBBBK...",
      "...KBBBDBBBK....",
      "....KDDKKDDK....",
      "....KKK..KKK....",
      "................"
    ]
  },
  "dough-boy": {
    "label": "Comfort Cook",
    "promise": "Comfort",
    "palette": {
      "K": "#4C352D",
      "D": "#D3A475",
      "W": "#F9ECD5",
      "P": "#E5B5A3",
      "R": "#D05A65",
      "B": "#7EBD9C",
      "Y": "#F4D69D"
    },
    "rows": [
      "......KKKK......",
      "....KKWWWWKK....",
      "...KWWWWWWWWK...",
      "...KWWKWWKWWK...",
      "...KWWWWWWWWK...",
      "....KWWRRWWK....",
      ".....KWWWWK.....",
      "....KKDDDDKK....",
      "...KDDDDDDDDK...",
      "..KDDKDDDDKDDK..",
      "..KDDDDDDDDDDK..",
      "...KDDDDDDDDK...",
      "....KDDKKDDK....",
      "....KDDKKDDK....",
      "....KKKKKKKK....",
      "................"
    ]
  },
  "pip-boy": {
    "label": "Signal Technician",
    "promise": "Convenience",
    "palette": {
      "K": "#30353B",
      "G": "#8CC18D",
      "D": "#467F75",
      "S": "#ECC3A2",
      "P": "#C88F72",
      "B": "#3C5D70",
      "W": "#E8F2D0",
      "Y": "#D6CF69"
    },
    "rows": [
      ".....KKKKKK.....",
      "....KGGGGGGK....",
      "...KGGGGGGGGK...",
      "...KSSSSSSSSK...",
      "...KSKSSSSKSK...",
      "...KSSSSSSSSK...",
      "....KSSPPSSK....",
      "....KSSSSSSK....",
      "...KBBBBBBBBK...",
      "..KBBBDBBBBGK...",
      "..KBBBBBBBBGGK..",
      "..KBBBBBBBBGGK..",
      "...KBBBDBBBGK...",
      "....KDDKKDDK....",
      "....KKK..KKK....",
      "................"
    ]
  }
};

function rectangles(sprite: Sprite) {
  const runs: Array<{ x:number; y:number; width:number; color:string }> = [];
  sprite.rows.forEach((row,y) => {
    let x=0;
    while(x<row.length){
      const c=row[x]; let width=1;
      while(x+width<row.length && row[x+width]===c) width++;
      if(c!=="." && sprite.palette[c]) runs.push({x,y,width,color:sprite.palette[c]});
      x+=width;
    }
  });
  return runs;
}

export type PixelMotion = "idle"|"working"|"running"|"happy"|"still";
export function AROPixelAgent({id,size=64,motion="idle",mood,className=""}:{id:string;size?:number;motion?:PixelMotion;mood?:SpriteMood;className?:string}){
  const sprite=ARO_SPRITES[id]; if(!sprite)return null;
  const motionClass = mood === "sleep" ? "" : {idle:"px-bob",working:"px-bob-fast",running:"aro-agent-running",happy:"px-mood-party",still:""}[motion];
  return <svg className={`aro-pixel-agent ${className}`} width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={sprite.label}>
    <g className={mood && mood !== "sleep" ? "px-mood-" + mood : undefined}>
    <g className={motionClass}>
      {rectangles(sprite).map((r,i)=><rect key={i} x={r.x} y={r.y} width={r.width} height={1} fill={r.color}/>)}
    </g>
    </g>
  </svg>;
}
