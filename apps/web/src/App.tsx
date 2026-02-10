import { Component, useCallback, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import ReactFlow, {
  addEdge as rfAddEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MiniMap,
  MarkerType,
  Position,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps
} from "reactflow";
import {
  expandPackageTemplate,
  parseFlowSpec,
  parseFlowSpecSafe,
  welcomeSeriesFixture,
  type FlowNode,
  type FlowSpec
} from "@flow/core";
import { buildLayout } from "@flow/layout";
import { exportFlowToMiro } from "@flow/miro";
import { toPng } from "html-to-image";

/* ── types ── */

type AppTab = "generate" | "viewer" | "editor";
type TemplateChoice = "welcome-series" | "core-foundation" | "growth-engine" | "full-system" | "custom";
type PlanKey = "core-foundation" | "growth-engine" | "full-system";
type NodeKind = "trigger" | "email" | "sms" | "wait" | "split" | "outcome" | "profileFilter" | "note";

type AppNodeData = {
  title: string;
  subtitle: string;
  nodeType: FlowNode["type"];
  flowNode: FlowNode;
};

type BrandProfile = {
  brandName: string;
  industry: string;
  targetAudience: string;
  brandVoice: string;
  keyProducts: string[];
  uniqueSellingPoints: string[];
  discountStrategy: string;
  summary: string;
};

type GeneratedResult = {
  planKey: string;
  planName: string;
  brandName: string;
  flows: FlowSpec[];
};

/* ── constants ── */

const API_BASE = "http://localhost:3001";

const EDGE_STYLE = {
  markerEnd: { type: MarkerType.ArrowClosed, color: "#6f7b91" },
  style: { stroke: "#6f7b91", strokeWidth: 2 },
  labelStyle: { fill: "#51607d", fontWeight: 700, fontSize: 12 }
} as const;

const VIEWER_CHOICES: Array<{ label: string; value: TemplateChoice }> = [
  { label: "Welcome Series (test case)", value: "welcome-series" },
  { label: "Core Foundation", value: "core-foundation" },
  { label: "Growth Engine", value: "growth-engine" },
  { label: "Full System", value: "full-system" },
  { label: "Custom (imported)", value: "custom" }
];

const PLAN_OPTIONS: Array<{ label: string; value: PlanKey; desc: string }> = [
  { label: "Core Foundation", value: "core-foundation", desc: "6 flows — brands under $1M/yr" },
  { label: "Growth Engine", value: "growth-engine", desc: "8 flows — scaling to $1-2M/yr" },
  { label: "Full System", value: "full-system", desc: "9 flows — scaling to $2-20M/yr" }
];

/* ── helpers ── */

function getSpecFromChoice(choice: TemplateChoice): FlowSpec {
  if (choice === "welcome-series" || choice === "custom") {
    return parseFlowSpec(welcomeSeriesFixture);
  }
  return expandPackageTemplate(choice).flows[0];
}

function sanitizeId(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
}

function nodeSubtitle(node: FlowNode): string {
  if (node.type === "message") return node.channel.toUpperCase();
  if (node.type === "wait") return `${node.duration.value} ${node.duration.unit}`;
  if (node.type === "split") return node.condition;
  if (node.type === "trigger") return node.event;
  if (node.type === "note") return node.body;
  return node.type;
}

function downloadBlob(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function createFlowNode(kind: NodeKind): FlowNode {
  const id = sanitizeId(`${kind}_${Date.now()}`);
  if (kind === "trigger") return { id, type: "trigger", title: "Trigger", event: "Define your trigger" };
  if (kind === "email") return { id, type: "message", channel: "email", title: "Email" };
  if (kind === "sms") return { id, type: "message", channel: "sms", title: "SMS" };
  if (kind === "wait") return { id, type: "wait", duration: { value: 1, unit: "days" } };
  if (kind === "split") return { id, type: "split", title: "Conditional Split", condition: "Condition", labels: { yes: "Yes", no: "No" } };
  if (kind === "profileFilter") return { id, type: "profileFilter", title: "Profile Filters", filters: ["Filter"] };
  if (kind === "note") return { id, type: "note", title: "OBJECTIVE/FOCUS:", body: "Describe the objective here..." };
  return { id, type: "outcome", title: "Outcome", result: "Completed" };
}

function toRfNode(flowNode: FlowNode, position: { x: number; y: number }): Node<AppNodeData> {
  return {
    id: flowNode.id,
    type: "flowNode",
    position,
    data: {
      title: "title" in flowNode ? flowNode.title : flowNode.type,
      subtitle: nodeSubtitle(flowNode),
      nodeType: flowNode.type,
      flowNode
    }
  };
}

function specToRfNodes(spec: FlowSpec): Node<AppNodeData>[] {
  const positions = spec.ui?.nodePositions ?? {};

  // Separate notes from main nodes for vertical layout
  const mainNodes = spec.nodes.filter((n) => n.type !== "note");
  const noteNodes = spec.nodes.filter((n) => n.type === "note");

  // Build note→target map from edges
  const noteIds = new Set(noteNodes.map((n) => n.id));
  const noteTargetMap = new Map<string, string>();
  for (const edge of spec.edges) {
    if (noteIds.has(edge.from)) noteTargetMap.set(edge.from, edge.to);
  }

  // Position main nodes vertically (one per row)
  const result: Node<AppNodeData>[] = [];
  const mainPositions = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < mainNodes.length; i++) {
    const fn = mainNodes[i];
    const pos = positions[fn.id] ?? { x: 300, y: 80 + i * 160 };
    mainPositions.set(fn.id, pos);
    result.push(toRfNode(fn, pos));
  }

  // Position notes to the left of their target
  for (const note of noteNodes) {
    const targetId = noteTargetMap.get(note.id);
    const targetPos = targetId ? mainPositions.get(targetId) : undefined;
    const pos = positions[note.id] ?? (targetPos
      ? { x: targetPos.x - 380, y: targetPos.y }
      : { x: -80, y: 80 + result.length * 160 });
    result.push(toRfNode(note, pos));
  }

  return result;
}

function specToRfEdges(spec: FlowSpec): Edge[] {
  return spec.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.label,
    ...EDGE_STYLE
  }));
}

function editorToFlowSpec(rfNodes: Node<AppNodeData>[], rfEdges: Edge[]): FlowSpec {
  const channels = new Set<"email" | "sms">(["email"]);
  const flowNodes: FlowNode[] = rfNodes.map((n) => {
    const fn = n.data.flowNode;
    if (fn.type === "message") channels.add(fn.channel);
    return fn;
  });
  const flowEdges = rfEdges.map((e) => ({
    id: e.id, from: e.source, to: e.target,
    ...(typeof e.label === "string" && e.label ? { label: e.label } : {})
  }));
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of rfNodes) positions[n.id] = n.position;
  return {
    id: "editor_flow", name: "Custom Editor Flow", source: { mode: "manual" },
    channels: [...channels], defaults: { delay: { value: 2, unit: "days" } },
    nodes: flowNodes, edges: flowEdges, ui: { nodePositions: positions }
  } as FlowSpec;
}

/* ── custom node component ── */

function FlowCanvasNode({ data, selected }: NodeProps<AppNodeData>) {
  if (data.nodeType === "note") {
    return (
      <div className={`canvas-node canvas-node-note ${selected ? "selected" : ""}`}>
        <div className="note-title">{data.title}</div>
        <div className="note-body">{data.subtitle}</div>
        <Handle type="source" position={Position.Right} className="node-handle note-handle" />
      </div>
    );
  }
  return (
    <div className={`canvas-node canvas-node-${data.nodeType} ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="node-handle" />
      <Handle type="target" position={Position.Left} id="left" className="node-handle" />
      <div className="node-title">{data.title}</div>
      <div className="node-subtitle">{data.subtitle}</div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

/* ── error boundary ── */

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("React error boundary caught:", error); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#c0392b" }}>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: "8px 20px", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═══════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════ */

function AppInner() {
  const [tab, setTab] = useState<AppTab>("generate");

  /* ── generate tab state ── */
  const [genPlan, setGenPlan] = useState<PlanKey>("core-foundation");
  const [genUrl, setGenUrl] = useState("");
  const [genBrand, setGenBrand] = useState("");
  const [genNotes, setGenNotes] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genStep, setGenStep] = useState<"form" | "analyzing" | "generating" | "done">("form");
  const [genResult, setGenResult] = useState<GeneratedResult | null>(null);
  const [genError, setGenError] = useState("");

  /* ── generated flows navigation ── */
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);

  /* ── viewer state ── */
  const [viewerChoice, setViewerChoice] = useState<TemplateChoice>("welcome-series");
  const [customViewerSpec, setCustomViewerSpec] = useState<FlowSpec | null>(null);

  /* ── editor state ── */
  const [editorNodes, setEditorNodes] = useState<Node<AppNodeData>[]>([]);
  const [editorEdges, setEditorEdges] = useState<Edge[]>([]);

  /* ── shared state ── */
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busyPngExport, setBusyPngExport] = useState(false);
  const [busyMiroExport, setBusyMiroExport] = useState(false);
  const [miroBoardId, setMiroBoardId] = useState("");
  const [miroToken, setMiroToken] = useState("");

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const canvasCaptureRef = useRef<HTMLDivElement | null>(null);
  const reactFlowRef = useRef<{ screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number } } | null>(null);
  const nodeTypes = useMemo(() => ({ flowNode: FlowCanvasNode }), []);

  /* ── active spec for viewer/generate tabs ── */
  const activeGenFlow = useMemo(() => {
    if (tab === "generate" && genResult && genResult.flows.length > 0) {
      return genResult.flows[activeFlowIndex] ?? genResult.flows[0];
    }
    return null;
  }, [tab, genResult, activeFlowIndex]);

  const viewerSpec = useMemo(() => {
    if (viewerChoice === "custom" && customViewerSpec) return customViewerSpec;
    return getSpecFromChoice(viewerChoice);
  }, [viewerChoice, customViewerSpec]);

  const viewerLayout = useMemo(() => {
    try {
      return buildLayout(viewerSpec, { positionOverrides: viewerSpec.ui?.nodePositions ?? {} });
    } catch (err) {
      console.error("buildLayout failed:", err);
      return { nodes: [], edges: [] };
    }
  }, [viewerSpec]);

  const viewerNodes = useMemo<Node<AppNodeData>[]>(
    () => viewerLayout.nodes.map((ln) => {
      const raw = viewerSpec.nodes.find((n) => n.id === ln.id);
      const flowNode: FlowNode = raw ?? ({ id: ln.id, type: "outcome", title: ln.title, result: "" } as FlowNode);
      return {
        id: ln.id, type: "flowNode", position: { x: ln.x, y: ln.y }, draggable: false,
        data: { title: ln.title, subtitle: raw ? nodeSubtitle(raw) : ln.type, nodeType: ln.type, flowNode }
      };
    }),
    [viewerLayout.nodes, viewerSpec.nodes]
  );

  const viewerEdges = useMemo<Edge[]>(
    () => viewerSpec.edges.map((e) => ({ id: e.id, source: e.from, target: e.to, label: e.label, ...EDGE_STYLE })),
    [viewerSpec.edges]
  );

  /* ── generated flow: try layout, fall back to grid ── */
  const genNodes = useMemo<Node<AppNodeData>[]>(() => {
    if (!activeGenFlow) return [];
    try {
      const layout = buildLayout(activeGenFlow as FlowSpec, {});
      return layout.nodes.map((ln) => {
        const raw = activeGenFlow.nodes.find((n: any) => n.id === ln.id);
        const flowNode = raw ?? ({ id: ln.id, type: "outcome", title: ln.title, result: "" } as FlowNode);
        return {
          id: ln.id, type: "flowNode", position: { x: ln.x, y: ln.y }, draggable: false,
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
    return specToRfEdges(activeGenFlow as FlowSpec);
  }, [activeGenFlow]);

  /* ── pick active nodes/edges based on tab ── */
  const isEditorActive = tab === "editor";
  const flowNodes = isEditorActive ? editorNodes : (tab === "generate" && activeGenFlow ? genNodes : viewerNodes);
  const flowEdges = isEditorActive ? editorEdges : (tab === "generate" && activeGenFlow ? genEdges : viewerEdges);

  /* ── selected element lookup ── */
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

  /* ── editor handlers ── */
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (!isEditorActive) return;
    setEditorNodes((nds) => applyNodeChanges(changes, nds));
  }, [isEditorActive]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (!isEditorActive) return;
    setEditorEdges((eds) => applyEdgeChanges(changes, eds));
  }, [isEditorActive]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!isEditorActive || !connection.source || !connection.target) return;
    setEditorEdges((eds) => rfAddEdge({ ...connection, ...EDGE_STYLE }, eds));
    setNotice("Connected nodes.");
  }, [isEditorActive]);

  function appendEditorNode(kind: NodeKind, position?: { x: number; y: number }) {
    if (!isEditorActive) return;
    const fn = createFlowNode(kind);
    setEditorNodes((nds) => [...nds, toRfNode(fn, position ?? { x: 200, y: 80 + editorNodes.length * 140 })]);
    setSelectedNodeId(fn.id);
    setNotice("Node added.");
  }

  function deleteSelectedNode() {
    if (!isEditorActive || !selectedNodeId) return;
    setEditorNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEditorEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setNotice("Node removed.");
  }

  function deleteSelectedEdge() {
    if (!isEditorActive || !selectedEdgeId) return;
    setEditorEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    setNotice("Edge removed.");
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

  function resetEditorFlow() {
    setEditorNodes([]); setEditorEdges([]);
    setSelectedNodeId(null); setSelectedEdgeId(null);
    setNotice("Editor reset.");
  }

  /* ── load a generated flow into the editor ── */
  function openFlowInEditor(spec: FlowSpec) {
    setEditorNodes(specToRfNodes(spec));
    setEditorEdges(specToRfEdges(spec));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setTab("editor");
    setNotice(`Loaded "${spec.name}" into editor.`);
  }

  /* ── generate flow gameplan ── */
  async function handleGenerate() {
    if (!genUrl.trim() || !genBrand.trim()) {
      setGenError("Please enter a website URL and brand name.");
      return;
    }
    setGenBusy(true);
    setGenError("");
    setGenStep("analyzing");

    try {
      // Step 1: analyze brand
      const analyzeRes = await fetch(`${API_BASE}/api/analyze-brand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: genUrl.trim(), brandName: genBrand.trim(), notes: genNotes.trim() || undefined })
      });
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({ error: "Brand analysis failed" }));
        throw new Error(err.error || "Brand analysis failed");
      }
      const { profile } = (await analyzeRes.json()) as { profile: BrandProfile };

      // Step 2: generate flows
      setGenStep("generating");
      const generateRes = await fetch(`${API_BASE}/api/generate-flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: genPlan, brandProfile: profile })
      });
      if (!generateRes.ok) {
        const err = await generateRes.json().catch(() => ({ error: "Flow generation failed" }));
        throw new Error(err.error || "Flow generation failed");
      }
      const result = (await generateRes.json()) as GeneratedResult;

      console.log("Generation result:", result);
      console.log("First flow:", result.flows?.[0]);

      if (!result.flows || result.flows.length === 0) {
        throw new Error("No flows were generated.");
      }

      // Ensure each flow has required arrays
      for (const flow of result.flows) {
        if (!Array.isArray(flow.nodes)) flow.nodes = [];
        if (!Array.isArray(flow.edges)) flow.edges = [];
      }

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

  /* ── export ── */
  function getExportSpec(): FlowSpec {
    if (isEditorActive) return editorToFlowSpec(editorNodes, editorEdges);
    if (tab === "generate" && activeGenFlow) return activeGenFlow as FlowSpec;
    return viewerSpec;
  }

  function handleExportJson() {
    const spec = getExportSpec();
    downloadBlob(new Blob([JSON.stringify(spec, null, 2)], { type: "application/json;charset=utf-8" }), `${spec.id}.json`);
    setNotice("Exported JSON.");
  }

  function handleExportAllJson() {
    if (!genResult) return;
    downloadBlob(
      new Blob([JSON.stringify(genResult.flows, null, 2)], { type: "application/json;charset=utf-8" }),
      `${genResult.planKey}_all_flows.json`
    );
    setNotice("Exported all flows.");
  }

  async function handleExportPng() {
    if (!canvasCaptureRef.current) return;
    setBusyPngExport(true);
    try {
      const dataUrl = await toPng(canvasCaptureRef.current, { cacheBust: true, backgroundColor: "#f4f7fc", pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${getExportSpec().id}.png`;
      a.click();
      setNotice("Exported PNG.");
    } catch { setNotice("PNG export failed."); }
    finally { setBusyPngExport(false); }
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);

      // Handle array of flows (from "Export All")
      const single = Array.isArray(raw) ? raw[0] : raw;
      if (!single || !Array.isArray(single.nodes) || !Array.isArray(single.edges)) {
        setNotice("Invalid flow JSON — missing nodes or edges.");
        return;
      }

      // Try strict parse first, fall back to raw data
      let spec: FlowSpec;
      const result = parseFlowSpecSafe(single);
      if (result.success) {
        spec = result.data;
      } else {
        console.warn("Strict parse failed, using raw data:", result.error.issues);
        // Use raw data directly (generated flows may have extra fields)
        spec = single as FlowSpec;
      }

      if (isEditorActive) {
        setEditorNodes(specToRfNodes(spec));
        setEditorEdges(specToRfEdges(spec));
      } else {
        setCustomViewerSpec(spec);
        setViewerChoice("custom");
      }
      setSelectedNodeId(null); setSelectedEdgeId(null);
      setNotice(Array.isArray(raw) ? `Imported first of ${raw.length} flows.` : "Imported JSON.");
    } catch (err) {
      console.error("Import failed:", err);
      setNotice("Invalid JSON file.");
    }
    finally { event.target.value = ""; }
  }

  async function handleExportMiro() {
    if (!miroBoardId.trim() || !miroToken.trim()) { setNotice("Enter Miro board ID and token."); return; }
    setBusyMiroExport(true);
    try {
      const spec = getExportSpec();
      const result = await exportFlowToMiro({ boardId: miroBoardId.trim(), accessToken: miroToken.trim(), flowSpec: spec, positionOverrides: spec.ui?.nodePositions ?? {} });
      setNotice(`Exported to Miro: ${result.shapeCount} shapes, ${result.connectorCount} connectors.`);
    } catch (error) {
      setNotice(typeof error === "object" && error && "status" in error ? `Miro export failed (${(error as { status: number }).status}).` : "Miro export failed.");
    } finally { setBusyMiroExport(false); }
  }

  /* ── clear selection on tab switch ── */
  function switchTab(next: AppTab) {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setTab(next);
  }

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */
  return (
    <ReactFlowProvider>
      <div className="shell">
        {/* ── sidebar ── */}
        <aside className="sidebar">
          <h1>Flow Gameplan</h1>

          <button type="button" className={`sidebar-btn ${tab === "generate" ? "active" : ""}`} onClick={() => switchTab("generate")}>
            Generate
          </button>
          <button type="button" className={`sidebar-btn ${tab === "viewer" ? "active" : ""}`} onClick={() => switchTab("viewer")}>
            Viewer
          </button>
          <button type="button" className={`sidebar-btn ${tab === "editor" ? "active" : ""}`} onClick={() => switchTab("editor")}>
            Editor
          </button>

          {/* ── GENERATE sidebar ── */}
          {tab === "generate" ? (
            genStep === "done" && genResult ? (
              <div className="sidebar-section">
                <label>Generated flows — {genResult.planName}</label>
                <small className="hint">{genResult.brandName} · {genResult.flows.length} flows</small>
                <div className="flow-list">
                  {genResult.flows.map((flow, idx) => (
                    <button
                      key={flow.id}
                      type="button"
                      className={`flow-list-item ${idx === activeFlowIndex ? "active" : ""}`}
                      onClick={() => setActiveFlowIndex(idx)}
                    >
                      {flow.name}
                    </button>
                  ))}
                </div>
                <button type="button" className="sidebar-btn" onClick={() => openFlowInEditor(genResult.flows[activeFlowIndex])}>
                  Edit in Editor
                </button>
                <button type="button" className="sidebar-btn" onClick={handleExportAllJson}>
                  Export All (JSON)
                </button>
                <button type="button" className="reset-btn" onClick={() => { setGenStep("form"); setGenResult(null); }}>
                  New generation
                </button>
              </div>
            ) : (
              <div className="sidebar-section">
                <label>Plan</label>
                <select value={genPlan} onChange={(e) => setGenPlan(e.target.value as PlanKey)} disabled={genBusy}>
                  {PLAN_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <small className="hint">{PLAN_OPTIONS.find((p) => p.value === genPlan)?.desc}</small>

                <label>Client website URL</label>
                <input type="url" placeholder="https://example.com" value={genUrl} onChange={(e) => setGenUrl(e.target.value)} disabled={genBusy} />

                <label>Brand name</label>
                <input type="text" placeholder="Brand Name" value={genBrand} onChange={(e) => setGenBrand(e.target.value)} disabled={genBusy} />

                <label>Additional notes (optional)</label>
                <textarea
                  className="note-textarea"
                  rows={3}
                  placeholder="Products, audience, tone, discount codes..."
                  value={genNotes}
                  onChange={(e) => setGenNotes(e.target.value)}
                  disabled={genBusy}
                />

                <button type="button" className="generate-btn" onClick={handleGenerate} disabled={genBusy}>
                  {genBusy
                    ? genStep === "analyzing" ? "Analyzing brand..." : "Generating flows..."
                    : "Generate Gameplan"}
                </button>

                {genError ? <p className="gen-error">{genError}</p> : null}
              </div>
            )
          ) : null}

          {/* ── VIEWER sidebar ── */}
          {tab === "viewer" ? (
            <div className="sidebar-section">
              <label>Preset</label>
              <select value={viewerChoice} onChange={(e) => setViewerChoice(e.target.value as TemplateChoice)}>
                {VIEWER_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          ) : null}

          {/* ── EDITOR sidebar ── */}
          {tab === "editor" ? (
            <div className="sidebar-section">
              <label>Editor tools</label>
              <div className="tool-grid">
                {(["trigger", "email", "sms", "wait", "split", "outcome", "profileFilter", "note"] as NodeKind[]).map((kind) => {
                  const label = kind === "profileFilter" ? "Filter" : kind.charAt(0).toUpperCase() + kind.slice(1);
                  return (
                    <button key={kind} type="button" draggable
                      onDragStart={(e) => { e.dataTransfer.setData("application/flow-node-kind", kind); e.dataTransfer.effectAllowed = "move"; }}
                      onClick={() => appendEditorNode(kind)}
                      className={kind === "note" ? "tool-btn-note" : undefined}
                    >+ {label}</button>
                  );
                })}
              </div>
              <button type="button" className="reset-btn" onClick={resetEditorFlow}>Reset editor</button>
              <small className="hint">Drag a tool onto canvas or click to append.</small>
            </div>
          ) : null}

          {/* ── Miro export (always visible) ── */}
          <div className="sidebar-section">
            <label>Miro export</label>
            <input type="text" placeholder="Board ID" value={miroBoardId} onChange={(e) => setMiroBoardId(e.target.value)} />
            <input type="password" placeholder="Access token" value={miroToken} onChange={(e) => setMiroToken(e.target.value)} />
            <button type="button" onClick={handleExportMiro} disabled={busyMiroExport}>
              {busyMiroExport ? "Exporting..." : "Export to Miro"}
            </button>
          </div>
        </aside>

        {/* ── main canvas area ── */}
        <main className="main">
          <header className="toolbar">
            <button type="button" onClick={handleExportJson}>Export JSON</button>
            <button type="button" onClick={handleExportPng} disabled={busyPngExport}>
              {busyPngExport ? "Exporting..." : "Export PNG"}
            </button>
            <button type="button" onClick={() => importInputRef.current?.click()}>Import JSON</button>
            <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden-input" onChange={handleImportJson} />
            <span className="mode-pill">
              {tab === "generate" ? "Generate" : tab === "viewer" ? "Viewer" : "Editor"}
            </span>
            {notice ? <span className="notice">{notice}</span> : null}
          </header>

          <div className="canvas-wrap" ref={canvasCaptureRef}>
            {tab === "generate" && genStep !== "done" ? (
              <div className="generate-placeholder">
                <div className="gen-placeholder-inner">
                  {genBusy ? (
                    <>
                      <div className="gen-spinner" />
                      <p>{genStep === "analyzing" ? "Analyzing brand website..." : "Generating tailored flows..."}</p>
                      <small>This may take 30-60 seconds depending on the plan size.</small>
                    </>
                  ) : (
                    <>
                      <h2>Generate a Flow Gameplan</h2>
                      <p>Fill in the client details in the sidebar and click <b>Generate Gameplan</b>.</p>
                      <p>The platform will analyze the brand and create a complete set of tailored email/SMS flows.</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <ReactFlow
                key={tab === "generate" && genResult ? `gen-${activeFlowIndex}` : tab}
                onInit={(inst) => { reactFlowRef.current = inst; }}
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
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
                  const allowed: NodeKind[] = ["trigger", "email", "sms", "wait", "split", "outcome", "profileFilter", "note"];
                  if (!allowed.includes(rawKind as NodeKind)) return;
                  appendEditorNode(rawKind as NodeKind, reactFlowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
                }}
                deleteKeyCode={isEditorActive ? "Delete" : null}
                panOnDrag
                defaultEdgeOptions={{ type: "default", ...EDGE_STYLE }}
              >
                <Background color="#d6deef" gap={24} />
                <MiniMap pannable zoomable />
                <Controls />
              </ReactFlow>
            )}
          </div>
        </main>

        {/* ── details panel ── */}
        <aside className="panel">
          <h2>Details</h2>
          {!selectedFlowNode && !selectedEdge ? <p>Select a node or edge.</p> : null}

          {selectedFlowNode ? (
            <div className="details">
              <p><b>ID:</b> {selectedFlowNode.id}</p>
              <p><b>Type:</b> {selectedFlowNode.type}</p>

              {"title" in selectedFlowNode ? (
                <label>Title
                  <input value={selectedFlowNode.title} disabled={!isEditorActive}
                    onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => "title" in fn ? { ...fn, title: e.target.value } : fn); }} />
                </label>
              ) : null}

              {"event" in selectedFlowNode ? (
                <label>Trigger event
                  <input value={selectedFlowNode.event} disabled={!isEditorActive}
                    onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "trigger" ? { ...fn, event: e.target.value } : fn); }} />
                </label>
              ) : null}

              {"condition" in selectedFlowNode ? (
                <label>Split condition
                  <input value={selectedFlowNode.condition} disabled={!isEditorActive}
                    onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "split" ? { ...fn, condition: e.target.value } : fn); }} />
                </label>
              ) : null}

              {"body" in selectedFlowNode ? (
                <label>Body
                  <textarea className="note-textarea" value={selectedFlowNode.body} disabled={!isEditorActive} rows={6}
                    onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "note" ? { ...fn, body: e.target.value } : fn); }} />
                </label>
              ) : null}

              {"copyHint" in selectedFlowNode && selectedFlowNode.copyHint ? (
                <label>Copy hint
                  <textarea className="note-textarea" value={selectedFlowNode.copyHint} disabled rows={3} />
                </label>
              ) : null}

              {isEditorActive ? (
                <button type="button" className="danger" onClick={deleteSelectedNode}>Delete node</button>
              ) : null}
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="details">
              <p><b>Edge:</b> {selectedEdge.id}</p>
              <label>Label
                <input value={selectedEdge.label ?? ""} disabled={!isEditorActive}
                  onChange={(e) => { if (!isEditorActive) return; updateEditorEdgeLabel(selectedEdge.id, e.target.value); }} />
              </label>
              {isEditorActive ? (
                <button type="button" className="danger" onClick={deleteSelectedEdge}>Delete edge</button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </ReactFlowProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
