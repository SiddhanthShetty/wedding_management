import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError, requireCurrentWorkspace } from "@/lib/auth/access";
import { signedDocumentUrl } from "@/lib/data/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

/**
 * Redirects to a 60-second signed URL on the private storage origin after authorization.
 * Only PDFs and raster images may open inline; every other type is forced to download.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const id = z.uuid().safeParse(versionId);
  const mode = request.nextUrl.searchParams.get("mode") === "view" ? "view" : "download";
  if (!id.success) return new NextResponse("Not found", { status: 404, headers });
  try {
    const workspace = await requireCurrentWorkspace();
    const url = await signedDocumentUrl(workspace.wedding.id, id.data, mode);
    return NextResponse.redirect(url, { status: 303, headers });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return new NextResponse("Sign in required", { status: 401, headers });
    // Same response for missing and forbidden documents so IDs from other weddings reveal nothing.
    if (error && typeof error === "object" && "digest" in error) throw error; // let Next.js redirects through
    return new NextResponse("Document not available", { status: 404, headers });
  }
}
