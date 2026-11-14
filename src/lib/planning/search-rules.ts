/**
 * Rules for the search box. The search term is cleaned to letters, numbers, spaces and a few
 * name characters, so it can be used safely in database filters.
 */

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 60;

/** The cleaned term, or null when there's nothing worth searching for. */
export function cleanSearchTerm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFC").replace(/[^\p{L}\p{M}\p{N} '&.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
  return cleaned.length >= SEARCH_MIN ? cleaned : null;
}

export type SearchKind = "guest" | "household" | "vendor" | "task" | "decision" | "function" | "file";
export type SearchHit = { kind: SearchKind; id: string; title: string; detail: string; href: string };

export const KIND_LABELS: Record<SearchKind, string> = {
  household: "Families", guest: "Guests", vendor: "Venues & vendors", task: "Tasks", decision: "To decide", function: "Functions", file: "Files",
};

/** Where each result opens. Lists that can filter by name get the term; others jump to the record. */
export function hitHref(kind: SearchKind, id: string, term: string): string {
  const q = encodeURIComponent(term);
  switch (kind) {
    case "guest": return `/guests?view=people&q=${q}`;
    case "household": return "/guests/simple";
    case "vendor": return `/venues-vendors?q=${q}`;
    case "task": return `/tasks?view=all#task-${id}`;
    case "decision": return `/decisions#decision-${id}`;
    case "function": return `/functions#function-${id}`;
    case "file": return `/documents?q=${q}`;
  }
}
