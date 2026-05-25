"use server";

import { supabase } from "@/lib/supabase";
import { isWithinWindow } from "@/lib/dates";

export async function toggleAvailability(
  coupleId: string,
  date: string
): Promise<{ available: boolean } | { error: string }> {
  if (!isWithinWindow(date)) {
    return { error: "Date is outside the valid window" };
  }

  const { data: existing } = await supabase
    .from("availability")
    .select("id")
    .eq("couple_id", coupleId)
    .eq("date", date)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("availability")
      .delete()
      .eq("couple_id", coupleId)
      .eq("date", date);
    return { available: false };
  } else {
    await supabase.from("availability").insert({
      couple_id: coupleId,
      date,
    });
    return { available: true };
  }
}

export async function getAvailability(coupleId: string): Promise<string[]> {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("availability")
    .select("date")
    .eq("couple_id", coupleId)
    .gte("date", today);

  return (data ?? []).map((row) => row.date);
}
