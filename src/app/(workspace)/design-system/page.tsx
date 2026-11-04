import { notFound } from "next/navigation";
import { DemoExamples } from "@/components/demo-examples";
import { PageHeading } from "@/components/ui";
import { requireCurrentWorkspace } from "@/lib/auth/access";

export default async function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await requireCurrentWorkspace();
  return <><PageHeading eyebrow="Local development reference" title="Design system" description="Reusable shell components and interaction states. Demo-only controls do not save data." /><DemoExamples /></>;
}
