export interface FilterBadgeProps {
  count: number;
}

export default function FilterBadge({ count }: FilterBadgeProps) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none w-4 h-4">
      {count > 9 ? "9+" : count}
    </span>
  );
}
