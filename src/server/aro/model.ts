import OpenAI from "openai";
import { OpenAIChatCompletionsModel, Runner } from "@openai/agents";
import type { AppContext } from "../context";
import { VISITOR_MODEL } from "./visitor-model";

export const routerModel = () => process.env.OPENROUTER_MODEL || "openai/gpt-5.6-luna";

export async function verifyVisitorKey(key:string) {
  if(!/^sk-or-v1-[A-Za-z0-9_-]{16,200}$/.test(key)) throw Error("Enter a valid OpenRouter API key.");
  let response:Response;
  try {response=await fetch("https://openrouter.ai/api/v1/key",{headers:{Authorization:"Bearer "+key},cache:"no-store",signal:AbortSignal.timeout(5000)});}
  catch {throw Error("OpenRouter could not verify the key. Please try again.");}
  if(!response.ok) throw Error(response.status===401||response.status===403?"OpenRouter rejected this key.":"OpenRouter key verification is unavailable.");
  const {data}=await response.json();
  if(!data || data.disabled===true || (typeof data.limit_remaining==="number" && data.limit_remaining<=0)) throw Error("This OpenRouter key has no remaining credit or is disabled.");
}

export async function configuredModel(ctx?:AppContext) {
  if(ctx?.modelCredential && ctx.modelCredential.expiresAt>Date.now()) return new OpenAIChatCompletionsModel(new OpenAI({apiKey:ctx.modelCredential.apiKey,baseURL:"https://openrouter.ai/api/v1",maxRetries:0,timeout:15000}),VISITOR_MODEL);
  // Public workspaces must never fall through to the owner's environment key.
  if(ctx?.config.publicDemo || process.env.VERCEL) throw Error("Visitor API key required or expired");
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return process.env.OPENAI_MODEL || undefined;
  // The provider enforces this limit across simultaneous calls and process restarts.
  const response = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: "Bearer " + key },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error("OpenRouter key verification unavailable");
  const { data } = await response.json();
  if (typeof data?.limit !== "number" || data.limit > 5 || data.limit_reset != null ||
      typeof data.limit_remaining !== "number" || data.limit_remaining <= 0)
    throw Error("OpenRouter requires a non-renewing key limit of $5 or less with credit remaining");
  return new OpenAIChatCompletionsModel(new OpenAI({
    apiKey: key, baseURL: "https://openrouter.ai/api/v1", maxRetries: 0, timeout: 15000,
  }), routerModel());
}

export const resourceRunner = new Runner({ tracingDisabled: true });
