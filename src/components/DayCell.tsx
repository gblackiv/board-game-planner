"use client";

interface DayCellProps {
  date: string;
  available: boolean;
  onToggle?: (date: string) => void;
  readOnly?: boolean;
  count?: number;
  totalCouples?: number;
}

export function DayCell({ date, available, onToggle, readOnly, count, totalCouples }: DayCellProps) {
  const day = new Date(date + "T12:00:00").getDate();

  if (readOnly) {
    const intensity = count && totalCouples ? count / totalCouples : 0;
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-lg p-2 min-h-[3.5rem] ${
          intensity > 0.7
            ? "bg-green-600 text-white"
            : intensity > 0.4
            ? "bg-green-400 text-white"
            : intensity > 0
            ? "bg-green-200 text-gray-800"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        <span className="text-xs font-medium">{day}</span>
        {count !== undefined && totalCouples !== undefined && (
          <span className="text-xs">{count}/{totalCouples}</span>
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
