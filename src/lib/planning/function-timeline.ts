/** Functions grouped by day for the timeline: dated days in order, then "Date not set". */
export type TimelineFunction = { id: string; name: string; function_date: string | null; start_time: string | null };

export function functionsByDay<T extends TimelineFunction>(functions: T[]): Array<{ date: string | null; items: T[] }> {
  const byTime = (a: T, b: T) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99") || a.name.localeCompare(b.name);
  const days = new Map<string, T[]>();
  for (const item of functions.filter((fn) => fn.function_date)) days.set(item.function_date as string, [...(days.get(item.function_date as string) ?? []), item]);
  const groups: Array<{ date: string | null; items: T[] }> = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items: items.sort(byTime) }));
  const undated = functions.filter((fn) => !fn.function_date).sort(byTime);
  if (undated.length) groups.push({ date: null, items: undated });
  return groups;
}
