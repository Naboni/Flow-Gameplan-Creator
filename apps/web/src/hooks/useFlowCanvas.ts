import { useCallback, useMemo } from "react";
import { type Edge, type Node } from "reactflow";
import { type FlowSpec, type FlowNode } from "@flow/core";
import { buildLayout } from "@flow/layout";
import type { AppNodeData, AppTab, NodeCallbacks } from "../types/flow";
import { nodeSubtitle, specToRfEdges, specToRfNodes } from "../utils/flowHelpers";
import { rfContainerWidth } from "../constants";
import { useAutoPosition } from "./useAutoPosition";
import type React from "react";

// Derives ReactFlow nodes/edges from whichever flow is active, runs auto-positioning,
// and injects node callbacks. Acts as the bridge between raw flow specs and
// what ReactFlow actually renders.
export function useFlowCanvas(opts: {
  activeGenFlow: FlowSpec | null;
  isEditorActive: boolean;
  activeFlowIndex: number;
  tab: AppTab;
  editorNodes: Node<AppNodeData>[];
  editorEdges: Edge[];
  correctedGenCacheRef: React.MutableRefObject<Map<number, Node<AppNodeData>[]>>;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  nodeCallbacksRef: React.MutableRefObject<NodeCallbacks | null>;
  setEditorNodes: React.Dispatch<React.SetStateAction<Node<AppNodeData>[]>>;
}) {
  const {
    activeGenFlow, isEditorActive, activeFlowIndex, tab,
    editorNodes, editorEdges, correctedGenCacheRef,
    selectedNodeId, selectedEdgeId, nodeCallbacksRef, setEditorNodes,
  } = opts;

  // Build positioned ReactFlow nodes from the active generated flow.
  const genNodes = useMemo<Node<AppNodeData>[]>(() => {
    if (!activeGenFlow) return [];
    try {
      const layout = buildLayout(activeGenFlow, {});
      return layout.nodes.map((ln: any) => {
        const raw = activeGenFlow.nodes.find((n: any) => n.id === ln.id);
        const flowNode = raw ?? ({ id: ln.id, type: "outcome", title: ln.title, result: "" } as FlowNode);
        return {
          id: ln.id, type: "flowNode",
          position: { x: ln.x, y: ln.y },
          draggable: false,
          style: { width: rfContainerWidth(ln.type) },
          data: {
            title: ln.title,
            subtitle: raw ? nodeSubtitle(raw as FlowNode) : ln.type,
            nodeType: ln.type,
            flowNode: flowNode as FlowNode,
          },
        };
      });
    } catch (err) {
      console.error("Layout failed, using grid:", err);
      return specToRfNodes(activeGenFlow);
    }
  }, [activeGenFlow]);

  const genEdges = useMemo<Edge[]>(() => {
    if (!activeGenFlow) return [];
    return specToRfEdges(activeGenFlow, genNodes);
  }, [activeGenFlow, genNodes]);

  // Use the cached corrected nodes if IDs still match, otherwise use fresh genNodes.
  const cachedCorrected = correctedGenCacheRef.current.get(activeFlowIndex);
  const useGenCorrected =
    !!cachedCorrected &&
    cachedCorrected.map((n) => n.id).join(",") === genNodes.map((n) => n.id).join(",");

  const baseNodes = isEditorActive ? editorNodes : (useGenCorrected ? cachedCorrected : genNodes);
  const baseEdges = isEditorActive ? editorEdges : genEdges;
  const isCanvasActive = isEditorActive || (tab === "generate" && !!activeGenFlow);

  const handleAutoReposition = useCallback(
    (repositioned: Node<AppNodeData>[]) => {
      if (isEditorActive) {
        setEditorNodes(repositioned);
      } else {
        correctedGenCacheRef.current.set(activeFlowIndex, repositioned);
      }
    },
    [isEditorActive, activeFlowIndex, setEditorNodes, correctedGenCacheRef]
  );

  const { nodes: autoNodes, onNodesChange: autoNodesChange, didReposition } = useAutoPosition(
    baseNodes, baseEdges, isCanvasActive, handleAutoReposition
  );

  // Inject node callbacks into each node's data so FlowCanvasNode can call them.
  const flowNodes = useMemo(() => {
    if (!isCanvasActive || !nodeCallbacksRef.current) return autoNodes;
    const cbs = nodeCallbacksRef.current;
    return autoNodes.map((n) => ({ ...n, data: { ...n.data, callbacks: cbs } }));
  }, [autoNodes, isCanvasActive, nodeCallbacksRef]);

  const flowEdges = baseEdges;

  const selectedFlowNode: FlowNode | null = useMemo(() => {
    if (!selectedNodeId) return null;
    return flowNodes.find((n) => n.id === selectedNodeId)?.data.flowNode ?? null;
  }, [selectedNodeId, flowNodes]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    const e = flowEdges.find((e) => e.id === selectedEdgeId);
    if (!e) return null;
    return { id: e.id, label: typeof e.label === "string" ? e.label : undefined };
  }, [selectedEdgeId, flowEdges]);

  const hasContent = isEditorActive
    ? editorNodes.length > 0
    : tab === "generate" && !!activeGenFlow;

  return {
    flowNodes,
    flowEdges,
    autoNodesChange,
    didReposition,
    isCanvasActive,
    selectedFlowNode,
    selectedEdge,
    hasContent,
  } as const;
}
