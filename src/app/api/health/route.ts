import { resourceRuntime } from "@/server/aro/runtime";
import { cloudEnabled } from "@/server/aro/cloud-scope";
import { cloudStore } from "@/server/aro/cloud-store";
export const dynamic = "force-dynamic";
export async function GET() {
  if (cloudEnabled()) await cloudStore().load("health-check");
  else resourceRuntime().ctx.sqlite.prepare("SELECT 1").get();
  return Response.json({ service: "ARO", status: "ready" });
}
