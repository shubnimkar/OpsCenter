interface SkeletonRowProps {
  columns: number;
  rowHeight?: string;
}

export default function SkeletonRow({
  columns,
  rowHeight = "h-[48px]",
}: SkeletonRowProps) {
  const widths = ["w-32", "w-24", "w-20", "w-28", "w-16", "w-24", "w-20", "w-28", "w-16"];

  return (
    <tr className={`bg-[var(--bg-card)] ${rowHeight}`} aria-hidden="true">
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className={`skeleton h-3.5 rounded-md ${widths[i % widths.length]}`}
          />
        </td>
      ))}
    </tr>
  );
}
