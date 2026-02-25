import { RotateCcw } from "lucide-react";
import type { FlowSpec } from "@flow/core";
import type { NodeKind, TemplateChoice } from "../types/flow";
import { VIEWER_CHOICES } from "../constants";
import { Button } from "@/components/ui/button";

/** Node categories rendered in the "Add Nodes" palette. */
const NODE_CATEGORIES: { label: string; kinds: NodeKind[] }[] = [
  { label: "Actions", kinds: ["trigger", "email", "sms", "outcome"] },
  { label: "Timing", kinds: ["wait"] },
  { label: "Logic", kinds: ["split", "profileFilter", "merge"] },
];

export interface EditorSidebarProps {
  /** `true` when more than one flow has been loaded into the editor. */
  isMultiFlowEditor: boolean;
  /** All flows currently held in the multi-flow editor state. */
  editorFlows: FlowSpec[];
  /** Zero-based index of the flow currently displayed on the canvas. */
  activeEditorFlowIndex: number;
  /** The value of the preset `<select>` (empty string means nothing selected). */
  editorPreset: string;
  /**
   * Switches the editor canvas to the flow at `targetIndex`.
   * The caller is responsible for snapshotting the current flow first.
   */
  onSwitchFlow: (targetIndex: number) => void;
  /**
   * Called when the user picks a preset from the dropdown.
   * The caller should update the `editorPreset` state AND load the preset.
   */
  onPresetChange: (choice: TemplateChoice) => void;
  /** Appends a new node of `kind` to the editor canvas. */
  onAddNode: (kind: NodeKind) => void;
  /** Clears all nodes, edges, and imported flows from the editor. */
  onReset: () => void;
}

export function EditorSidebar({
  isMultiFlowEditor,
  editorFlows,
  activeEditorFlowIndex,
  editorPreset,
  onSwitchFlow,
  onPresetChange,
  onAddNode,
  onReset,
}: EditorSidebarProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* ── Flow selector (multi-flow only) ── */}
      {isMultiFlowEditor && (
        <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider">
              Flows
            </p>
            <span className="text-[11px] text-sidebar-muted font-medium">
              {editorFlows.length} imported
            </span>
          </div>
          <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto">
            {editorFlows.map((flow, idx) => (
              <button
                key={flow.id}
                type="button"
                className={`text-left px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                  idx === activeEditorFlowIndex
                    ? "bg-sidebar-item-active-bg text-primary font-semibold shadow-sm border border-sidebar-item-active-border"
                    : "text-sidebar-foreground hover:bg-sidebar-item-hover font-medium border border-transparent"
                }`}
                onClick={() => onSwitchFlow(idx)}
              >
                <span className="block truncate">{flow.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Preset picker ── */}
      <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-2">
        <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">
          Preset
        </p>
        <select
          id="editor-preset"
          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-[13px] text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={editorPreset}
          onChange={(e) => onPresetChange(e.target.value as TemplateChoice)}
        >
          <option value="">— Select —</option>
          {VIEWER_CHOICES.filter((c) => c.value !== "custom").map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Add Nodes palette ── */}
      <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-3">
        <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">
          Add Nodes
        </p>
        {NODE_CATEGORIES.map((category) => (
          <div key={category.label}>
            <p className="text-[11px] font-medium text-sidebar-muted uppercase tracking-wide mb-1.5 px-1">
              {category.label}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {category.kinds.map((kind) => {
                const displayLabel =
                  kind === "profileFilter"
                    ? "Filter"
                    : kind.charAt(0).toUpperCase() + kind.slice(1);
                return (
                  <button
                    key={kind}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/flow-node-kind", kind);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onAddNode(kind)}
                    className="h-9 rounded-lg border text-[13px] font-medium cursor-grab transition-colors bg-sidebar border-sidebar-border text-sidebar-foreground hover:bg-sidebar-item-hover hover:border-input"
                  >
                    + {displayLabel}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-xs text-sidebar-muted px-1">
          Drag onto canvas or click to append.
        </p>
      </div>

      {/* ── Reset ── */}
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive/80 hover:text-destructive hover:bg-destructive/10"
        onClick={onReset}
      >
        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
        Reset editor
      </Button>
    </div>
  );
}
