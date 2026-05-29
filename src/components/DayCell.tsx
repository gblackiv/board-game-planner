"use client";

import { useState, useRef, useCallback } from "react";

interface DayCellProps {
  date: string;
  available: boolean;
  onToggle?: (date: string) => void;
  readOnly?: boolean;
  count?: number;
  totalCouples?: number;
  attendees?: string[];
}

export function DayCell({ date, available, onToggle, readOnly, count, totalCouples, attendees }: DayCellProps) {
  const day = new Date(date + "T12:00:00").getDate();
  const [showTooltip, setShowTooltip] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setShowTooltip(true), 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setShowTooltip(false);
  }, []);

  if (readOnly) {
    const intensity = count && totalCouples ? count / totalCouples : 0;
    const hasAttendees = attendees && attendees.length > 0;
    return (
      <div
        className={`relative flex flex-col items-center justify-center rounded-lg p-2 min-h-[3.5rem] group ${
          intensity > 0.7
            ? "bg-green-600 text-white"
            : intensity > 0.4
            ? "bg-green-400 text-white"
            : intensity > 0
            ? "bg-green-200 text-gray-800"
            : "bg-gray-100 text-gray-400"
        }`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <span className="text-xs font-medium">{day}</span>
        {count !== undefined && totalCouples !== undefined && (
          <span className="text-xs">{count}/{totalCouples}</span>
        )}
        {showTooltip && hasAttendees && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none">
            <div className="font-semibold mb-1">Available:</div>
            {attendees.map((name) => (
              <div key={name}>{name}</div>
            ))}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onToggle?.(date)}
      className={`flex items-center justify-center rounded-lg p-2 min-h-[3.5rem] transition-colors ${
        available
          ? "bg-green-500 text-white font-bold"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      <span className="text-sm">{day}</span>
    </button>
  );
}
