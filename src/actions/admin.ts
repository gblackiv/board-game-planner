"use server";

import { supabase } from "@/lib/supabase";
import { generateSlug } from "@/lib/slugs";

export interface Couple {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export async function addCouple(name: string): Promise<Couple> {
  const slug = generateSlug(name);

  const { data, error } = await supabase
    .from("couples")
    .insert({ name, slug })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add couple: ${error.message}`);
  }

  return data as Couple;
}

export async function removeCouple(id: string): Promise<void> {
  await supabase.from("couples").delete().eq("id", id);
}

export async function listCouples(): Promise<Couple[]> {
  const { data } = await supabase
    .from("couples")
    .select("*")
    .order("name");

  return (data ?? []) as Couple[];
}

export async function regenerateSlug(id: string, name: string): Promise<Couple> {
  const slug = generateSlug(name);

  const { data } = await supabase
    .from("couples")
    .update({ slug })
    .eq("id", id)
    .select()
    .single();

  return data as Couple;
}
