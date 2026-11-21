import { AroAvatar } from "./aro/aro-avatar";
export type SpriteMood = "hop" | "party" | "nod" | "shake" | "tilt" | "slump" | "sleep";
const TINT:Record<string,string>={compute:"#f3eadb",finance:"#e4f2e6",vendor:"#e3e7f4",budget:"#fbe6ec",policy:"#ece6f6",capacity:"#fdf0dc",operator:"#eef3c8",director:"#eef3c8"};
const seat=(id:string)=>id==="you"?"operator":id.replace(/^(aro|agent)\./,"");
export const spriteTint=(id:string)=>TINT[seat(id)];
export const hasSprite=(id:string)=>Boolean(spriteTint(id));
export function PixelAgent({actorId,size=48,working=false,still=false,mood,className}:{actorId:string;size?:number;working?:boolean;still?:boolean;mood?:SpriteMood;className?:string}) {
 return <AroAvatar actorId={seat(actorId)} size={size} working={working} still={still} mood={mood} className={className}/>;
}
