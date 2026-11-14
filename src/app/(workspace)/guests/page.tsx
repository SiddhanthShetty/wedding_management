import { GuestManager } from "@/components/guest-manager";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getGuestWorkspace } from "@/lib/data/guests";

const views = ["households", "people", "imports"] as const;

/** People: who is in each family. Invitations and replies are on the Guest desk. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace("guests");
  const params = await searchParams;
  const data = await getGuestWorkspace(workspace.wedding.id);
  const view = views.find((value) => value === params.view) ?? "households";
  return <GuestManager data={data} initialView={view} initialQuery={typeof params.q === "string" ? params.q.slice(0, 100) : ""} initialAdd={params.add === "guest" ? "guest" : undefined} />;
}
