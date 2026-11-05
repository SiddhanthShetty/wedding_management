import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getCateringWorkspace } from "@/lib/data/catering";
import { CateringManager } from "@/components/catering-manager";

export default async function Page() { const workspace=await requireCurrentWorkspace("logistics"); const data=await getCateringWorkspace(workspace.wedding.id); return <CateringManager data={data}/>; }
