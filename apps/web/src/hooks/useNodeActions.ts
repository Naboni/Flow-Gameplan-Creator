import { useCallback, useEffect, useMemo, useRef } from "react";
import { type Edge, type Node } from "reactflow";
import type { FlowNode, MessageStatus } from "@flow/core";
import type { AppNodeData, AppTab, GeneratedResult, NodeCallbacks } from "../types/flow";
import { storeNodeForEdit, loadSavedNode, clearSavedNode } from "../utils/nodeStore";
import { toast } from "sonner";
import type React from "react";

// Manages node-level actions (preview, edit, delete, status change) and polls
// localStorage for changes saved by detached email-editor windows.
export function useNodeActions(opts: {
  isEditorActive: boolean;
  tab: AppTab;
  genResult: GeneratedResult | null;
  setGenResult: React.Dispatch<React.SetStateAction<GeneratedResult | null>>;
  activeFlowIndex: number;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  setEditorNodes: React.Dispatch<React.SetStateAction<Node<AppNodeData>[]>>;
  setEditorEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  updateEditorNodeData: (nodeId: string, updater: (fn: FlowNode) => FlowNode) => void;
  genBrand: string;
  genUrl: string;
  flowNodes: Node<AppNodeData>[];
}) {
  const {
    isEditorActive, tab, genResult, setGenResult, activeFlowIndex,
    selectedNodeId, setSelectedNodeId, setEditorNodes, setEditorEdges,
    updateEditorNodeData, genBrand, genUrl, flowNodes,
  } = opts;

  // Ref-backed snapshot so callbacks always read the latest flowNodes
  // without requiring them in useCallback deps.
  const flowNodesRef = useRef(flowNodes);
  flowNodesRef.current = flowNodes;

  const handleNodePreview = useCallback((nodeId: string) => {
    const node = flowNodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    storeNodeForEdit({
      nodeId, flowNode: node.data.flowNode,
      brandName: genBrand || genResult?.brandName,
      brandUrl: genUrl,
      brandLogoUrl: genResult?.brandLogoUrl,
      brandColor: genResult?.brandColor,
      timestamp: Date.now(),
    });
    window.open(`/email-preview/${nodeId}`, "_blank");
  }, [genBrand, genUrl, genResult]);

  const handleNodeEdit = useCallback((nodeId: string) => {
    const node = flowNodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    storeNodeForEdit({
      nodeId, flowNode: node.data.flowNode,
      brandName: genBrand || genResult?.brandName,
      brandUrl: genUrl,
      brandLogoUrl: genResult?.brandLogoUrl,
      brandColor: genResult?.brandColor,
      timestamp: Date.now(),
    });
    window.open(`/email-editor/${nodeId}`, "_blank");
  }, [genBrand, genUrl, genResult]);

  const handleNodeDelete = useCallback((nodeId: string) => {
    if (isEditorActive) {
      setEditorNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEditorEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    } else if (tab === "generate" && genResult) {
      setGenResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          flows: prev.flows.map((flow, idx) =>
            idx !== activeFlowIndex ? flow : {
              ...flow,
              nodes: flow.nodes.filter((n) => n.id !== nodeId),
              edges: flow.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
            }
          ),
        };
      });
    }
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    toast("Node deleted.");
  }, [isEditorActive, tab, genResult, activeFlowIndex, selectedNodeId, setSelectedNodeId, setEditorNodes, setEditorEdges, setGenResult]);

  const handleNodeStatusChange = useCallback((nodeId: string, status: MessageStatus) => {
    if (isEditorActive) {
      updateEditorNodeData(nodeId, (fn) => {
        if (fn.type !== "message") return fn;
        return { ...fn, status };
      });
    } else if (tab === "generate" && genResult) {
      setGenResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          flows: prev.flows.map((flow, idx) =>
            idx !== activeFlowIndex ? flow : {
              ...flow,
              nodes: flow.nodes.map((n) =>
                n.id !== nodeId || n.type !== "message" ? n : { ...n, status }
              ),
            }
          ),
        };
      });
    }
  }, [isEditorActive, tab, genResult, activeFlowIndex, updateEditorNodeData, setGenResult]);

  const nodeCallbacks: NodeCallbacks = useMemo(() => ({
    onPreview: handleNodePreview,
    onEdit: handleNodeEdit,
    onDelete: handleNodeDelete,
    onStatusChange: handleNodeStatusChange,
  }), [handleNodePreview, handleNodeEdit, handleNodeDelete, handleNodeStatusChange]);

  // Poll localStorage for edits saved by a detached email-editor window.
  useEffect(() => {
    const canPoll = isEditorActive || (tab === "generate" && !!genResult);
    if (!canPoll) return;
    const interval = setInterval(() => {
      const saved = loadSavedNode();
      if (!saved) return;
      if (!flowNodesRef.current.some((n) => n.id === saved.nodeId)) return;

      if (isEditorActive) {
        updateEditorNodeData(saved.nodeId, () => saved.flowNode);
      } else if (tab === "generate") {
        setGenResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            flows: prev.flows.map((flow, idx) =>
              idx !== activeFlowIndex ? flow : {
                ...flow,
                nodes: flow.nodes.map((n) => n.id === saved.nodeId ? saved.flowNode : n),
              }
            ),
          };
        });
      }
      clearSavedNode();
      toast.success("Email updated from editor.");
    }, 1000);
    return () => clearInterval(interval);
  }, [isEditorActive, tab, genResult, activeFlowIndex, updateEditorNodeData, setGenResult]);

  return { nodeCallbacks } as const;
}
