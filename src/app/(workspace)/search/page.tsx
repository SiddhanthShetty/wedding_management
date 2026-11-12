import Link from "next/link";
import { Search } from "lucide-react";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { searchWedding } from "@/lib/data/search";
import { cleanSearchTerm, KIND_LABELS, SEARCH_MIN, type SearchKind } from "@/lib/planning/search-rules";

const ORDER: SearchKind[] = ["household", "guest", "vendor", "task", "decision", "function", "file"];

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const workspace = await requireCurrentWorkspace();
  const raw = typeof params.q === "string" ? params.q : "";
  const term = cleanSearchTerm(raw);
  const result = term ? await searchWedding(workspace.wedding.id, term) : null;
  return <>
    <PageHeading eyebrow="Search" title={term ? `Results for “${term}”` : "Search"} description="Guests, families, vendors, tasks, functions and files, by name." />
    <form action="/search" className="search-page-form card" role="search">
      <label className="sr-only" htmlFor="search-page-q">Search</label>
      <input id="search-page-q" className="field-control" type="search" name="q" defaultValue={raw} placeholder="Type a name, e.g. Shetty or caterer" maxLength={60} autoFocus={!term} />
      <button type="submit" className="button button-primary"><Search size={15} aria-hidden="true" /> Search</button>
    </form>
    {!term && raw.trim() && <p className="field-help">Type at least {SEARCH_MIN} letters.</p>}
    {result && <div className="section-stack">
      {result.failed && <p className="auth-alert" role="alert">Some areas couldn&apos;t be searched, so results may be missing. Try again.</p>}
      {!result.hits.length && <Card title="Nothing found"><EmptyState title={`Nothing matches “${term}”`} description="Try part of a name, or check the spelling. Search looks at names and titles only." /></Card>}
      {ORDER.map((kind) => { const rows = result.hits.filter((hit) => hit.kind === kind); return rows.length ? <Card key={kind} title={KIND_LABELS[kind]} subtitle={rows.length >= 8 ? "Showing the first 8" : undefined}>
        <ul className="dash-list">{rows.map((hit) => <li key={`${hit.kind}-${hit.id}`}><Link href={hit.href}><span className="row-title">{hit.title}</span><span className="row-meta">{hit.detail}</span></Link></li>)}</ul>
      </Card> : null; })}
    </div>}
  </>;
}
