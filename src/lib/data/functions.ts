import "server-only";

import { z } from "zod";
import { authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { functionInputSchema } from "@/lib/planning/inputs";
import { resolveFunctionSchedule } from "@/lib/planning/schedule";

export type WeddingFunction = {
  id: string;
  wedding_id: string;
  name: string;
  function_type: string;
  description: string;
  function_date: string | null;
  start_time: string | null;
  end_time: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  guest_map_url: string | null;
  status: "tentative" | "confirmed" | "cancelled";
  expected_attendance: number | null;
  budget_allocation: number | string | null;
  coordinator_name: string | null;
  dress_code: string | null;
  notes: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FunctionTaskArrangement = { id: string; function_id: string; title: string; due_date: string | null; status: string };

const functionColumns = "id, wedding_id, name, function_type, description, function_date, start_time, end_time, starts_at, ends_at, venue_name, guest_map_url, status, expected_attendance, budget_allocation, coordinator_name, dress_code, notes, archived_at, created_at, updated_at";

function parseFunctionInput(input: unknown, timezone: string) {
  const values = functionInputSchema.parse(input);
  const schedule = resolveFunctionSchedule({
    date: values.functionDate,
    startTime: values.startTime,
    endTime: values.endTime,
    timezone,
  });
  if (values.status === "confirmed" && !schedule.functionDate) {
    throw new Error("Add a function date before confirming it.");
  }
  return { values, schedule };
}

export async function listWeddingFunctions(weddingId: string) {
  await authorizeWeddingOperation(weddingId, "planning", "read");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("functions")
    .select(functionColumns)
    .eq("wedding_id", weddingId)
    .order("function_date", { ascending: true, nullsFirst: false })
    .order("starts_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error("Could not load wedding functions.");
  return (data ?? []) as WeddingFunction[];
}

export async function listFunctionTaskArrangements(weddingId: string): Promise<FunctionTaskArrangement[]> {
  await authorizeWeddingOperation(weddingId, "planning", "read");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tasks")
    .select("id, function_id, title, due_date, status")
    .eq("wedding_id", weddingId).not("function_id", "is", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error("Could not load function-linked tasks.");
  return (data ?? []) as FunctionTaskArrangement[];
}

export async function createWeddingFunction(weddingId: string, input: unknown) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const { values, schedule } = parseFunctionInput(input, context.wedding.timezone);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("functions").insert({
    wedding_id: context.wedding.id,
    name: values.name,
    function_type: values.functionType,
    function_date: schedule.functionDate,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    venue_name: values.venueName || null,
    guest_map_url: values.guestMapUrl || null,
    status: values.status,
    expected_attendance: values.expectedAttendance,
    budget_allocation: values.budgetAllocation,
    coordinator_name: values.coordinatorName || null,
    dress_code: values.dressCode || null,
    notes: values.notes,
    description: values.notes,
    created_by_user_id: context.user.id,
  }).select(functionColumns).single();
  if (error) throw new Error("Could not create the wedding function.");
  return data as WeddingFunction;
}

export async function updateWeddingFunction(weddingId: string, functionId: string, input: unknown) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const { values, schedule } = parseFunctionInput(input, context.wedding.timezone);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("functions").update({
    name: values.name,
    function_type: values.functionType,
    function_date: schedule.functionDate,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    venue_name: values.venueName || null,
    guest_map_url: values.guestMapUrl || null,
    status: values.status,
    expected_attendance: values.expectedAttendance,
    budget_allocation: values.budgetAllocation,
    coordinator_name: values.coordinatorName || null,
    dress_code: values.dressCode || null,
    notes: values.notes,
    description: values.notes,
  }).eq("wedding_id", context.wedding.id).eq("id", functionId).is("archived_at", null)
    .select(functionColumns).maybeSingle();
  if (error) throw new Error("Could not update the wedding function.");
  if (!data) throw new Error("Wedding function not found, archived, or access was revoked.");
  return data as WeddingFunction;
}

export async function archiveWeddingFunction(weddingId: string, functionId: string) {
  await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("functions").update({ archived_at: new Date().toISOString() })
    .eq("wedding_id", weddingId).eq("id", functionId).is("archived_at", null)
    .select("id, archived_at").maybeSingle();
  if (error) throw new Error("Could not archive the wedding function.");
  if (!data) throw new Error("Wedding function not found or already archived.");
  return data;
}

export function validateFunctionRecordId(value: unknown) {
  return z.uuid().parse(value);
}
