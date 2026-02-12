import { Component, useCallback, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import ReactFlow, {
  addEdge as rfAddEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BaseEdge,
  Controls,
  getStraightPath,
  getSmoothStepPath,
  Handle,
  MiniMap,
  MarkerType,
  Position,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
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
type NodeKind = "trigger" | "email" | "sms" | "wait" | "split" | "outcome" | "profileFilter" | "note" | "strategy";

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

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/+$/, "");

const EDGE_STYLE = {
  type: "smartEdge" as const,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
  style: { stroke: "#94a3b8", strokeWidth: 1.5 },
  labelStyle: { fill: "#475569", fontWeight: 600, fontSize: 11 }
} as const;

/* ── custom edge: orthogonal path, straight down when aligned ── */

function buildVerticalPath(sx: number, sy: number, tx: number, ty: number, r = 8): [string, number, number] {
  const midY = (sy + ty) / 2;
  const labelX = (sx + tx) / 2;
  const labelY = midY;

  // Perfectly aligned: straight vertical line
  if (Math.abs(sx - tx) < 1) {
    return [`M ${sx} ${sy} L ${tx} ${ty}`, labelX, labelY];
  }

  // Offset: Z-shaped path — down, horizontal turn, down — with rounded corners
  const dx = tx - sx;
  const sign = dx > 0 ? 1 : -1;
  const cr = Math.min(r, Math.abs(dx) / 2, Math.abs(midY - sy), Math.abs(ty - midY));

  const path =
    `M ${sx} ${sy} ` +
    `L ${sx} ${midY - cr} ` +
    `Q ${sx} ${midY} ${sx + sign * cr} ${midY} ` +
    `L ${tx - sign * cr} ${midY} ` +
    `Q ${tx} ${midY} ${tx} ${midY + cr} ` +
    `L ${tx} ${ty}`;

  return [path, labelX, labelY];
}

function SmartEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;

  const isVerticalFlow = sourcePosition === Position.Bottom && targetPosition === Position.Top;
  // With center-aligned layout, same-lane nodes have handles within a few pixels.
  // Use small threshold for true alignment, Z-path for small offsets, smoothstep for large.
  const isSameLane = Math.abs(sourceX - targetX) < 5;

  let path: string, labelX: number, labelY: number;
  if (isVerticalFlow && isSameLane) {
    [path, labelX, labelY] = buildVerticalPath(sourceX, sourceY, targetX, targetY, 8);
  } else {
    [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
  }

  return (
    <BaseEdge
      path={path}
      labelX={labelX}
      labelY={labelY}
      markerEnd={props.markerEnd}
      style={props.style}
      label={props.label}
      labelStyle={props.labelStyle}
      labelShowBg={props.labelShowBg}
      labelBgStyle={props.labelBgStyle}
      labelBgPadding={props.labelBgPadding}
      labelBgBorderRadius={props.labelBgBorderRadius}
    />
  );
}

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

/* ── node icons (inline SVG) ── */

const NodeIcons = {
  trigger: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  email: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,7 12,14 2,7"/>
    </svg>
  ),
  sms: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  wait: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
    </svg>
  ),
  split: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <path d="M18 9a9 9 0 0 1-9 9"/>
    </svg>
  ),
  outcome: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
    </svg>
  ),
  filter: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/>
    </svg>
  ),
  strategy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4m-8.66-15l3.46 2m10.4 6l3.46 2m-17.32 2l3.46-2m10.4-6l3.46-2"/>
    </svg>
  ),
};

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
  if (node.type === "strategy") return node.primaryFocus;
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
  if (kind === "strategy") return { id, type: "strategy", title: "STRATEGY", primaryFocus: "Primary focus...", secondaryFocus: "Secondary focus..." };
  return { id, type: "outcome", title: "Outcome", result: "Completed" };
}

const NODE_CONTAINER_WIDTH: Partial<Record<FlowNode["type"], number>> = {
  note: 320,
  strategy: 320,
};
const DEFAULT_CONTAINER_WIDTH = 280;

function rfContainerWidth(nodeType: string): number {
  return NODE_CONTAINER_WIDTH[nodeType as FlowNode["type"]] ?? DEFAULT_CONTAINER_WIDTH;
}

function toRfNode(flowNode: FlowNode, position: { x: number; y: number }): Node<AppNodeData> {
  return {
    id: flowNode.id,
    type: "flowNode",
    position,
    style: { width: rfContainerWidth(flowNode.type) },
    data: {
      title: "title" in flowNode ? flowNode.title : flowNode.type,
      subtitle: nodeSubtitle(flowNode),
      nodeType: flowNode.type,
      flowNode
    }
  };
}

function specToRfNodes(spec: FlowSpec): Node<AppNodeData>[] {
  try {
    const layout = buildLayout(spec, { positionOverrides: spec.ui?.nodePositions ?? {} });
    return layout.nodes.map((ln) => {
      const raw = spec.nodes.find((n) => n.id === ln.id);
      const flowNode: FlowNode = raw ?? ({ id: ln.id, type: "outcome", title: ln.title, result: "" } as FlowNode);
      return toRfNode(flowNode, { x: ln.x, y: ln.y });
    });
  } catch (err) {
    console.error("buildLayout failed in specToRfNodes, using simple grid:", err);
    // Fallback: stack nodes vertically
    return spec.nodes.map((fn, i) => toRfNode(fn, { x: 300, y: 80 + i * 160 }));
  }
}

function specToRfEdges(spec: FlowSpec): Edge[] {
  const sideNodeIds = new Set(
    spec.nodes.filter((n) => n.type === "note" || n.type === "strategy").map((n) => n.id)
  );
  return spec.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.label,
    ...(sideNodeIds.has(e.from) ? { targetHandle: "left" } : {}),
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

/* ── custom node component (Klaviyo-style) ── */

function FlowCanvasNode({ data, selected }: NodeProps<AppNodeData>) {
  const fn = data.flowNode;

  /* ── strategy node ── */
  if (fn.type === "strategy") {
    const branch = fn.branchLabel ?? "yes";
    return (
      <div className={`flow-strategy flow-strategy--${branch} ${selected ? "flow-strategy--selected" : ""}`}>
        <div className={`flow-strategy__header flow-strategy__header--${branch}`}>
          <div className="flow-strategy__header-icon">{NodeIcons.strategy}</div>
          <span>{data.title}</span>
        </div>
        <div className="flow-strategy__body">
          <div className="flow-strategy__label">PRIMARY FOCUS</div>
          <p className="flow-strategy__text">{fn.primaryFocus}</p>
          <div className="flow-strategy__label flow-strategy__label--secondary">SECONDARY FOCUS</div>
          <p className="flow-strategy__text">{fn.secondaryFocus}</p>
        </div>
        <Handle type="source" position={Position.Right} className="flow-handle flow-handle--strategy" />
      </div>
    );
  }

  /* ── note node ── */
  if (fn.type === "note") {
    return (
      <div className={`flow-note ${selected ? "flow-note--selected" : ""}`}>
        <div className="flow-note__title">{data.title}</div>
        <div className="flow-note__body">{fn.body}</div>
        <Handle type="source" position={Position.Right} className="flow-handle flow-handle--note" />
      </div>
    );
  }

  /* ── wait node (compact) ── */
  if (fn.type === "wait") {
    return (
      <div className={`flow-card flow-card--wait ${selected ? "flow-card--selected" : ""}`}>
        <Handle type="target" position={Position.Top} className="flow-handle" />
        <div className="flow-card__header">
          <div className="flow-card__icon flow-card__icon--wait">{NodeIcons.wait}</div>
          <span className="flow-card__title">Wait {fn.duration.value} {fn.duration.unit}</span>
        </div>
        <Handle type="source" position={Position.Bottom} className="flow-handle" />
      </div>
    );
  }

  /* ── all other nodes ── */
  const typeKey = fn.type === "message" ? fn.channel
    : fn.type === "profileFilter" ? "filter"
    : fn.type;

  const icon = fn.type === "message"
    ? (fn.channel === "sms" ? NodeIcons.sms : NodeIcons.email)
    : fn.type === "profileFilter" ? NodeIcons.filter
    : NodeIcons[fn.type as keyof typeof NodeIcons];

  let subtitle = "";
  if (fn.type === "trigger") subtitle = fn.event;
  else if (fn.type === "message") subtitle = fn.copyHint || "";
  else if (fn.type === "split") subtitle = fn.condition;
  else if (fn.type === "outcome") subtitle = fn.result;
  else if (fn.type === "profileFilter") subtitle = fn.filters.join(", ");

  return (
    <div className={`flow-card flow-card--${typeKey} ${selected ? "flow-card--selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <Handle type="target" position={Position.Left} id="left" className="flow-handle" />
      <div className="flow-card__header">
        <div className={`flow-card__icon flow-card__icon--${typeKey}`}>{icon}</div>
        <div className="flow-card__title">{data.title}</div>
      </div>
      {subtitle && <div className="flow-card__subtitle">{subtitle}</div>}
      {fn.type === "message" && (
        <div className="flow-card__footer">
          <span className={`flow-badge flow-badge--${fn.channel}`}>{fn.channel.toUpperCase()}</span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
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
  const edgeTypes = useMemo(() => ({ smartEdge: SmartEdge }), []);

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
        style: { width: rfContainerWidth(ln.type) },
        data: { title: ln.title, subtitle: raw ? nodeSubtitle(raw) : ln.type, nodeType: ln.type, flowNode }
      };
    }),
    [viewerLayout.nodes, viewerSpec.nodes]
  );

  const viewerEdges = useMemo<Edge[]>(
    () => specToRfEdges(viewerSpec),
    [viewerSpec]
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
        // Strict Zod parse failed; use raw data (generated flows may have extra fields)
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
              {([
                { label: "Actions", kinds: ["trigger", "email", "sms", "outcome"] as NodeKind[] },
                { label: "Timing", kinds: ["wait"] as NodeKind[] },
                { label: "Logic", kinds: ["split", "profileFilter"] as NodeKind[] },
                { label: "Annotations", kinds: ["note", "strategy"] as NodeKind[] }
              ]).map((category) => (
                <div key={category.label} className="tool-category">
                  <small className="tool-category-label">{category.label}</small>
                  <div className="tool-grid">
                    {category.kinds.map((kind) => {
                      const displayLabel = kind === "profileFilter" ? "Filter" : kind.charAt(0).toUpperCase() + kind.slice(1);
                      return (
                        <button key={kind} type="button" draggable
                          onDragStart={(e) => { e.dataTransfer.setData("application/flow-node-kind", kind); e.dataTransfer.effectAllowed = "move"; }}
                          onClick={() => appendEditorNode(kind)}
                          className={kind === "note" ? "tool-btn-note" : kind === "strategy" ? "tool-btn-strategy" : undefined}
                        >+ {displayLabel}</button>
                      );
                    })}
                  </div>
                </div>
              ))}
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
                  const allowed: NodeKind[] = ["trigger", "email", "sms", "wait", "split", "outcome", "profileFilter", "note", "strategy"];
                  if (!allowed.includes(rawKind as NodeKind)) return;
                  appendEditorNode(rawKind as NodeKind, reactFlowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
                }}
                deleteKeyCode={isEditorActive ? "Delete" : null}
                panOnDrag
                defaultEdgeOptions={{ ...EDGE_STYLE }}
              >
                <Background color="#e2e8f0" gap={24} />
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

              {"primaryFocus" in selectedFlowNode ? (
                <>
                  <label>Primary focus
                    <textarea className="note-textarea" value={selectedFlowNode.primaryFocus} disabled={!isEditorActive} rows={3}
                      onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "strategy" ? { ...fn, primaryFocus: e.target.value } : fn); }} />
                  </label>
                  <label>Secondary focus
                    <textarea className="note-textarea" value={selectedFlowNode.secondaryFocus} disabled={!isEditorActive} rows={3}
                      onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "strategy" ? { ...fn, secondaryFocus: e.target.value } : fn); }} />
                  </label>
                  {"branchLabel" in selectedFlowNode && selectedFlowNode.branchLabel ? (
                    <p><b>Branch:</b> {selectedFlowNode.branchLabel === "yes" ? "Yes (purchaser)" : "No (non-purchaser)"}</p>
                  ) : null}
                </>
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
