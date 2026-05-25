"use client";

import { useOptimistic, useTransition } from "react";
import { CalendarGrid } from "@/components/CalendarGrid";
import { toggleAvailability } from "@/actions/availability";

interface CoupleCalendarClientProps {
  coupleId: string;
  initialDates: string[];
}

export function CoupleCalendarClient({ coupleId, initialDates }: CoupleCalendarClientProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDates, setOptimisticDates] = useOptimistic(
    initialDates,
    (current: string[], date: string) => {
      if (current.includes(date)) {
        return current.filter((d) => d !== date);
      }
      return [...current, date];
    }
  );

  function handleToggle(date: string) {
    startTransition(async () => {
      setOptimisticDates(date);
      await toggleAvailability(coupleId, date);
    });
  }

  return (
    <div className={isPending ? "opacity-90" : ""}>
      <CalendarGrid availableDates={optimisticDates} onToggle={handleToggle} />
    </div>
  );
}
