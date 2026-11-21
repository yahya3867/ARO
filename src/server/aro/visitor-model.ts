import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AppContext } from "../context";

export type VisitorModelCredential = {apiKey:string;model:string;expiresAt:number};
export const VISITOR_MODEL_TTL_MS=60*60*1000;
export const VISITOR_MODEL="openai/gpt-5.6-luna";
function encryptionKey() {
  const value=process.env.ARO_KEY_ENCRYPTION_SECRET;
  if(!value) throw Error("Visitor AI connections are not configured.");
  const key=Buffer.from(value,"base64");
  if(key.length!==32) throw Error("Visitor AI connections are not configured.");
  return key;
}
export function visitorModelConfigured() {try {encryptionKey();return true;} catch {return false;}}
export function sealVisitorKey(credential:VisitorModelCredential,workspace:string,generation:string) {
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  cipher.setAAD(Buffer.from(workspace+":"+generation));
  const data=Buffer.concat([cipher.update(JSON.stringify(credential),"utf8"),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString("base64");
}
export function openVisitorKey(sealed:string,workspace:string,generation:string):VisitorModelCredential|null {
  try {
    const raw=Buffer.from(sealed,"base64"),decipher=createDecipheriv("aes-256-gcm",encryptionKey(),raw.subarray(0,12));
    decipher.setAAD(Buffer.from(workspace+":"+generation));decipher.setAuthTag(raw.subarray(12,28));
    const value=JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString("utf8")) as VisitorModelCredential;
    return value.expiresAt>Date.now() && typeof value.apiKey==="string" && value.model===VISITOR_MODEL ? value:null;
  } catch {return null;}
}
export function setVisitorModelEnabled(ctx:AppContext,enabled:boolean) {
  ctx.sqlite.prepare("INSERT INTO settings(key,value) VALUES ('aro:visitor-ai',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(enabled));
  ctx.config.defaultMode=enabled && ctx.modelCredential?"llm":"deterministic";
}
export function visitorModelEnabled(ctx:AppContext) {
  return (ctx.sqlite.prepare("SELECT value FROM settings WHERE key='aro:visitor-ai'").get() as {value:string}|undefined)?.value==="true";
}
