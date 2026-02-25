import { FLOW_TYPE_LABELS, type FlowType } from "@flow/core";
import { FLOW_TYPES } from "./LibraryView";

export interface LibrarySidebarProps {
  /** The flow type currently selected and displayed on the canvas. */
  activeType: FlowType;
  /** Called when the user clicks a different flow type in the list. */
  onTypeChange: (type: FlowType) => void;
}

export function LibrarySidebar({ activeType, onTypeChange }: LibrarySidebarProps) {
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-1">
      <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-2 pb-1.5">
        Flow Types
      </p>
      {FLOW_TYPES.map((ft) => (
        <button
          key={ft}
          type="button"
          className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] transition-colors text-left ${
            ft === activeType
              ? "bg-sidebar-item-active-bg text-primary font-semibold shadow-sm"
              : "text-sidebar-foreground hover:bg-sidebar-item-hover font-medium"
          }`}
          onClick={() => onTypeChange(ft)}
        >
          <span className="truncate">{FLOW_TYPE_LABELS[ft]}</span>
        </button>
      ))}
    </div>
  );
}
