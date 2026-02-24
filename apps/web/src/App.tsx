import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import ReactFlow, {
  addEdge as rfAddEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import { parseFlowSpecSafe, validateFlowGraph, FLOW_TYPE_LABELS, type FlowNode, type FlowSpec, type FlowType, type MessageStatus } from "@flow/core";
import { buildLayout } from "@flow/layout";
import { exportFlowToMiro, exportFlowsToMiro } from "@flow/miro";
import { toPng } from "html-to-image";
import { Pencil, Download, RotateCcw, FileJson, Image, Upload, Send, ClipboardList, CheckCircle2, Info, Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "./components/ThemeProvider";
import { toast, Toaster } from "sonner";

import type { AppNodeData, AppTab, BrandProfile, BrandQuestionnaire as BrandQuestionnaireData, GeneratedResult, NodeCallbacks, NodeKind, PlanKey, TemplateChoice } from "./types/flow";
import { storeNodeForEdit, loadSavedNode, clearSavedNode } from "./utils/nodeStore";
import { API_BASE, EDGE_STYLE, PLAN_OPTIONS, VIEWER_CHOICES, rfContainerWidth } from "./constants";
import { FlowCanvasNode } from "./components/FlowCanvasNode";
import { SmartEdge } from "./components/SmartEdge";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LibraryView, FLOW_TYPES } from "./components/LibraryView";
import { BrandQuestionnaire } from "./components/BrandQuestionnaire";
import { ChatPanel, type ChatMessage } from "./components/ChatPanel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  createFlowNode,
  downloadBlob,
  editorToFlowSpec,
  getSpecFromChoice,
  nodeSubtitle,
  specToRfEdges,
  specToRfNodes,
  toRfNode,
} from "./utils/flowHelpers";
import { useAutoPosition } from "./hooks/useAutoPosition";

function asPositiveInt(value: unknown, fallback = 1): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.round(Math.abs(n)));
}

function normalizeFlowSpecCandidate(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const spec = structuredClone(input) as Record<string, unknown>;

  if (spec.defaults && typeof spec.defaults === "object") {
    const defaults = spec.defaults as Record<string, unknown>;
    if (defaults.delay && typeof defaults.delay === "object") {
      const delay = defaults.delay as Record<string, unknown>;
      delay.value = asPositiveInt(delay.value, 2);
      if (typeof delay.unit !== "string" || !["minutes", "hours", "days"].includes(delay.unit)) {
        delay.unit = "days";
      }
      defaults.delay = delay;
    }
    spec.defaults = defaults;
  }

  if (Array.isArray(spec.nodes)) {
    spec.nodes = spec.nodes.map((node) => {
      if (!node || typeof node !== "object") return node;
      const n = node as Record<string, unknown>;
      if (n.type === "wait") {
        const duration = (n.duration && typeof n.duration === "object")
          ? (n.duration as Record<string, unknown>)
          : {};
        duration.value = asPositiveInt(duration.value, 1);
        if (typeof duration.unit !== "string" || !["minutes", "hours", "days"].includes(duration.unit)) {
          duration.unit = "days";
        }
        n.duration = duration;
      }
      if (n.type === "split") {
        if (Array.isArray(n.labels)) {
          const labels = n.labels.filter((l) => typeof l === "string" && l.trim().length > 0) as string[];
          n.labels = labels.length >= 2 ? labels : ["Yes", "No"];
        } else if (n.labels && typeof n.labels === "object") {
          const obj = n.labels as Record<string, unknown>;
          const yes = typeof obj.yes === "string" && obj.yes.trim() ? obj.yes : "Yes";
          const no = typeof obj.no === "string" && obj.no.trim() ? obj.no : "No";
          n.labels = [yes, no];
        } else {
          n.labels = ["Yes", "No"];
        }
      }
      return n;
    });
  }

  return spec;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="ml-auto p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

function AppInner() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<AppTab>("generate");

  /* generate tab */
  const [genPlan, setGenPlan] = useState<PlanKey>("custom");
  const [genUrl, setGenUrl] = useState("");
  const [genBrand, setGenBrand] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [questionnaireData, setQuestionnaireData] = useState<BrandQuestionnaireData>({});
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [genStep, setGenStep] = useState<"form" | "analyzing" | "generating" | "done">("form");
  const [genResult, setGenResult] = useState<GeneratedResult | null>(null);
  const [genError, setGenError] = useState("");
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);
  const [customFlowText, setCustomFlowText] = useState("");
  const [flowSpecModalOpen, setFlowSpecModalOpen] = useState(false);
  const [flowSpecInfoOpen, setFlowSpecInfoOpen] = useState(false);

  /* chat flow builder */
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  /* library tab */
  const [libraryActiveType, setLibraryActiveType] = useState<FlowType>("email-welcome");

  /* editor tab */
  const [editorNodes, setEditorNodes] = useState<Node<AppNodeData>[]>([]);
  const [editorEdges, setEditorEdges] = useState<Edge[]>([]);
  const [editorPreset, setEditorPreset] = useState<string>("");
  const [editorFlows, setEditorFlows] = useState<FlowSpec[]>([]);
  const [activeEditorFlowIndex, setActiveEditorFlowIndex] = useState(0);

  /* shared */
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  /* notice replaced by sonner toast */
  const [busyPngExport, setBusyPngExport] = useState(false);
  const [busyMiroExport, setBusyMiroExport] = useState(false);
  const [miroBoardId, setMiroBoardId] = useState("");

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const canvasCaptureRef = useRef<HTMLDivElement | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const nodeTypes = useMemo(() => ({ flowNode: FlowCanvasNode }), []);
  const edgeTypes = useMemo(() => ({ smartEdge: SmartEdge }), []);

  const questionnaireAnsweredCount = [
    questionnaireData.discountNotes?.trim(),
    questionnaireData.specialInstructions?.trim(),
  ].filter(Boolean).length;

  const hasFilloutData = questionnaireData.filloutResponses && Object.keys(questionnaireData.filloutResponses).length > 0;

  /* ── computed specs and nodes ── */

  const activeGenFlow = useMemo(() => {
    if (tab === "generate" && genResult && genResult.flows.length > 0) {
      return genResult.flows[activeFlowIndex] ?? genResult.flows[0];
    }
    return null;
  }, [tab, genResult, activeFlowIndex]);

  const genNodes = useMemo<Node<AppNodeData>[]>(() => {
    if (!activeGenFlow) return [];
    try {
      const layout = buildLayout(activeGenFlow as FlowSpec, {});
      return layout.nodes.map((ln) => {
        const raw = activeGenFlow.nodes.find((n: any) => n.id === ln.id);
        const flowNode = raw ?? ({ id: ln.id, type: "outcome", title: ln.title, result: "" } as FlowNode);
        return {
          id: ln.id, type: "flowNode", position: { x: ln.x, y: ln.y }, draggable: false,
          style: { width: rfContainerWidth(ln.type) },
          data: { title: ln.title, subtitle: raw ? nodeSubtitle(raw as FlowNode) : ln.type, nodeType: ln.type, flowNode: flowNode as FlowNode }
        };
      });
    } catch (err) {
      console.error("Layout failed for generated flow, using grid:", err);
      return specToRfNodes(activeGenFlow as FlowSpec);
    }
  }, [activeGenFlow]);

  const genEdges = useMemo<Edge[]>(() => {
    if (!activeGenFlow) return [];
    return specToRfEdges(activeGenFlow as FlowSpec, genNodes);
  }, [activeGenFlow, genNodes]);

  const isEditorActive = tab === "editor";
  const isMultiFlowEditor = editorFlows.length > 1;

  /* Corrected gen nodes: caches measured-height repositioned versions of
     genNodes per flow index so the Generate tab gets uniform arrow gaps
     even when switching between flows. */
  const correctedGenCacheRef = useRef<Map<number, Node<AppNodeData>[]>>(new Map());
  const cachedCorrected = correctedGenCacheRef.current.get(activeFlowIndex);
  const cachedKey = cachedCorrected?.map(n => n.id).join(",") ?? "";
  const genKey = genNodes.map(n => n.id).join(",");
  const useGenCorrected = cachedKey === genKey && !!cachedCorrected;

  /* Auto-position: measures actual node heights and corrects Y spacing.
     Works for both Generate (read-only) and Editor (editable) canvases.
     After adjustment, the hook defers to layoutNodes (= editorNodes for editor,
     correctedGenNodes for generate). */
  const baseNodes = isEditorActive ? editorNodes : (useGenCorrected ? cachedCorrected : genNodes);
  const baseEdges = isEditorActive ? editorEdges : genEdges;
  const isCanvasActive = isEditorActive || (tab === "generate" && !!activeGenFlow);

  const handleAutoReposition = useCallback((repositioned: Node<AppNodeData>[]) => {
    if (isEditorActive) {
      setEditorNodes(repositioned);
    } else {
      correctedGenCacheRef.current.set(activeFlowIndex, repositioned);
    }
  }, [isEditorActive, activeFlowIndex]);

  const { nodes: autoNodes, onNodesChange: autoNodesChange, didReposition } = useAutoPosition(
    baseNodes, baseEdges, isCanvasActive, handleAutoReposition
  );

  const flowEdges = baseEdges;
  const nodeCallbacksRef = useRef<NodeCallbacks | null>(null);

  const showNodeMenus = isCanvasActive;
  const flowNodes = useMemo(() => {
    if (!showNodeMenus || !nodeCallbacksRef.current) return autoNodes;
    const cbs = nodeCallbacksRef.current;
    return autoNodes.map(n => ({ ...n, data: { ...n.data, callbacks: cbs } }));
  }, [autoNodes, showNodeMenus]);

  /* Re-fit view after auto-position correction */
  useEffect(() => {
    if (didReposition && reactFlowRef.current) {
      requestAnimationFrame(() => reactFlowRef.current?.fitView({ duration: 200 }));
    }
  }, [didReposition]);

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

  /* ── editor handlers ── */

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (isEditorActive) {
      /* Filter out 'remove' changes — React Flow fires these during brief
         state desyncs between editorNodes and the auto-position hook.
         Node deletion is handled explicitly via our delete functions. */
      const safe = changes.filter(c => c.type !== "remove");
      if (safe.length > 0) setEditorNodes((nds) => applyNodeChanges(safe, nds));
    }
    autoNodesChange(changes);
  }, [isEditorActive, autoNodesChange]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (!isEditorActive) return;
    setEditorEdges((eds) => applyEdgeChanges(changes, eds));
  }, [isEditorActive]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!isEditorActive || !connection.source || !connection.target) return;
    setEditorEdges((eds) => rfAddEdge({ ...connection, ...EDGE_STYLE }, eds));
    toast.success("Connected nodes.");
  }, [isEditorActive]);

  function appendEditorNode(kind: NodeKind, position?: { x: number; y: number }) {
    if (!isEditorActive) return;
    const fn = createFlowNode(kind);
    setEditorNodes((nds) => [...nds, toRfNode(fn, position ?? { x: 200, y: 80 + editorNodes.length * 140 })]);
    setSelectedNodeId(fn.id);
    toast.success("Node added.");
  }

  function deleteSelectedNode() {
    if (!isEditorActive || !selectedNodeId) return;
    setEditorNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEditorEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    toast("Node removed.");
  }

  function deleteSelectedEdge() {
    if (!isEditorActive || !selectedEdgeId) return;
    setEditorEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    toast("Edge removed.");
  }

  function updateEditorNodeData(nodeId: string, updater: (fn: FlowNode) => FlowNode) {
    setEditorNodes((nds) => nds.map((n) => {
      if (n.id !== nodeId) return n;
      const updated = updater(n.data.flowNode);
      return { ...n, data: { ...n.data, title: "title" in updated ? updated.title : updated.type, subtitle: nodeSubtitle(updated), flowNode: updated } };
    }));
  }

  function updateEditorEdgeLabel(edgeId: string, label: string) {
    setEditorEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, label: label || undefined } : e)));
  }

  /* ── email node actions (preview / edit / delete / status) ── */

  const flowNodesRef = useRef(flowNodes);
  flowNodesRef.current = flowNodes;

  const handleNodePreview = useCallback((nodeId: string) => {
    const node = flowNodesRef.current.find(n => n.id === nodeId);
    if (!node) return;
    storeNodeForEdit({
      nodeId,
      flowNode: node.data.flowNode,
      brandName: genBrand || genResult?.brandName,
      brandUrl: genUrl,
      brandLogoUrl: genResult?.brandLogoUrl,
      brandColor: genResult?.brandColor,
      timestamp: Date.now(),
    });
    window.open(`/email-preview/${nodeId}`, "_blank");
  }, [genBrand, genUrl, genResult]);

  const handleNodeEdit = useCallback((nodeId: string) => {
    const node = flowNodesRef.current.find(n => n.id === nodeId);
    if (!node) return;
    storeNodeForEdit({
      nodeId,
      flowNode: node.data.flowNode,
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
      setGenResult(prev => {
        if (!prev) return prev;
        const flows = prev.flows.map((flow, idx) => {
          if (idx !== activeFlowIndex) return flow;
          return {
            ...flow,
            nodes: flow.nodes.filter(n => n.id !== nodeId),
            edges: flow.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
          };
        });
        return { ...prev, flows };
      });
    }
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    toast("Node deleted.");
  }, [isEditorActive, tab, genResult, activeFlowIndex, selectedNodeId]);

  const handleNodeStatusChange = useCallback((nodeId: string, status: MessageStatus) => {
    if (isEditorActive) {
      updateEditorNodeData(nodeId, (fn) => {
        if (fn.type !== "message") return fn;
        return { ...fn, status };
      });
    } else if (tab === "generate" && genResult) {
      setGenResult(prev => {
        if (!prev) return prev;
        const flows = prev.flows.map((flow, idx) => {
          if (idx !== activeFlowIndex) return flow;
          return {
            ...flow,
            nodes: flow.nodes.map(n => {
              if (n.id !== nodeId || n.type !== "message") return n;
              return { ...n, status };
            }),
          };
        });
        return { ...prev, flows };
      });
    }
  }, [isEditorActive, tab, genResult, activeFlowIndex]);

  const nodeCallbacks: NodeCallbacks = useMemo(() => ({
    onPreview: handleNodePreview,
    onEdit: handleNodeEdit,
    onDelete: handleNodeDelete,
    onStatusChange: handleNodeStatusChange,
  }), [handleNodePreview, handleNodeEdit, handleNodeDelete, handleNodeStatusChange]);
  nodeCallbacksRef.current = nodeCallbacks;

  /* Poll for saves from email editor windows */
  useEffect(() => {
    const canPoll = isEditorActive || (tab === "generate" && !!genResult);
    if (!canPoll) return;
    const interval = setInterval(() => {
      const saved = loadSavedNode();
      if (!saved) return;
      const matchesAny = flowNodesRef.current.some(n => n.id === saved.nodeId);
      if (!matchesAny) return;

      if (isEditorActive) {
        updateEditorNodeData(saved.nodeId, () => saved.flowNode);
      } else if (tab === "generate") {
        setGenResult(prev => {
          if (!prev) return prev;
          const flows = prev.flows.map((flow, idx) => {
            if (idx !== activeFlowIndex) return flow;
            return {
              ...flow,
              nodes: flow.nodes.map(n => n.id === saved.nodeId ? saved.flowNode : n),
            };
          });
          return { ...prev, flows };
        });
      }
      clearSavedNode();
      toast.success("Email updated from editor.");
    }, 1000);
    return () => clearInterval(interval);
  }, [isEditorActive, tab, genResult, activeFlowIndex]);

  function switchEditorFlow(targetIndex: number) {
    if (targetIndex === activeEditorFlowIndex) return;
    if (targetIndex < 0 || targetIndex >= editorFlows.length) return;

    /* Save current editor state back into editorFlows */
    const current = editorFlows[activeEditorFlowIndex];
    const snapshot = editorToFlowSpec(editorNodes, editorEdges, {
      id: current.id, name: current.name, channels: current.channels, defaults: current.defaults,
    });
    setEditorFlows((flows) => flows.map((f, i) => (i === activeEditorFlowIndex ? snapshot : f)));

    /* Load the target flow */
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
    setEditorNodes([]); setEditorEdges([]);
    setEditorFlows([]); setActiveEditorFlowIndex(0);
    setSelectedNodeId(null); setSelectedEdgeId(null);
    toast("Editor reset.");
  }

  function loadPresetIntoEditor(choice: TemplateChoice) {
    const spec = getSpecFromChoice(choice);
    const nodes = specToRfNodes(spec);
    setEditorNodes(nodes);
    setEditorEdges(specToRfEdges(spec, nodes));
    setEditorFlows([]); setActiveEditorFlowIndex(0);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    toast.success(`Loaded "${spec.name}" preset into editor.`);
  }

  function openFlowInEditor(spec: FlowSpec) {
    /* Use current auto-positioned nodes if they match the spec
       (avoids recomputing from scratch with estimated heights). */
    const currentIds = new Set(flowNodes.map((n) => n.id));
    const specIds = new Set(spec.nodes.map((n) => n.id));
    const match = specIds.size > 0 && [...specIds].every((id) => currentIds.has(id));

    if (match) {
      setEditorNodes(flowNodes.map((n) => ({ ...n, draggable: undefined })));
      setEditorEdges([...flowEdges]);
    } else {
      const nodes = specToRfNodes(spec);
      setEditorNodes(nodes);
      setEditorEdges(specToRfEdges(spec, nodes));
    }
    setEditorFlows([]); setActiveEditorFlowIndex(0);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setTab("editor");
    toast.success(`Loaded "${spec.name}" into editor.`);
  }

  /* ── generate flow gameplan ── */


  async function handleGenerate() {
    if (!genUrl.trim() || !genBrand.trim()) {
      setGenError("Please enter a website URL and brand name.");
      return;
    }
    if (genPlan === "custom" && !customFlowText.trim()) {
      setGenError("Please describe your flows.");
      return;
    }
    setGenBusy(true);
    setGenError("");
    setGenStep("analyzing");

    try {
      const hasQuestionnaire = questionnaireAnsweredCount > 0 || hasFilloutData;
      const analyzeRes = await fetch(`${API_BASE}/api/analyze-brand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: genUrl.trim(),
          brandName: genBrand.trim(),
          ...(hasQuestionnaire ? { questionnaire: questionnaireData } : {})
        })
      });
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({ error: "Brand analysis failed" }));
        throw new Error(err.error || "Brand analysis failed");
      }
      const { profile } = (await analyzeRes.json()) as { profile: BrandProfile };

      setGenStep("generating");
      const genBody = genPlan === "custom"
        ? { customFlowText: customFlowText.trim(), brandProfile: profile }
        : { planKey: genPlan, brandProfile: profile };

      const generateRes = await fetch(`${API_BASE}/api/generate-flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(genBody)
      });
      if (!generateRes.ok) {
        const err = await generateRes.json().catch(() => ({ error: "Flow generation failed" }));
        throw new Error(err.error || "Flow generation failed");
      }
      const result = (await generateRes.json()) as GeneratedResult;
      result.brandLogoUrl = profile.brandLogoUrl;
      result.brandColor = profile.brandColor;

      if (!result.flows || result.flows.length === 0) {
        throw new Error("No flows were generated.");
      }

      for (const flow of result.flows) {
        if (!Array.isArray(flow.nodes)) flow.nodes = [];
        if (!Array.isArray(flow.edges)) flow.edges = [];
      }

      correctedGenCacheRef.current.clear();
      setGenResult(result);
      setActiveFlowIndex(0);
      setGenStep("done");
    } catch (error) {
      setGenError(error instanceof Error ? error.message : "Something went wrong.");
      setGenStep("form");
    } finally {
      setGenBusy(false);
    }
  }

  /* ── chat flow builder ── */

  async function handleChatSend(message: string) {
    const userMsg: ChatMessage = { role: "user", content: message };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const currentFlow = activeGenFlow ?? undefined;
      const brandProfile = genBrand ? { brandName: genBrand } : undefined;
      const res = await fetch(`${API_BASE}/api/chat-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: chatMessages.slice(-6),
          brandProfile,
          currentFlowSpec: currentFlow
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Chat request failed" }));
        throw new Error(err.error || "Chat request failed");
      }

      const data = await res.json() as { reply: string; flowSpec?: unknown; action: string };
      setChatMessages(prev => [...prev, { role: "assistant", content: data.reply }]);

      if (data.flowSpec) {
        const normalizedSpec = normalizeFlowSpecCandidate(data.flowSpec);

        // Graph structural validation (safety net — backend already retries)
        const graphResult = validateFlowGraph(normalizedSpec);
        if (!graphResult.valid) {
          const issues = graphResult.errors.map(e => e.message).join("; ");
          setChatMessages(prev => [...prev, { role: "assistant", content: `The flow has structural issues: ${issues}. Say "fix" or "regenerate" to try again.` }]);
          return;
        }

        const parsed = parseFlowSpecSafe(normalizedSpec);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const path = issue?.path?.length ? ` at ${issue.path.join(".")}` : "";
          const msg = issue?.message ?? "Invalid flow specification from AI.";
          setChatMessages(prev => [...prev, { role: "assistant", content: `Flow validation failed${path}: ${msg}. Say "regenerate" to try again.` }]);
          return;
        }
        const spec = parsed.data;

        const result: GeneratedResult = {
          planKey: "chat",
          planName: "AI Chat Flow",
          brandName: genBrand || "Custom",
          brandLogoUrl: genResult?.brandLogoUrl,
          brandColor: genResult?.brandColor,
          flows: [spec]
        };
        correctedGenCacheRef.current.clear();
        setGenResult(result);
        setActiveFlowIndex(0);
        setGenStep("done");
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Something went wrong.";
      setChatMessages(prev => [...prev, { role: "assistant", content: `Error: ${errMsg}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  /* ── export / import ── */

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
    if (tab === "generate" && activeGenFlow) return activeGenFlow as FlowSpec;
    return editorToFlowSpec(editorNodes, editorEdges);
  }

  function handleExportJson() {
    const spec = getExportSpec();
    downloadBlob(new Blob([JSON.stringify(spec, null, 2)], { type: "application/json;charset=utf-8" }), `${spec.id}.json`);
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
    /* Snapshot current editor state into the flows array before exporting */
    const current = editorFlows[activeEditorFlowIndex];
    const allFlows = editorFlows.map((flow, idx) =>
      idx === activeEditorFlowIndex
        ? editorToFlowSpec(editorNodes, editorEdges, { id: current.id, name: current.name, channels: current.channels, defaults: current.defaults })
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
      const dataUrl = await toPng(canvasCaptureRef.current, { cacheBust: true, backgroundColor: theme === "dark" ? "#111114" : "#f8fafc", pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${getExportSpec().id}.png`;
      a.click();
      toast.success("Exported PNG.");
    } catch { toast.error("PNG export failed."); }
    finally { setBusyPngExport(false); }
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);

      const items: unknown[] = Array.isArray(raw) ? raw : [raw];

      /* Validate and parse every flow in the file */
      const specs: FlowSpec[] = [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) continue;

        const normalized = normalizeFlowSpecCandidate(obj);
        const result = parseFlowSpecSafe(normalized);
        specs.push(result.success ? result.data : normalized as FlowSpec);
      }

      if (specs.length === 0) {
        toast.error("Invalid flow JSON — no valid flows found.");
        return;
      }

      setSelectedNodeId(null);
      setSelectedEdgeId(null);

      /* Load first flow into editor canvas */
      const nodes = specToRfNodes(specs[0]);
      setEditorNodes(nodes);
      setEditorEdges(specToRfEdges(specs[0], nodes));

      if (specs.length === 1) {
        /* Single flow → clear multi-flow state */
        setEditorFlows([]);
        setActiveEditorFlowIndex(0);
        toast.success("Imported JSON.");
      } else {
        /* Multiple flows → store all and show flow selector in editor sidebar */
        setEditorFlows(specs);
        setActiveEditorFlowIndex(0);
        toast.success(`Imported ${specs.length} flows.`);
      }
    } catch (err) {
      console.error("Import failed:", err);
      toast.error("Invalid JSON file.");
    }
    finally { event.target.value = ""; }
  }

  function getFlowsForMiroExport(): FlowSpec[] {
    /* Generate tab: export all generated flows */
    if (tab === "generate" && genResult && genResult.flows.length > 0) {
      return genResult.flows;
    }
    /* Editor tab with multi-flow: snapshot current + return all */
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
    /* Default: single active flow */
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
        /* Single flow: existing behavior with canvas position overrides */
        const posOverrides: Record<string, { x: number; y: number }> = {};
        for (const n of flowNodes) posOverrides[n.id] = n.position;
        const result = await exportFlowToMiro({
          boardId: miroBoardId.trim(), accessToken: miroAccessToken,
          flowSpec: flowsToExport[0], positionOverrides: posOverrides,
        });
        toast.success(`Exported to Miro: ${result.shapeCount} shapes, ${result.connectorCount} connectors.`);
      } else {
        /* Multi-flow: batch export side by side with titles */
        const result = await exportFlowsToMiro({
          boardId: miroBoardId.trim(), accessToken: miroAccessToken,
          flows: flowsToExport,
        });
        toast.success(
          `Exported ${flowsToExport.length} flows to Miro: ${result.totalShapeCount} shapes, ${result.totalConnectorCount} connectors.`
        );
      }
    } catch (error) {
      console.error("Miro export error:", error);
      const status = typeof error === "object" && error && "status" in error ? (error as { status: number }).status : 0;
      toast.error(status ? `Miro export failed (${status}). Check console for details.` : "Miro export failed.");
    } finally { setBusyMiroExport(false); }
  }

  function switchTab(next: AppTab) {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setTab(next);
  }

  /* ── render ── */

  const TAB_ITEMS: { value: AppTab; label: string }[] = [
    { value: "generate", label: "Generate" },
    { value: "library", label: "Library" },
    { value: "editor", label: "Editor" },
  ];

  return (
    <ReactFlowProvider>
      <div className="flex h-screen overflow-hidden bg-background">
          {/* ── sidebar ── */}
          <aside className="w-[290px] flex-shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col overflow-y-auto">
            {/* sidebar logo header — height matches navbar exactly */}
            <div className="flex items-center px-5 h-[52px] border-b border-sidebar-border shrink-0">
              <span className="text-base font-bold text-foreground tracking-tight">Flow Gameplan Creator</span>
            </div>
            <div className="flex-1 px-3 py-4 flex flex-col gap-4">
              {/* library sidebar */}
              {tab === "library" && (
                <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-1">
                  <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-2 pb-1.5">Flow Types</p>
                  {FLOW_TYPES.map((ft) => (
                    <button
                      key={ft}
                      type="button"
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] transition-colors text-left ${
                        ft === libraryActiveType
                          ? "bg-sidebar-item-active-bg text-primary font-semibold shadow-sm"
                          : "text-sidebar-foreground hover:bg-sidebar-item-hover font-medium"
                      }`}
                      onClick={() => setLibraryActiveType(ft)}
                    >
                      <span className="truncate">{FLOW_TYPE_LABELS[ft]}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* generate sidebar */}
              {tab === "generate" && (
                genStep === "done" && genResult ? (
                  <div className="flex flex-col gap-4">
                    {/* Flow list card */}
                    <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-2">
                      <div className="px-1">
                        <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider">Generated Flows</p>
                        <p className="text-[13px] font-medium text-sidebar-muted mt-0.5">{genResult.brandName} · {genResult.flows.length} flows</p>
                      </div>
                      <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
                        {genResult.flows.map((flow, idx) => (
                          <button
                            key={flow.id}
                            type="button"
                            className={`text-left px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                              idx === activeFlowIndex
                                ? "bg-sidebar-item-active-bg text-primary font-semibold shadow-sm border border-sidebar-item-active-border"
                                : "text-sidebar-foreground hover:bg-sidebar-item-hover font-medium border border-transparent"
                            }`}
                            onClick={() => setActiveFlowIndex(idx)}
                          >
                            <span className="block truncate">{flow.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Actions card */}
                    <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-2">
                      <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">Actions</p>
                      <Button size="sm" onClick={() => openFlowInEditor(genResult.flows[activeFlowIndex])}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        Edit in Editor
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleExportAllJson}>
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Export All (JSON)
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { correctedGenCacheRef.current.clear(); setGenStep("form"); setGenResult(null); }}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        New Generation
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Plan selection card */}
                    <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-4 flex flex-col gap-3">
                      <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider">Configuration</p>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="gen-plan" className="text-[13px] font-medium text-sidebar-foreground">Plan</Label>
                        <select
                          id="gen-plan"
                          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          value={genPlan}
                          onChange={(e) => setGenPlan(e.target.value as PlanKey)}
                          disabled={genBusy}
                        >
                          {PLAN_OPTIONS.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                        <p className="text-xs text-sidebar-muted">{PLAN_OPTIONS.find((p) => p.value === genPlan)?.desc}</p>
                      </div>

                      {genPlan === "custom" && (
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-[13px] font-medium text-sidebar-foreground">Flow Specification</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setFlowSpecModalOpen(true)}
                            disabled={genBusy}
                            className="justify-start"
                          >
                            <ClipboardList className="h-4 w-4 mr-2 shrink-0" />
                            {customFlowText.trim()
                              ? `${(customFlowText.match(/^\s*\d+[\.\)]/gm) || customFlowText.trim().split("\n").filter(Boolean)).length} flow(s) described`
                              : "Describe flows"}
                          </Button>
                          <p className="text-xs text-sidebar-muted">Describe your flows in natural language.</p>
                        </div>
                      )}
                    </div>

                    {/* Brand details card */}
                    <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-4 flex flex-col gap-3">
                      <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider">Brand</p>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="gen-url" className="text-[13px] font-medium text-sidebar-foreground">Client website URL</Label>
                        <Input id="gen-url" type="url" placeholder="https://example.com" value={genUrl} onChange={(e) => setGenUrl(e.target.value)} disabled={genBusy} />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="gen-brand" className="text-[13px] font-medium text-sidebar-foreground">Brand name</Label>
                        <Input id="gen-brand" type="text" placeholder="Brand Name" value={genBrand} onChange={(e) => setGenBrand(e.target.value)} disabled={genBusy} />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[13px] font-medium text-sidebar-foreground">Brand Details</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start"
                          onClick={() => setQuestionnaireOpen(true)}
                          disabled={genBusy}
                        >
                          {questionnaireAnsweredCount > 0 || hasFilloutData ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 mr-1.5 text-green-600" />
                              <span className="text-green-700">
                                {questionnaireAnsweredCount}/2{hasFilloutData ? " + Fillout" : ""}
                              </span>
                            </>
                          ) : (
                            <>
                              <ClipboardList className="w-4 h-4 mr-1.5" />
                              Brand details
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-sidebar-muted">Discount info & special instructions for the AI.</p>
                      </div>
                    </div>

                    <Button className="w-full" onClick={handleGenerate} disabled={genBusy}>
                      {genBusy
                        ? genStep === "analyzing" ? "Analyzing brand..." : "Generating flows..."
                        : <>Generate Gameplan</>
                      }
                    </Button>

                    {genError && <p className="text-[13px] font-medium text-destructive">{genError}</p>}
                  </div>
                )
              )}

              {/* editor sidebar */}
              {tab === "editor" && (
                <div className="flex flex-col gap-4">
                  {/* ── Flow Selector card ── */}
                  {isMultiFlowEditor && (
                    <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-2">
                      <div className="flex items-baseline justify-between px-1">
                        <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider">Flows</p>
                        <span className="text-[11px] text-sidebar-muted font-medium">{editorFlows.length} imported</span>
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
                            onClick={() => switchEditorFlow(idx)}
                          >
                            <span className="block truncate">{flow.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Preset card ── */}
                  <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">Preset</p>
                    <select
                      id="editor-preset"
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-[13px] text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={editorPreset}
                      onChange={(e) => {
                        const val = e.target.value as TemplateChoice;
                        setEditorPreset(val);
                        if (val) loadPresetIntoEditor(val);
                      }}
                    >
                      <option value="">— Select —</option>
                      {VIEWER_CHOICES.filter(c => c.value !== "custom").map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* ── Add Nodes card ── */}
                  <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">Add Nodes</p>
                    {([
                      { label: "Actions", kinds: ["trigger", "email", "sms", "outcome"] as NodeKind[] },
                      { label: "Timing", kinds: ["wait"] as NodeKind[] },
                      { label: "Logic", kinds: ["split", "profileFilter", "merge"] as NodeKind[] },
                    ]).map((category) => (
                      <div key={category.label}>
                        <p className="text-[11px] font-medium text-sidebar-muted uppercase tracking-wide mb-1.5 px-1">{category.label}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {category.kinds.map((kind) => {
                            const displayLabel = kind === "profileFilter" ? "Filter" : kind.charAt(0).toUpperCase() + kind.slice(1);
                            return (
                              <button key={kind} type="button" draggable
                                onDragStart={(e) => { e.dataTransfer.setData("application/flow-node-kind", kind); e.dataTransfer.effectAllowed = "move"; }}
                                onClick={() => appendEditorNode(kind)}
                                className="h-9 rounded-lg border text-[13px] font-medium cursor-grab transition-colors bg-sidebar border-sidebar-border text-sidebar-foreground hover:bg-sidebar-item-hover hover:border-input"
                              >+ {displayLabel}</button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-sidebar-muted px-1">Drag onto canvas or click to append.</p>
                  </div>

                  {/* ── Reset ── */}
                  <Button variant="ghost" size="sm" className="text-destructive/80 hover:text-destructive hover:bg-destructive/10" onClick={resetEditorFlow}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Reset editor
                  </Button>
                </div>
              )}
            </div>

            {/* ── export section (bottom of sidebar) ── */}
            {tab !== "library" && (
              <div className="border-t border-sidebar-border bg-sidebar-card px-3 py-4 flex flex-col gap-3">
                <div className="rounded-xl border border-sidebar-border bg-sidebar p-3 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">Export</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleExportJson} disabled={!hasContent}>
                      <FileJson className="w-3.5 h-3.5 mr-1" />
                      JSON
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleExportPng} disabled={!hasContent || busyPngExport}>
                      <Image className="w-3.5 h-3.5 mr-1" />
                      {busyPngExport ? "..." : "PNG"}
                    </Button>
                  </div>
                  {isEditorActive && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}>
                        <Upload className="w-3.5 h-3.5 mr-1.5" />
                        Import JSON
                      </Button>
                      <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportJson} />
                      {isMultiFlowEditor && (
                        <Button variant="outline" size="sm" onClick={handleExportAllEditorFlows}>
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Export All (JSON)
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <div className="rounded-xl border border-sidebar-border bg-sidebar p-3 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">Miro</p>
                  <Input className="h-8 text-[13px] rounded-lg" placeholder="Board ID" value={miroBoardId} onChange={(e) => setMiroBoardId(e.target.value)} />
                  <Button variant="outline" size="sm" onClick={handleExportMiro} disabled={busyMiroExport}>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {busyMiroExport ? "Exporting..." : (
                      (tab === "generate" && genResult && genResult.flows.length > 1) || (isEditorActive && isMultiFlowEditor)
                        ? "Export All to Miro"
                        : "Export to Miro"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </aside>

          {/* ── main area ── */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* navbar */}
            <div className="flex items-center gap-3 px-4 h-[52px] bg-navbar border-b border-navbar-border">
              <nav className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {TAB_ITEMS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => switchTab(t.value)}
                    className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                      tab === t.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
              <div className="ml-auto" />
              <ThemeToggle />
            </div>

            {/* canvas / content */}
            <div className="flex-1 bg-canvas relative" ref={canvasCaptureRef}>
              {tab === "library" ? (
                <LibraryView activeType={libraryActiveType} />
              ) : tab === "generate" && genStep !== "done" ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md px-6">
                    {genBusy ? (
                      <>
                        <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-muted-foreground">{genStep === "analyzing" ? "Analyzing brand website..." : "Generating tailored flows..."}</p>
                        <p className="text-xs text-muted-foreground mt-2">This may take 30-60 seconds depending on the plan size.</p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-xl font-semibold text-foreground mb-3">Generate a Flow Gameplan</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">Fill in the client details in the sidebar and click <b>Generate Gameplan</b>.</p>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-2">Or use the <b>AI Chat</b> below to describe a flow in plain English.</p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <ReactFlow
                  key={tab === "generate" && genResult ? `gen-${activeFlowIndex}` : `editor-${activeEditorFlowIndex}`}
                  onInit={(inst) => { reactFlowRef.current = inst; }}
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  fitView
                  nodesDraggable={isEditorActive}
                  nodesConnectable={isEditorActive}
                  elementsSelectable
                  onNodesChange={handleNodesChange}
                  onEdgesChange={handleEdgesChange}
                  onConnect={handleConnect}
                  onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
                  onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}
                  onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
                  onDragOver={(event) => { if (!isEditorActive) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                  onDrop={(event) => {
                    if (!isEditorActive || !reactFlowRef.current) return;
                    event.preventDefault();
                    const rawKind = event.dataTransfer.getData("application/flow-node-kind");
                    const allowed: NodeKind[] = ["trigger", "email", "sms", "wait", "split", "outcome", "profileFilter", "merge"];
                    if (!allowed.includes(rawKind as NodeKind)) return;
                    appendEditorNode(rawKind as NodeKind, reactFlowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
                  }}
                  deleteKeyCode={null}
                  panOnDrag
                  defaultEdgeOptions={{ ...EDGE_STYLE }}
                >
                  <Background color={theme === "dark" ? "rgba(255,255,255,0.06)" : "#e2e8f0"} gap={24} />
                  <MiniMap pannable zoomable />
                  <Controls />
                </ReactFlow>
              )}
              {tab === "generate" && (
                <ChatPanel
                  messages={chatMessages}
                  onSend={handleChatSend}
                  onClear={() => setChatMessages([])}
                  loading={chatLoading}
                  disabled={genBusy}
                />
              )}
            </div>
          </main>

          {/* ── details panel ── */}
          {tab !== "library" && (
          <aside className="w-[320px] flex-shrink-0 border-l border-border bg-background p-4 overflow-y-auto">
            <h2 className="text-base font-semibold text-foreground mb-3">Details</h2>
            {!selectedFlowNode && !selectedEdge && <p className="text-sm text-muted-foreground">Select a node or edge.</p>}

            {selectedFlowNode && (
              <div className="flex flex-col gap-3">
                <p className="text-sm"><b>ID:</b> {selectedFlowNode.id}</p>
                <p className="text-sm"><b>Type:</b> {selectedFlowNode.type}</p>

                {"title" in selectedFlowNode && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Title</Label>
                    <Input value={selectedFlowNode.title} disabled={!isEditorActive}
                      onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => "title" in fn ? { ...fn, title: e.target.value } : fn); }} />
                  </div>
                )}

                {"event" in selectedFlowNode && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Trigger event</Label>
                    <Input value={selectedFlowNode.event} disabled={!isEditorActive}
                      onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "trigger" ? { ...fn, event: e.target.value } : fn); }} />
                  </div>
                )}

                {"condition" in selectedFlowNode && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Split condition</Label>
                    <Input value={selectedFlowNode.condition} disabled={!isEditorActive}
                      onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "split" ? { ...fn, condition: e.target.value } : fn); }} />
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
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Strategy</p>
                    <div className="flex flex-col gap-1.5">
                      <Label>Primary focus</Label>
                      <Textarea value={selectedFlowNode.strategy.primaryFocus} disabled={!isEditorActive} rows={3}
                        onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => {
                          if (fn.type !== "message") return fn;
                          const s = fn.strategy ?? { primaryFocus: "", secondaryFocus: "" };
                          return { ...fn, strategy: { primaryFocus: e.target.value, secondaryFocus: s.secondaryFocus ?? "" } };
                        }); }} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Secondary focus</Label>
                      <Textarea value={selectedFlowNode.strategy.secondaryFocus ?? ""} disabled={!isEditorActive} rows={3}
                        onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => {
                          if (fn.type !== "message") return fn;
                          const s = fn.strategy ?? { primaryFocus: "", secondaryFocus: "" };
                          return { ...fn, strategy: { primaryFocus: s.primaryFocus, secondaryFocus: e.target.value } };
                        }); }} />
                    </div>
                  </>
                )}

                {isEditorActive && (
                  <Button variant="destructive" size="sm" onClick={deleteSelectedNode}>Delete node</Button>
                )}
              </div>
            )}

            {selectedEdge && (
              <div className="flex flex-col gap-3">
                <p className="text-sm"><b>Edge:</b> {selectedEdge.id}</p>
                <div className="flex flex-col gap-1.5">
                  <Label>Label</Label>
                  <Input value={selectedEdge.label ?? ""} disabled={!isEditorActive}
                    onChange={(e) => { if (!isEditorActive) return; updateEditorEdgeLabel(selectedEdge.id, e.target.value); }} />
                </div>
                {isEditorActive && (
                  <Button variant="destructive" size="sm" onClick={deleteSelectedEdge}>Delete edge</Button>
                )}
              </div>
            )}
          </aside>
          )}
      </div>
      <Dialog open={flowSpecModalOpen} onOpenChange={setFlowSpecModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Describe your flows
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setFlowSpecInfoOpen((v) => !v)}
                title="How to describe your flows"
              >
                <Info className="h-4 w-4" />
              </button>
            </DialogTitle>
            <DialogDescription>Number each flow (1, 2, 3...). Each number starts a new flow chart.</DialogDescription>
          </DialogHeader>
          {flowSpecInfoOpen && (
            <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">How to describe your flows</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><b>Flow name & channel:</b> e.g. "Email Welcome", "SMS Welcome", "Checkout Abandonment"</li>
                <li><b>Email/SMS counts:</b> e.g. "4 emails, 2 SMS"</li>
                <li><b>Conditional splits:</b> e.g. "Split by purchase history" or "Conditional split by engagement"</li>
                <li><b>Per-segment breakdown:</b> e.g. "3 emails for purchasers, 2 for non-purchasers"</li>
                <li><b>Mirror another flow:</b> e.g. "mirrors Checkout Abandonment"</li>
              </ul>
              <p className="text-xs">You can write as much detail as you want per flow. The next flow starts at the next number.</p>
            </div>
          )}
          <div className="py-2">
            <textarea
              id="flow-spec-modal"
              className="flex min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              placeholder={`1) Email Welcome: 4 emails, split by purchase history\n2) SMS Welcome: 3 SMS\n3) Checkout Abandonment: 6 emails, 4 SMS\n4) Post-Purchase: 3 emails, 2 SMS\n...`}
              value={customFlowText}
              onChange={(e) => setCustomFlowText(e.target.value)}
              disabled={genBusy}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlowSpecModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <BrandQuestionnaire
        open={questionnaireOpen}
        onOpenChange={setQuestionnaireOpen}
        data={questionnaireData}
        onSave={setQuestionnaireData}
      />
    </ReactFlowProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
      <Toaster position="bottom-right" richColors closeButton duration={3000} />
    </ThemeProvider>
  );
}
