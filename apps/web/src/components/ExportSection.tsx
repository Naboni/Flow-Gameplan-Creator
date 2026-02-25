import { useRef, type ChangeEvent } from "react";
import { Download, FileJson, Image, Send, Upload } from "lucide-react";
import type { AppTab, GeneratedResult } from "../types/flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ExportSectionProps {
  /** The currently active application tab. */
  tab: AppTab;
  /** Whether the Editor tab is currently active. */
  isEditorActive: boolean;
  /** Whether multiple flows are loaded into the editor. */
  isMultiFlowEditor: boolean;
  /** `true` when there is any canvas content available to export. */
  hasContent: boolean;
  /** `true` while a PNG export is in progress. */
  busyPngExport: boolean;
  /** `true` while a Miro export is in progress. */
  busyMiroExport: boolean;
  /** Current value of the Miro board-ID input field. */
  miroBoardId: string;
  /** Called whenever the Miro board-ID input changes. */
  onMiroBoardIdChange: (id: string) => void;
  /** Triggers a JSON download of the currently active flow. */
  onExportJson: () => void;
  /** Captures the canvas and triggers a PNG download. */
  onExportPng: () => void;
  /**
   * Handles the `change` event on the hidden file input after the user picks
   * a `.json` file to import.
   */
  onImportJson: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Downloads all editor flows as a single JSON array (multi-flow only). */
  onExportAllEditorFlows: () => void;
  /** Exports the active flow(s) to the Miro board specified by `miroBoardId`. */
  onExportMiro: () => void;
  /**
   * The latest generated result — used to decide whether to show
   * "Export All to Miro" (multiple flows) or "Export to Miro" (single).
   */
  genResult: GeneratedResult | null;
}

export function ExportSection({
  tab,
  isEditorActive,
  isMultiFlowEditor,
  hasContent,
  busyPngExport,
  busyMiroExport,
  miroBoardId,
  onMiroBoardIdChange,
  onExportJson,
  onExportPng,
  onImportJson,
  onExportAllEditorFlows,
  onExportMiro,
  genResult,
}: ExportSectionProps) {
  /* Hidden file input owned by this component to avoid leaking the ref. */
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const showBatchMiro =
    (tab === "generate" && genResult && genResult.flows.length > 1) ||
    (isEditorActive && isMultiFlowEditor);

  return (
    <div className="border-t border-sidebar-border bg-sidebar-card px-3 py-4 flex flex-col gap-3">
      {/* JSON / PNG / Import */}
      <div className="rounded-xl border border-sidebar-border bg-sidebar p-3 flex flex-col gap-2">
        <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">
          Export
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onExportJson}
            disabled={!hasContent}
          >
            <FileJson className="w-3.5 h-3.5 mr-1" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onExportPng}
            disabled={!hasContent || busyPngExport}
          >
            <Image className="w-3.5 h-3.5 mr-1" />
            {busyPngExport ? "..." : "PNG"}
          </Button>
        </div>

        {isEditorActive && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Import JSON
            </Button>
            {/* Hidden file input — triggered by the Import JSON button above */}
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportJson}
            />
            {isMultiFlowEditor && (
              <Button variant="outline" size="sm" onClick={onExportAllEditorFlows}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export All (JSON)
              </Button>
            )}
          </>
        )}
      </div>

      {/* Miro export */}
      <div className="rounded-xl border border-sidebar-border bg-sidebar p-3 flex flex-col gap-2">
        <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">
          Miro
        </p>
        <Input
          className="h-8 text-[13px] rounded-lg"
          placeholder="Board ID"
          value={miroBoardId}
          onChange={(e) => onMiroBoardIdChange(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={onExportMiro} disabled={busyMiroExport}>
          <Send className="w-3.5 h-3.5 mr-1.5" />
          {busyMiroExport
            ? "Exporting..."
            : showBatchMiro
              ? "Export All to Miro"
              : "Export to Miro"}
        </Button>
      </div>
    </div>
  );
}
