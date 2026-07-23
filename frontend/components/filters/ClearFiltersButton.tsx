import { X } from "lucide-react";

export interface ClearFiltersButtonProps {
  visible: boolean;
  onClear: () => void;
  className?: string;
}

export default function ClearFiltersButton({
  visible,
  onClear,
  className = "",
}: ClearFiltersButtonProps) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClear}
      className={`flex items-center gap-1 text-[12px] font-medium transition-colors duration-150 ${className}`}
      style={{ color: "var(--text-tertiary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
    >
      <X size={12} />
      Clear
    </button>
  );
}
