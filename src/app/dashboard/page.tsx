import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getRollingWindow } from "@/lib/dates";
import { CalendarGrid } from "@/components/CalendarGrid";
import { HeatLegend } from "@/components/HeatLegend";

interface AvailabilityRow {
  date: string;
  couple_id: string;
  couples: { name: string };
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const window = getRollingWindow();
  const today = window[0];
  const endDate = window[window.length - 1];

  const { data: couples } = await supabase
    .from("couples")
    .select("id, name, slug")
    .order("name");

  const { data: availability } = await supabase
    .from("availability")
    .select("date, couple_id, couples(name)")
    .gte("date", today)
    .lte("date", endDate);

  const totalCouples = couples?.length ?? 0;

  const counts: Record<string, number> = {};
  const attendees: Record<string, string[]> = {};

  for (const row of (availability ?? []) as unknown as AvailabilityRow[]) {
    counts[row.date] = (counts[row.date] ?? 0) + 1;
    if (!attendees[row.date]) attendees[row.date] = [];
    attendees[row.date].push(row.couples.name);
  }

  const bestNights = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Board Game Night
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {totalCouples} couples in the group
        </p>

        {bestNights.length > 0 && (
          <div className="mb-6 space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">Best Nights</h2>
            {bestNights.map(([date, count]) => (
              <div key={date} className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-900">
                    {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="text-sm text-green-600 font-semibold">
                    {count}/{totalCouples} available
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {attendees[date]?.join(", ")}
                </p>
              </div>
            ))}
          </div>
        )}

        <CalendarGrid
          availableDates={[]}
          readOnly
          counts={counts}
          totalCouples={totalCouples}
        />

        <div className="mt-4 flex justify-center">
          <HeatLegend />
        </div>

        {couples && couples.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Your Page</h2>
            <div className="space-y-2">
              {couples.map((couple) => (
                <Link
                  key={couple.id}
                  href={`/c/${couple.slug}`}
                  className="block bg-white rounded-lg p-3 shadow-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                >
                  {couple.name} &rarr;
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
