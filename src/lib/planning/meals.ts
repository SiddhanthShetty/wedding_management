/**
 * Meal choices and per-function counts. Meal preference is stored as plain text: the choices
 * below save their English word ("Veg", "Non-veg", …) and "Other" saves what the guest wrote.
 * Older free-text answers are recognised where the meaning is clear.
 */
export const MEAL_KINDS = ["veg", "nonveg", "jain", "vegan"] as const;
export type MealKind = (typeof MEAL_KINDS)[number];
export type MealClass = MealKind | "other" | "unknown";

/** What each choice saves. */
export const MEAL_VALUES: Record<MealKind, string> = { veg: "Veg", nonveg: "Non-veg", jain: "Jain", vegan: "Vegan" };

const normal = (text: string) => text.normalize("NFC").toLowerCase().replace(/[\s._-]+/g, " ").trim();

export function classifyMeal(text: string | null | undefined): MealClass {
  const value = normal(text ?? "");
  if (!value) return "unknown";
  // Check "non" first, so "non veg" isn't read as veg.
  if (/\bnon ?veg|non ?vegetarian|\bmeat|chicken|\bfish|mutton|\beggs?\b|मांसाहारी|ಮಾಂಸಾಹಾರಿ/.test(value)) return "nonveg";
  if (/\bjain|जैन|ಜೈನ/.test(value)) return "jain";
  if (/\bvegan|वीगन|ವೀಗನ್/.test(value)) return "vegan";
  if (/^(veg|vegetarian|pure veg|veg only|शाकाहारी|ಸಸ್ಯಾಹಾರಿ)$/.test(value) || /\bvegetarian\b|शाकाहारी|ಸಸ್ಯಾಹಾರಿ/.test(value) || value === "veg") return "veg";
  return "other";
}

export type MealRow = { function_id: string; response: string | null; meal_preference: string | null };
export type MealCounts = { functionId: string; coming: number; veg: number; nonveg: number; jain: number; vegan: number; other: number; notSaid: number };

/** For each function: everyone who replied yes, split by what they eat. */
export function mealCountsByFunction(rows: MealRow[]): MealCounts[] {
  const byFunction = new Map<string, MealCounts>();
  for (const row of rows) {
    if (row.response !== "yes") continue;
    const counts = byFunction.get(row.function_id) ?? { functionId: row.function_id, coming: 0, veg: 0, nonveg: 0, jain: 0, vegan: 0, other: 0, notSaid: 0 };
    counts.coming += 1;
    const kind = classifyMeal(row.meal_preference);
    if (kind === "unknown") counts.notSaid += 1; else counts[kind] += 1;
    byFunction.set(row.function_id, counts);
  }
  return [...byFunction.values()];
}
