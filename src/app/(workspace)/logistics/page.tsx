import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getCateringWorkspace, getMealCounts } from "@/lib/data/catering";
import { CateringManager } from "@/components/catering-manager";

export default async function Page() {
  const workspace = await requireCurrentWorkspace("logistics");
  const [data, meals] = await Promise.all([
    getCateringWorkspace(workspace.wedding.id),
    // A convenience on this page; if it can't load, the rest still shows.
    getMealCounts(workspace.wedding.id).catch(() => undefined),
  ]);
  return <CateringManager data={data} meals={meals} />;
}
