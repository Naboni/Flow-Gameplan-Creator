import { useState } from "react";
import { type Edge, type Node } from "reactflow";
import { type FlowSpec } from "@flow/core";
import type { AppNodeData, AppTab, NodeKind, TemplateChoice } from "../types/flow";
import type { FlowNode } from "@flow/core";
import { createFlowNode, editorToFlowSpec, getSpecFromChoice, nodeSubtitle, specToRfEdges, specToRfNodes, toRfNode } from "../utils/flowHelpers";
import { toast } from "sonner";

// Manages all editor-tab state and every CRUD operation on the canvas.
// openFlowInEditor lives in App.tsx because it needs computed flowNodes from useFlowCanvas.
export function useEditorFlow(opts: {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  setTab: (tab: AppTab) => void;
}) {
  const { selectedNodeId, selectedEdgeId, setSelectedNodeId, setSelectedEdgeId } = opts;

  const [editorNodes, setEditorNodes] = useState<Node<AppNodeData>[]>([]);
  const [editorEdges, setEditorEdges] = useState<Edge[]>([]);
  const [editorPreset, setEditorPreset] = useState<string>("");
  const [editorFlows, setEditorFlows] = useState<FlowSpec[]>([]);
  const [activeEditorFlowIndex, setActiveEditorFlowIndex] = useState(0);

  const isMultiFlowEditor = editorFlows.length > 1;

  function appendEditorNode(kind: NodeKind, position?: { x: number; y: number }) {
    const fn = createFlowNode(kind);
    setEditorNodes((nds) => [
      ...nds,
      toRfNode(fn, position ?? { x: 200, y: 80 + nds.length * 140 }),
    ]);
    setSelectedNodeId(fn.id);
    toast.success("Node added.");
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    setEditorNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEditorEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    toast("Node removed.");
  }

  function deleteSelectedEdge() {
    if (!selectedEdgeId) return;
    setEditorEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    toast("Edge removed.");
  }

  // Applies updater to the FlowNode inside a canvas node and re-derives display fields.
  function updateEditorNodeData(nodeId: string, updater: (fn: FlowNode) => FlowNode) {
    setEditorNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const updated = updater(n.data.flowNode);
        return {
          ...n,
          data: {
            ...n.data,
            title: "title" in updated ? updated.title : updated.type,
            subtitle: nodeSubtitle(updated),
            flowNode: updated,
          },
        };
      })
    );
  }

  function updateEditorEdgeLabel(edgeId: string, label: string) {
    setEditorEdges((eds) =>
      eds.map((e) => (e.id === edgeId ? { ...e, label: label || undefined } : e))
    );
  }

  // Snapshots current canvas into editorFlows before loading the target flow.
  function switchEditorFlow(targetIndex: number) {
    if (targetIndex === activeEditorFlowIndex) return;
    if (targetIndex < 0 || targetIndex >= editorFlows.length) return;

    const current = editorFlows[activeEditorFlowIndex];
    const snapshot = editorToFlowSpec(editorNodes, editorEdges, {
      id: current.id, name: current.name, channels: current.channels, defaults: current.defaults,
    });
    setEditorFlows((flows) => flows.map((f, i) => (i === activeEditorFlowIndex ? snapshot : f)));

    const target = editorFlows[targetIndex];
    const nodes = specToRfNodes(target);
    setEditorNodes(nodes);
    setEditorEdges(specToRfEdges(target, nodes));
    setActiveEditorFlowIndex(targetIndex);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    toast(`Switched to "${target.name}".`);
  }

  function resetEditorFlow() {
    setEditorNodes([]);
    setEditorEdges([]);
    setEditorFlows([]);
    setActiveEditorFlowIndex(0);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    toast("Editor reset.");
  }

  function loadPresetIntoEditor(choice: TemplateChoice) {
    const spec = getSpecFromChoice(choice);
    const nodes = specToRfNodes(spec);
    setEditorNodes(nodes);
    setEditorEdges(specToRfEdges(spec, nodes));
    setEditorFlows([]);
    setActiveEditorFlowIndex(0);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    toast.success(`Loaded "${spec.name}" preset into editor.`);
  }

  return {
    editorNodes, setEditorNodes,
    editorEdges, setEditorEdges,
    editorPreset, setEditorPreset,
    editorFlows, setEditorFlows,
    activeEditorFlowIndex, setActiveEditorFlowIndex,
    isMultiFlowEditor,
    appendEditorNode,
    deleteSelectedNode,
    deleteSelectedEdge,
    updateEditorNodeData,
    updateEditorEdgeLabel,
    switchEditorFlow,
    resetEditorFlow,
    loadPresetIntoEditor,
  } as const;
}
