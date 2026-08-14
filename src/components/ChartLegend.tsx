/** Chip legend sitting above a panel chart. Shared by Financials and Earnings. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex gap-3 mb-1 justify-end">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="text-[9px] text-gray-500 dark:text-white">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
