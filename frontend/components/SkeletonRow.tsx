interface SkeletonRowProps {
  columns: number;
}

const COL_WIDTHS: Record<number, string> = {
  0: "w-24",
  1: "w-32",
  2: "w-16",
};

export default function SkeletonRow({ columns }: SkeletonRowProps) {
  return (
    <tr>
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded h-4 ${
              COL_WIDTHS[i] ?? "w-20"
            }`}
          />
        </td>
      ))}
    </tr>
  );
}
