import { useState, type ChangeEvent } from "react";
import { type Edge, type Node } from "reactflow";
import { parseFlowSpecSafe, type FlowSpec } from "@flow/core";
import { exportFlowToMiro, exportFlowsToMiro } from "@flow/miro";
import { toPng } from "html-to-image";
import type { AppNodeData, AppTab, GeneratedResult } from "../types/flow";
import { downloadBlob, editorToFlowSpec, specToRfEdges, specToRfNodes } from "../utils/flowHelpers";
import { normalizeFlowSpecCandidate } from "../utils/flowNormalize";
import { toast } from "sonner";
import type React from "react";

// Manages all export and import operations plus their loading states.
export function useExportImport(opts: {
  isEditorActive: boolean;
  isMultiFlowEditor: boolean;
  tab: AppTab;
  activeGenFlow: FlowSpec | null;
  genResult: GeneratedResult | null;
  editorNodes: Node<AppNodeData>[];
  editorEdges: Edge[];
  editorFlows: FlowSpec[];
  activeEditorFlowIndex: number;
  setEditorNodes: React.Dispatch<React.SetStateAction<Node<AppNodeData>[]>>;
  setEditorEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setEditorFlows: React.Dispatch<React.SetStateAction<FlowSpec[]>>;
  setActiveEditorFlowIndex: (idx: number) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setTab: (tab: AppTab) => void;
  flowNodes: Node<AppNodeData>[];
  theme: string;
  canvasCaptureRef: React.RefObject<HTMLDivElement>;
}) {
  const {
    isEditorActive, isMultiFlowEditor, tab, activeGenFlow, genResult,
    editorNodes, editorEdges, editorFlows, activeEditorFlowIndex,
    setEditorNodes, setEditorEdges, setEditorFlows, setActiveEditorFlowIndex,
    setSelectedNodeId, setSelectedEdgeId, setTab,
    flowNodes, theme, canvasCaptureRef,
  } = opts;

  const [busyPngExport, setBusyPngExport] = useState(false);
  const [busyMiroExport, setBusyMiroExport] = useState(false);
  const [miroBoardId, setMiroBoardId] = useState("");

  // Returns the FlowSpec for the currently active view.
  function getExportSpec(): FlowSpec {
    if (isEditorActive) {
      if (isMultiFlowEditor) {
        const current = editorFlows[activeEditorFlowIndex];
        return editorToFlowSpec(editorNodes, editorEdges, {
          id: current.id, name: current.name, channels: current.channels, defaults: current.defaults,
        });
      }
      return editorToFlowSpec(editorNodes, editorEdges);
    }
    if (tab === "generate" && activeGenFlow) return activeGenFlow;
    return editorToFlowSpec(editorNodes, editorEdges);
  }

  function handleExportJson() {
    const spec = getExportSpec();
    downloadBlob(
      new Blob([JSON.stringify(spec, null, 2)], { type: "application/json;charset=utf-8" }),
      `${spec.id}.json`
    );
    toast.success("Exported JSON.");
  }

  function handleExportAllJson() {
    if (!genResult) return;
    downloadBlob(
      new Blob([JSON.stringify(genResult.flows, null, 2)], { type: "application/json;charset=utf-8" }),
      `${genResult.planKey}_all_flows.json`
    );
    toast.success("Exported all flows.");
  }

  function handleExportAllEditorFlows() {
    if (!isMultiFlowEditor) return;
    const current = editorFlows[activeEditorFlowIndex];
    const allFlows = editorFlows.map((flow, idx) =>
      idx === activeEditorFlowIndex
        ? editorToFlowSpec(editorNodes, editorEdges, {
            id: current.id, name: current.name, channels: current.channels, defaults: current.defaults,
          })
        : flow
    );
    downloadBlob(
      new Blob([JSON.stringify(allFlows, null, 2)], { type: "application/json;charset=utf-8" }),
      "editor_all_flows.json"
    );
    toast.success("Exported all flows.");
  }

  async function handleExportPng() {
    if (!canvasCaptureRef.current) return;
    setBusyPngExport(true);
    try {
      const dataUrl = await toPng(canvasCaptureRef.current, {
        cacheBust: true,
        backgroundColor: theme === "dark" ? "#111114" : "#f8fafc",
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${getExportSpec().id}.png`;
      a.click();
      toast.success("Exported PNG.");
    } catch {
      toast.error("PNG export failed.");
    } finally {
      setBusyPngExport(false);
    }
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const items: unknown[] = Array.isArray(raw) ? raw : [raw];
      const specs: FlowSpec[] = [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) continue;
        const normalized = normalizeFlowSpecCandidate(obj);
        const result = parseFlowSpecSafe(normalized);
        specs.push(result.success ? result.data : (normalized as FlowSpec));
      }
      if (specs.length === 0) { toast.error("No valid flows found."); return; }

      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      const nodes = specToRfNodes(specs[0]);
      setEditorNodes(nodes);
      setEditorEdges(specToRfEdges(specs[0], nodes));
      if (specs.length === 1) {
        setEditorFlows([]);
        setActiveEditorFlowIndex(0);
        toast.success("Imported JSON.");
      } else {
        setEditorFlows(specs);
        setActiveEditorFlowIndex(0);
        toast.success(`Imported ${specs.length} flows.`);
      }
      setTab("editor");
    } catch (err) {
      console.error("Import failed:", err);
      toast.error("Invalid JSON file.");
    } finally {
      event.target.value = "";
    }
  }

  function getFlowsForMiroExport(): FlowSpec[] {
    if (tab === "generate" && genResult && genResult.flows.length > 0) return genResult.flows;
    if (isEditorActive && isMultiFlowEditor) {
      const current = editorFlows[activeEditorFlowIndex];
      return editorFlows.map((flow, idx) =>
        idx === activeEditorFlowIndex
          ? editorToFlowSpec(editorNodes, editorEdges, {
              id: current.id, name: current.name, channels: current.channels, defaults: current.defaults,
            })
          : flow
      );
    }
    return [getExportSpec()];
  }

  async function handleExportMiro() {
    const miroAccessToken = import.meta.env.VITE_MIRO_ACCESS_TOKEN ?? "";
    if (!miroBoardId.trim()) { toast.error("Enter a Miro board ID."); return; }
    if (!miroAccessToken) { toast.error("VITE_MIRO_ACCESS_TOKEN is not set."); return; }
    setBusyMiroExport(true);
    try {
      const flowsToExport = getFlowsForMiroExport();
      if (flowsToExport.length === 1) {
        const posOverrides: Record<string, { x: number; y: number }> = {};
        for (const n of flowNodes) posOverrides[n.id] = n.position;
        const result = await exportFlowToMiro({
          boardId: miroBoardId.trim(), accessToken: miroAccessToken,
          flowSpec: flowsToExport[0], positionOverrides: posOverrides,
        });
        toast.success(`Exported to Miro: ${result.shapeCount} shapes, ${result.connectorCount} connectors.`);
      } else {
        const result = await exportFlowsToMiro({
          boardId: miroBoardId.trim(), accessToken: miroAccessToken,
          flows: flowsToExport,
        });
        toast.success(`Exported ${flowsToExport.length} flows: ${result.totalShapeCount} shapes, ${result.totalConnectorCount} connectors.`);
      }
    } catch (error) {
      console.error("Miro export error:", error);
      const status = typeof error === "object" && error && "status" in error
        ? (error as { status: number }).status : 0;
      toast.error(status ? `Miro export failed (${status}).` : "Miro export failed.");
    } finally {
      setBusyMiroExport(false);
    }
  }

  return {
    busyPngExport,
    busyMiroExport,
    miroBoardId,
    setMiroBoardId,
    handleExportJson,
    handleExportAllJson,
    handleExportAllEditorFlows,
    handleExportPng,
    handleImportJson,
    handleExportMiro,
  } as const;
}
