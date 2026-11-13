import { describe, expect, it } from "vitest";
import { classifyMeal, MEAL_VALUES, mealCountsByFunction } from "../src/lib/planning/meals";
import { PORTAL_STRINGS } from "../src/lib/guest-portal/i18n";

describe("meal choices", () => {
  it("recognises the saved choices and older typed answers", () => {
    for (const [kind, value] of Object.entries(MEAL_VALUES)) expect(classifyMeal(value)).toBe(kind);
    expect(classifyMeal("vegetarian")).toBe("veg");
    expect(classifyMeal("Pure veg")).toBe("veg");
    expect(classifyMeal("non veg")).toBe("nonveg");
    expect(classifyMeal("Non-vegetarian")).toBe("nonveg");
    expect(classifyMeal("fish and chicken")).toBe("nonveg");
    expect(classifyMeal("eggs ok")).toBe("nonveg");
    expect(classifyMeal("eggless please")).toBe("other");
    expect(classifyMeal("Jain, no onion")).toBe("jain");
    expect(classifyMeal("शाकाहारी")).toBe("veg");
    expect(classifyMeal("ಮಾಂಸಾಹಾರಿ")).toBe("nonveg");
    expect(classifyMeal("Gluten free")).toBe("other");
    expect(classifyMeal("  ")).toBe("unknown");
    expect(classifyMeal(null)).toBe("unknown");
  });
  it("has the choices in every guest language", () => {
    for (const strings of Object.values(PORTAL_STRINGS)) {
      for (const key of ["mealChoose", "mealVeg", "mealNonVeg", "mealJain", "mealVegan", "mealOther", "mealOtherHint"] as const) expect(strings[key]).toBeTruthy();
    }
  });
});

describe("food counts per function", () => {
  it("counts only guests who replied yes, and who hasn't said", () => {
    const counts = mealCountsByFunction([
      { function_id: "f1", response: "yes", meal_preference: "Veg" },
      { function_id: "f1", response: "yes", meal_preference: "Non-veg" },
      { function_id: "f1", response: "yes", meal_preference: "Jain" },
      { function_id: "f1", response: "yes", meal_preference: "" },
      { function_id: "f1", response: "no", meal_preference: "Veg" },
      { function_id: "f1", response: null, meal_preference: "Veg" },
      { function_id: "f1", response: "maybe", meal_preference: "Veg" },
      { function_id: "f2", response: "yes", meal_preference: "halal" },
    ]);
    expect(counts).toEqual([
      { functionId: "f1", coming: 4, veg: 1, nonveg: 1, jain: 1, vegan: 0, other: 0, notSaid: 1 },
      { functionId: "f2", coming: 1, veg: 0, nonveg: 0, jain: 0, vegan: 0, other: 1, notSaid: 0 },
    ]);
  });
});
