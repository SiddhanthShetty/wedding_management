import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getTravelWorkspace } from "@/lib/data/travel";
import { TravelManager, type TravelFilter, type TravelTab } from "@/components/travel-manager";

const tabs: TravelTab[] = ["needs", "accommodation", "transport", "summaries"];
const filters: TravelFilter[] = ["all", "rooms-missing", "arrivals-missing", "departures-missing", "room-unknown"];

export default async function TravelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace("logistics");
  const params = await searchParams;
  const tab = tabs.find((value) => value === params.tab) ?? "needs";
  const filter = filters.find((value) => value === params.filter) ?? "all";
  const data = await getTravelWorkspace(workspace.wedding.id);
  return <TravelManager data={data} initialTab={tab} initialFilter={filter} tabFromUrl={typeof params.tab === "string"} />;
}
