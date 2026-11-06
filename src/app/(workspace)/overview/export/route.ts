import { NextResponse } from "next/server";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { dashboardRows, getDashboard } from "@/lib/data/dashboard";
import { createCsv } from "@/lib/planning/guest-csv";

export const dynamic = "force-dynamic";

/** CSV of dashboard metrics the signed-in member is allowed to see. Includes the generation time. */
export async function GET() {
  const workspace = await requireCurrentWorkspace();
  const dashboard = await getDashboard(workspace.wedding.id);
  const rows = [{ section: "Export", metric: "Generated at (UTC)", value: dashboard.generatedAt, link: "" }, ...dashboardRows(dashboard)];
  const csv = createCsv(["section", "metric", "value", "link"], rows);
  return new NextResponse(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="wedding-summary-${dashboard.today}.csv"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
