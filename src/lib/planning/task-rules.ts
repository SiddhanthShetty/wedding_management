export type TaskLike = {
  id: string;
  due_date: string | null;
  status: string;
  depends_on_task_id: string | null;
};

const finishedStatuses = new Set(["completed", "cancelled"]);

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return [
    String(next.getUTCFullYear()).padStart(4, "0"),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function isTaskOverdue(task: Pick<TaskLike, "due_date" | "status">, today: string): boolean {
  return Boolean(task.due_date && task.due_date < today && !finishedStatuses.has(task.status));
}

export function isTaskDueSoon(task: Pick<TaskLike, "due_date" | "status">, today: string, horizonDays = 7): boolean {
  if (!task.due_date || finishedStatuses.has(task.status)) return false;
  return task.due_date >= today && task.due_date <= addDays(today, horizonDays);
}

export function wouldCreateDependencyCycle(
  taskId: string,
  proposedDependencyId: string | null,
  tasks: readonly Pick<TaskLike, "id" | "depends_on_task_id">[],
): boolean {
  if (!proposedDependencyId) return false;
  const dependencies = new Map(tasks.map((task) => [task.id, task.depends_on_task_id]));
  const visited = new Set<string>();
  let current: string | null = proposedDependencyId;
  while (current) {
    if (current === taskId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    current = dependencies.get(current) ?? null;
  }
  return false;
}

export const TASK_VIEWS = ["all", "mine", "mine-open", "mine-overdue", "overdue", "due-soon"] as const;
export type TaskView = typeof TASK_VIEWS[number];

/** The single definition of each task list view; the dashboard counts with the same function. */
export function matchesTaskView(task: Pick<TaskLike, "due_date" | "status"> & { owner_user_id: string | null }, view: TaskView, userId: string, today: string): boolean {
  const mine = task.owner_user_id === userId;
  switch (view) {
    case "mine": return mine;
    case "mine-open": return mine && !finishedStatuses.has(task.status);
    case "mine-overdue": return mine && isTaskOverdue(task, today);
    case "overdue": return isTaskOverdue(task, today);
    case "due-soon": return isTaskDueSoon(task, today);
    default: return true;
  }
}
