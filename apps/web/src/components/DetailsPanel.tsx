import type { FlowNode } from "@flow/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

/** A minimal edge descriptor used by the panel to render edge details. */
export interface SelectedEdge {
  id: string;
  label?: string;
}

export interface DetailsPanelProps {
  /** The currently selected flow node, or `null` when nothing is selected. */
  selectedFlowNode: FlowNode | null;
  /** The currently selected edge, or `null` when nothing is selected. */
  selectedEdge: SelectedEdge | null;
  /**
   * `true` when the Editor tab is active.
   * Controls whether inputs are editable and delete buttons are shown.
   */
  isEditorActive: boolean;
  /**
   * Updates a node's underlying `FlowNode` data by applying `updater` to the
   * current value.  The caller is responsible for syncing the change back to
   * `editorNodes`.
   */
  onUpdateNodeData: (nodeId: string, updater: (fn: FlowNode) => FlowNode) => void;
  /** Updates the label on an edge by ID. */
  onUpdateEdgeLabel: (edgeId: string, label: string) => void;
  /** Deletes the currently selected node from the editor canvas. */
  onDeleteNode: () => void;
  /** Deletes the currently selected edge from the editor canvas. */
  onDeleteEdge: () => void;
}

export function DetailsPanel({
  selectedFlowNode,
  selectedEdge,
  isEditorActive,
  onUpdateNodeData,
  onUpdateEdgeLabel,
  onDeleteNode,
  onDeleteEdge,
}: DetailsPanelProps) {
  return (
    <aside className="w-[320px] flex-shrink-0 border-l border-border bg-background p-4 overflow-y-auto">
      <h2 className="text-base font-semibold text-foreground mb-3">Details</h2>

      {/* Empty state */}
      {!selectedFlowNode && !selectedEdge && (
        <p className="text-sm text-muted-foreground">Select a node or edge.</p>
      )}

      {/* ── Node details ─────────────────────────────────────────────────── */}
      {selectedFlowNode && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <b>ID:</b> {selectedFlowNode.id}
          </p>
          <p className="text-sm">
            <b>Type:</b> {selectedFlowNode.type}
          </p>

          {"title" in selectedFlowNode && (
            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input
                value={selectedFlowNode.title}
                disabled={!isEditorActive}
                onChange={(e) => {
                  if (!isEditorActive) return;
                  onUpdateNodeData(selectedFlowNode.id, (fn) =>
                    "title" in fn ? { ...fn, title: e.target.value } : fn
                  );
                }}
              />
            </div>
          )}

          {"event" in selectedFlowNode && (
            <div className="flex flex-col gap-1.5">
              <Label>Trigger event</Label>
              <Input
                value={selectedFlowNode.event}
                disabled={!isEditorActive}
                onChange={(e) => {
                  if (!isEditorActive) return;
                  onUpdateNodeData(selectedFlowNode.id, (fn) =>
                    fn.type === "trigger" ? { ...fn, event: e.target.value } : fn
                  );
                }}
              />
            </div>
          )}

          {"condition" in selectedFlowNode && (
            <div className="flex flex-col gap-1.5">
              <Label>Split condition</Label>
              <Input
                value={selectedFlowNode.condition}
                disabled={!isEditorActive}
                onChange={(e) => {
                  if (!isEditorActive) return;
                  onUpdateNodeData(selectedFlowNode.id, (fn) =>
                    fn.type === "split" ? { ...fn, condition: e.target.value } : fn
                  );
                }}
              />
            </div>
          )}

          {"copyHint" in selectedFlowNode && selectedFlowNode.copyHint && (
            <div className="flex flex-col gap-1.5">
              <Label>Copy hint</Label>
              <Textarea value={selectedFlowNode.copyHint} disabled rows={3} />
            </div>
          )}

          {selectedFlowNode.type === "message" && selectedFlowNode.strategy && (
            <>
              <Separator />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Strategy
              </p>

              <div className="flex flex-col gap-1.5">
                <Label>Primary focus</Label>
                <Textarea
                  value={selectedFlowNode.strategy.primaryFocus}
                  disabled={!isEditorActive}
                  rows={3}
                  onChange={(e) => {
                    if (!isEditorActive) return;
                    onUpdateNodeData(selectedFlowNode.id, (fn) => {
                      if (fn.type !== "message") return fn;
                      const s = fn.strategy ?? { primaryFocus: "", secondaryFocus: "" };
                      return {
                        ...fn,
                        strategy: {
                          primaryFocus: e.target.value,
                          secondaryFocus: s.secondaryFocus ?? "",
                        },
                      };
                    });
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Secondary focus</Label>
                <Textarea
                  value={selectedFlowNode.strategy.secondaryFocus ?? ""}
                  disabled={!isEditorActive}
                  rows={3}
                  onChange={(e) => {
                    if (!isEditorActive) return;
                    onUpdateNodeData(selectedFlowNode.id, (fn) => {
                      if (fn.type !== "message") return fn;
                      const s = fn.strategy ?? { primaryFocus: "", secondaryFocus: "" };
                      return {
                        ...fn,
                        strategy: {
                          primaryFocus: s.primaryFocus,
                          secondaryFocus: e.target.value,
                        },
                      };
                    });
                  }}
                />
              </div>
            </>
          )}

          {isEditorActive && (
            <Button variant="destructive" size="sm" onClick={onDeleteNode}>
              Delete node
            </Button>
          )}
        </div>
      )}

      {/* ── Edge details ─────────────────────────────────────────────────── */}
      {selectedEdge && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <b>Edge:</b> {selectedEdge.id}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Label</Label>
            <Input
              value={selectedEdge.label ?? ""}
              disabled={!isEditorActive}
              onChange={(e) => {
                if (!isEditorActive) return;
                onUpdateEdgeLabel(selectedEdge.id, e.target.value);
              }}
            />
          </div>
          {isEditorActive && (
            <Button variant="destructive" size="sm" onClick={onDeleteEdge}>
              Delete edge
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
