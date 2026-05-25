export function HeatLegend() {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span>Less</span>
      <div className="w-4 h-4 rounded bg-gray-100" />
      <div className="w-4 h-4 rounded bg-green-200" />
      <div className="w-4 h-4 rounded bg-green-400" />
      <div className="w-4 h-4 rounded bg-green-600" />
      <span>More</span>
    </div>
  );
}
