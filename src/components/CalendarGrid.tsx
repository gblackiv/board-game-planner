"use client";

import { getRollingWindow } from "@/lib/dates";
import { DayCell } from "./DayCell";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CalendarGridProps {
  availableDates: string[];
  onToggle?: (date: string) => void;
  readOnly?: boolean;
  counts?: Record<string, number>;
  totalCouples?: number;
}

export function CalendarGrid({ availableDates, onToggle, readOnly, counts, totalCouples }: CalendarGridProps) {
  const dates = getRollingWindow();
  const availableSet = new Set(availableDates);

  const firstDate = new Date(dates[0] + "T12:00:00");
  const startDayOfWeek = firstDate.getDay();

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {dates.map((date) => (
          <DayCell
            key={date}
            date={date}
            available={availableSet.has(date)}
            onToggle={onToggle}
            readOnly={readOnly}
            count={counts?.[date]}
            totalCouples={totalCouples}
          />
        ))}
      </div>
    </div>
  );
}
