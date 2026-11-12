import { PageHeading } from "@/components/ui";
import { TaskManager } from "@/components/task-manager";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { TASK_VIEWS } from "@/lib/planning/task-rules";
import { listWeddingFunctions } from "@/lib/data/functions";
import { listTaskAssignees, listWeddingTasks } from "@/lib/data/tasks";

function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const initialView = TASK_VIEWS.find((value) => value === params.view) ?? "all";
  const workspace = await requireCurrentWorkspace("planning");
  const [tasks, functions, assignees] = await Promise.all([
    listWeddingTasks(workspace.wedding.id),
    listWeddingFunctions(workspace.wedding.id),
    listTaskAssignees(workspace.wedding.id),
  ]);
  const canEdit = workspace.membership.role === "owner"
    || workspace.membership.role === "co_owner"
    || workspace.moduleAccess.planning === "edit";
  return <>
    <PageHeading eyebrow="Tasks" title="To do" description="Everything to do, grouped by when it's due. Type a task to add it." />
    <TaskManager
      weddingId={workspace.wedding.id}
      currentUserId={workspace.user.id}
      today={todayInTimezone(workspace.wedding.timezone)}
      timezone={workspace.wedding.timezone}
      tasks={tasks}
      functions={functions}
      assignees={assignees}
      canEdit={canEdit}
      initialView={initialView}
      viewFromUrl={typeof params.view === "string"}
      weddingDate={workspace.wedding.wedding_date}
      focusAdd={params.add === "1"}
    />
  </>;
}
