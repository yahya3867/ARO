import { requestRuntime } from "@/server/aro/runtime";
import { discuss, discussionInput } from "@/server/aro/discussion";
import { resourceHttp } from "@/server/aro/cloud-http";
export function POST(req: Request) { return resourceHttp(req, answer); }
async function answer(req: Request) {
  const origin=req.headers.get("origin");
  if(origin && origin!==new URL(req.url).protocol+"//"+req.headers.get("host") && origin!==process.env.ARO_PUBLIC_ORIGIN) return Response.json({error:"Cross-origin discussion denied"},{status:403});
  const input = discussionInput.safeParse(await req.json().catch(() => null));
  if (!input.success)
    return Response.json({ error: "Invalid question" }, { status: 400 });
  try {
    return Response.json(await discuss(requestRuntime(req).ctx, input.data));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not answer" },
      { status: 409 },
    );
  }
}
