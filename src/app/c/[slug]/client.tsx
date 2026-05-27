"use client";

import { useState } from "react";
import { CalendarGrid } from "@/components/CalendarGrid";
import { toggleAvailability } from "@/actions/availability";

interface CoupleCalendarClientProps {
  coupleId: string;
  initialDates: string[];
}

export function CoupleCalendarClient({ coupleId, initialDates }: CoupleCalendarClientProps) {
  const [dates, setDates] = useState<string[]>(initialDates);

  async function handleToggle(date: string) {
    if (dates.includes(date)) {
      setDates(dates.filter((d) => d !== date));
    } else {
      setDates([...dates, date]);
    }
    await toggleAvailability(coupleId, date);
  }

  return (
    <div>
      <CalendarGrid availableDates={dates} onToggle={handleToggle} />
    </div>
  );
}
