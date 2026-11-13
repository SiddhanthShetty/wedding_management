/**
 * On a day with a function, people land on Day-of first (after signing in or opening the site).
 * The Home link always shows Home, so it is never out of reach.
 */
export type DayFunction = { function_date: string | null; status: string; archived_at?: string | null };

export function isFunctionDay(functions: DayFunction[], today: string): boolean {
  return functions.some((fn) => fn.function_date === today && fn.status !== "cancelled" && !fn.archived_at);
}

export function shouldOpenDayOfFirst(input: { functions: DayFunction[]; today: string; canSeeDayOf: boolean; askedForHome: boolean }): boolean {
  return input.canSeeDayOf && !input.askedForHome && isFunctionDay(input.functions, input.today);
}
