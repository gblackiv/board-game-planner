import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAvailability } from "@/actions/availability";
import { CoupleCalendarClient } from "./client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CoupleCalendarPage({ params }: PageProps) {
  const { slug } = await params;

  const { data: couple } = await supabase
    .from("couples")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!couple) {
    notFound();
  }

  const availableDates = await getAvailability(couple.id);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          {couple.name}
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Tap days you&apos;re available for board game night
        </p>
        <CoupleCalendarClient coupleId={couple.id} initialDates={availableDates} />
      </div>
    </div>
  );
}
