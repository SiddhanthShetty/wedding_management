import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthenticationRequiredError, AuthorizationDeniedError } from "@/lib/auth/access";
import { InvitationRuleError } from "@/lib/data/invitations";
import { uploadInvitationMedia } from "@/lib/data/invitation-media";
import { MAX_MUSIC_BYTES } from "@/lib/invitations/media";
import { isSameOriginRequest } from "@/lib/http/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const reply = (status: number, body: { ok: boolean; message: string; id?: string }) => NextResponse.json(body, { status, headers });

/** Adds invitation music or a gallery photo. Same-origin only; type and size are checked on the server. */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return reply(403, { ok: false, message: "Uploads must come from this app." });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_MUSIC_BYTES + 64 * 1024) return reply(413, { ok: false, message: "Music files can be up to 1.5 MB." });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return reply(400, { ok: false, message: "Choose a file to upload." });
    const fields = z.object({ weddingId: z.uuid(), designId: z.uuid(), kind: z.enum(["music", "gallery", "artwork"]), caption: z.string().max(80) })
      .safeParse({ weddingId: form.get("weddingId"), designId: form.get("designId"), kind: form.get("kind"), caption: form.get("caption") ?? "" });
    if (!fields.success) return reply(400, { ok: false, message: "Save the design first, then add music or photos." });
    if (file.size > MAX_MUSIC_BYTES) return reply(413, { ok: false, message: "Music files can be up to 1.5 MB." });
    const id = await uploadInvitationMedia({ ...fields.data, bytes: new Uint8Array(await file.arrayBuffer()) });
    revalidatePath("/invitations");
    return reply(201, { ok: true, message: fields.data.kind === "music" ? "Music saved." : fields.data.kind === "artwork" ? "Artwork saved." : "Photo added.", id });
  } catch (error) {
    if (error instanceof InvitationRuleError) return reply(400, { ok: false, message: error.message });
    if (error instanceof AuthenticationRequiredError) return reply(401, { ok: false, message: "Sign in again to upload." });
    if (error instanceof AuthorizationDeniedError) return reply(403, { ok: false, message: "You can't change the invitation. Ask the couple if you need something changed." });
    return reply(500, { ok: false, message: "The upload failed. Nothing was saved." });
  }
}
