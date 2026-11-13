"use client";
import { useId, useState } from "react";
import { classifyMeal, MEAL_KINDS, MEAL_VALUES, type MealKind } from "@/lib/planning/meals";

export type MealLabels = { meal: string; choose: string; other: string; otherHint: string } & Record<MealKind, string>;

/**
 * Veg / Non-veg / Jain / Vegan / Something else, saved as one text field named `name`.
 * An older free-text answer opens as "Something else" with its words kept.
 */
export function MealChoice({ name, defaultValue, labels, labelClass = "field-label", controlClass = "field-control" }: { name: string; defaultValue: string; labels: MealLabels; labelClass?: string; controlClass?: string }) {
  const id = useId();
  const initial = classifyMeal(defaultValue);
  const known = initial !== "other" && initial !== "unknown" && MEAL_VALUES[initial as MealKind] === defaultValue.trim();
  const [choice, setChoice] = useState<string>(known ? initial : defaultValue.trim() ? "other" : "");
  const [otherText, setOtherText] = useState(known ? "" : defaultValue);
  const value = choice === "" ? "" : choice === "other" ? otherText.trim() : MEAL_VALUES[choice as MealKind];
  return <>
    <label className={labelClass} htmlFor={`${id}-meal`}>{labels.meal}</label>
    <select id={`${id}-meal`} className={controlClass} value={choice} onChange={(event) => setChoice(event.target.value)}>
      <option value="">{labels.choose}</option>
      {MEAL_KINDS.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}
      <option value="other">{labels.other}</option>
    </select>
    {choice === "other" && <><label className="sr-only" htmlFor={`${id}-other`}>{labels.otherHint}</label><input id={`${id}-other`} className={controlClass} maxLength={500} value={otherText} placeholder={labels.otherHint} onChange={(event) => setOtherText(event.target.value)} /></>}
    <input type="hidden" name={name} value={value} />
  </>;
}
