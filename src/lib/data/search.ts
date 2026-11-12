import "server-only";

import { authorizeWeddingOperation, type WeddingModule } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hitHref, type SearchHit, type SearchKind } from "@/lib/planning/search-rules";

const LIMIT = 8;

/**
 * Searches the areas this member can read, by name or title. `term` must already be cleaned
 * with cleanSearchTerm. Row-level security still applies to every query.
 */
export async function searchWedding(weddingId: string, term: string): Promise<{ hits: SearchHit[]; failed: boolean }> {
  const context = await authorizeWeddingOperation(weddingId);
  const owner = context.membership.role === "owner" || context.membership.role === "co_owner";
  const can = (module: WeddingModule) => owner || Boolean(context.moduleAccess[module]);
  const supabase = await createSupabaseServerClient();
  const like = `%${term}%`;
  type Row = Record<string, unknown>;
  const jobs: Array<{ kind: SearchKind; run: PromiseLike<{ data: Row[] | null; error: unknown }>; title: (row: Row) => string; detail: (row: Row) => string }> = [];
  if (can("guests")) {
    jobs.push({ kind: "household", run: supabase.from("guest_households").select("id,name,contact_name").eq("wedding_id", weddingId).ilike("name", like).order("name").limit(LIMIT), title: (row) => String(row.name), detail: (row) => row.contact_name ? `Contact: ${row.contact_name}` : "Family" });
    jobs.push({ kind: "guest", run: supabase.from("guests").select("id,full_name").eq("wedding_id", weddingId).ilike("full_name", like).order("full_name").limit(LIMIT), title: (row) => String(row.full_name), detail: () => "Guest" });
  }
  if (can("suppliers_finance")) {
    jobs.push({ kind: "vendor", run: supabase.from("suppliers").select("id,name,category").eq("wedding_id", weddingId).or(`name.ilike."${like}",category.ilike."${like}"`).order("name").limit(LIMIT), title: (row) => String(row.name), detail: (row) => String(row.category ?? "") });
  }
  if (can("planning")) {
    jobs.push({ kind: "task", run: supabase.from("tasks").select("id,title,due_date").eq("wedding_id", weddingId).ilike("title", like).order("due_date", { ascending: true, nullsFirst: false }).limit(LIMIT), title: (row) => String(row.title), detail: (row) => row.due_date ? `Due ${row.due_date}` : "Task" });
    jobs.push({ kind: "decision", run: supabase.from("decisions").select("id,question,status").eq("wedding_id", weddingId).ilike("question", like).limit(LIMIT), title: (row) => String(row.question), detail: (row) => row.status === "decided" ? "Decided" : "Still to decide" });
    jobs.push({ kind: "function", run: supabase.from("functions").select("id,name,function_date,venue_name").eq("wedding_id", weddingId).is("archived_at", null).or(`name.ilike."${like}",venue_name.ilike."${like}"`).limit(LIMIT), title: (row) => String(row.name), detail: (row) => [row.function_date, row.venue_name].filter(Boolean).join(" · ") || "Function" });
  }
  // Files: row-level security only returns documents for areas this member can read.
  jobs.push({ kind: "file", run: supabase.from("documents").select("id,title,category").eq("wedding_id", weddingId).eq("status", "active").ilike("title", like).limit(LIMIT), title: (row) => String(row.title), detail: (row) => String(row.category || "File") });

  const results = await Promise.all(jobs.map((job) => Promise.resolve(job.run).then((result) => ({ job, result })).catch(() => ({ job, result: { data: null, error: true } }))));
  let failed = false;
  const hits: SearchHit[] = [];
  for (const { job, result } of results) {
    if (result.error) { failed = true; continue; }
    for (const row of result.data ?? []) hits.push({ kind: job.kind, id: String(row.id), title: job.title(row), detail: job.detail(row), href: hitHref(job.kind, String(row.id), term) });
  }
  return { hits, failed };
}
