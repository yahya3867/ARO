import { AsyncLocalStorage } from "node:async_hooks";
import type { AppContext } from "../context";
import type { Orchestrator } from "../orchestrator";

export const cloudScope = new AsyncLocalStorage<{
  id: string;
  runtime: { ctx: AppContext; worker: Orchestrator };
}>();
export const cloudEnabled = () => Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
