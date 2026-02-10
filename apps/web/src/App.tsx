import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
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
  welcomeSeriesFixture,
  type FlowNode,
  type FlowSpec
} from "@flow/core";
import { buildLayout } from "@flow/layout";
import { exportFlowToMiro } from "@flow/miro";
import { toPng } from "html-to-image";

type CanvasMode = "viewer" | "builder";
type TemplateChoice = "welcome-series" | "core-foundation" | "growth-engine" | "full-system" | "custom";
type NodeKind = "trigger" | "email" | "sms" | "wait" | "split" | "outcome" | "profileFilter";

/* ── extended node data: includes the raw FlowNode for the details panel ── */
type AppNodeData = {
  title: string;
  subtitle: string;
  nodeType: FlowNode["type"];
  flowNode: FlowNode;
};

const EDGE_STYLE = {
  markerEnd: { type: MarkerType.ArrowClosed, color: "#6f7b91" },
  style: { stroke: "#6f7b91", strokeWidth: 2 },
  labelStyle: { fill: "#51607d", fontWeight: 700, fontSize: 12 }
} as const;

const CHOICES: Array<{ label: string; value: TemplateChoice }> = [
  { label: "Welcome Series (test case)", value: "welcome-series" },
  { label: "Core Foundation", value: "core-foundation" },
  { label: "Growth Engine", value: "growth-engine" },
  { label: "Full System", value: "full-system" },
  { label: "Custom (imported)", value: "custom" }
];

function getSpecFromChoice(choice: TemplateChoice): FlowSpec {
  if (choice === "welcome-series" || choice === "custom") {
    return parseFlowSpec(welcomeSeriesFixture);
  }
  return expandPackageTemplate(choice).flows[0];
}

function sanitizeId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function nodeSubtitle(node: FlowNode): string {
  if (node.type === "message") return node.channel.toUpperCase();
  if (node.type === "wait") return `${node.duration.value} ${node.duration.unit}`;
  if (node.type === "split") return node.condition;
  if (node.type === "trigger") return node.event;
  return node.type;
}

function downloadBlob(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
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
  return { id, type: "outcome", title: "Outcome", result: "Completed" };
}

/** Convert a FlowNode into a ReactFlow Node */
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

/* ── custom node component ── */
function FlowCanvasNode({ data, selected }: NodeProps<AppNodeData>) {
  return (
    <div className={`canvas-node canvas-node-${data.nodeType} ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="node-handle" />
      <div className="node-title">{data.title}</div>
      <div className="node-subtitle">{data.subtitle}</div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

/* ── helpers to reconstruct FlowSpec from builder RF state (for export) ── */
function builderToFlowSpec(
  rfNodes: Node<AppNodeData>[],
  rfEdges: Edge[]
): FlowSpec {
  const channels = new Set<"email" | "sms">(["email"]);
  const flowNodes: FlowNode[] = rfNodes.map((n) => {
    const fn = n.data.flowNode;
    if (fn.type === "message") channels.add(fn.channel);
    return fn;
  });
  const flowEdges = rfEdges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
    ...(typeof e.label === "string" && e.label ? { label: e.label } : {})
  }));
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of rfNodes) {
    positions[n.id] = n.position;
  }
  return {
    id: "builder_flow",
    name: "Custom Builder Flow",
    source: { mode: "manual" },
    channels: [...channels],
    defaults: { delay: { value: 2, unit: "days" } },
    nodes: flowNodes,
    edges: flowEdges,
    ui: { nodePositions: positions }
  } as FlowSpec;
}

/* ── main app ── */
export default function App() {
  const [mode, setMode] = useState<CanvasMode>("viewer");
  const [choice, setChoice] = useState<TemplateChoice>("welcome-series");
  const [customViewerSpec, setCustomViewerSpec] = useState<FlowSpec | null>(null);

  /* Builder state: ReactFlow owns the arrays directly, just like CartPanda */
  const [builderNodes, setBuilderNodes] = useState<Node<AppNodeData>[]>([]);
  const [builderEdges, setBuilderEdges] = useState<Edge[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busyPngExport, setBusyPngExport] = useState(false);
  const [busyMiroExport, setBusyMiroExport] = useState(false);
  const [miroBoardId, setMiroBoardId] = useState("");
  const [miroToken, setMiroToken] = useState("");

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const canvasCaptureRef = useRef<HTMLDivElement | null>(null);
  const reactFlowRef = useRef<{
    screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
  } | null>(null);
  const nodeTypes = useMemo(() => ({ flowNode: FlowCanvasNode }), []);

  /* ── viewer derived state ── */
  const viewerSpec = useMemo(() => {
    if (choice === "custom" && customViewerSpec) return customViewerSpec;
    return getSpecFromChoice(choice);
  }, [choice, customViewerSpec]);

  const viewerLayout = useMemo(
    () => buildLayout(viewerSpec, { positionOverrides: viewerSpec.ui?.nodePositions ?? {} }),
    [viewerSpec]
  );

  const viewerNodes = useMemo<Node<AppNodeData>[]>(
    () =>
      viewerLayout.nodes.map((ln) => {
        const raw = viewerSpec.nodes.find((n) => n.id === ln.id);
        const flowNode: FlowNode = raw ?? ({ id: ln.id, type: "outcome", title: ln.title, result: "" } as FlowNode);
        return {
          id: ln.id,
          type: "flowNode",
          position: { x: ln.x, y: ln.y },
          draggable: false,
          data: {
            title: ln.title,
            subtitle: raw ? nodeSubtitle(raw) : ln.type,
            nodeType: ln.type,
            flowNode
          }
        };
      }),
    [viewerLayout.nodes, viewerSpec.nodes]
  );

  const viewerEdges = useMemo<Edge[]>(
    () =>
      viewerSpec.edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label: e.label,
        ...EDGE_STYLE
      })),
    [viewerSpec.edges]
  );

  /* ── pick active arrays ── */
  const flowNodes = mode === "viewer" ? viewerNodes : builderNodes;
  const flowEdges = mode === "viewer" ? viewerEdges : builderEdges;

  /* ── selected element lookup (works for both modes) ── */
  const selectedFlowNode: FlowNode | null = useMemo(() => {
    if (!selectedNodeId) return null;
    const rfNode = flowNodes.find((n) => n.id === selectedNodeId);
    return rfNode?.data.flowNode ?? null;
  }, [selectedNodeId, flowNodes]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    const rfEdge = flowEdges.find((e) => e.id === selectedEdgeId);
    if (!rfEdge) return null;
    return { id: rfEdge.id, label: typeof rfEdge.label === "string" ? rfEdge.label : undefined };
  }, [selectedEdgeId, flowEdges]);

  /* ── builder: node changes (drag, select, remove) – mirrors CartPanda ── */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (mode !== "builder") return;
      setBuilderNodes((nds) => applyNodeChanges(changes, nds));
    },
    [mode]
  );

  /* ── builder: edge changes (remove) ── */
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (mode !== "builder") return;
      setBuilderEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [mode]
  );

  /* ── builder: connect two nodes ── */
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (mode !== "builder" || !connection.source || !connection.target) return;
      setBuilderEdges((eds) =>
        rfAddEdge(
          {
            ...connection,
            ...EDGE_STYLE
          },
          eds
        )
      );
      setNotice("Connected nodes.");
    },
    [mode]
  );

  /* ── builder: add node from sidebar ── */
  function appendBuilderNode(kind: NodeKind, position?: { x: number; y: number }) {
    if (mode !== "builder") return;
    const flowNode = createFlowNode(kind);
    const pos = position ?? { x: 200, y: 80 + builderNodes.length * 140 };
    setBuilderNodes((nds) => [...nds, toRfNode(flowNode, pos)]);
    setSelectedNodeId(flowNode.id);
    setNotice("Node added.");
  }

  /* ── builder: delete selected node ── */
  function deleteSelectedNode() {
    if (mode !== "builder" || !selectedNodeId) return;
    setBuilderNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setBuilderEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setNotice("Node removed.");
  }

  /* ── builder: delete selected edge ── */
  function deleteSelectedEdge() {
    if (mode !== "builder" || !selectedEdgeId) return;
    setBuilderEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    setNotice("Edge removed.");
  }

  /* ── builder: update a FlowNode property (from details panel) ── */
  function updateBuilderNodeData(nodeId: string, updater: (fn: FlowNode) => FlowNode) {
    setBuilderNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const updated = updater(n.data.flowNode);
        return {
          ...n,
          data: {
            ...n.data,
            title: "title" in updated ? updated.title : updated.type,
            subtitle: nodeSubtitle(updated),
            flowNode: updated
          }
        };
      })
    );
  }

  /* ── builder: update edge label ── */
  function updateBuilderEdgeLabel(edgeId: string, label: string) {
    setBuilderEdges((eds) =>
      eds.map((e) => (e.id === edgeId ? { ...e, label: label || undefined } : e))
    );
  }

  /* ── builder: reset ── */
  function resetBuilderFlow() {
    setBuilderNodes([]);
    setBuilderEdges([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNotice("Builder reset.");
  }

  /* ── export helpers ── */
  function getExportSpec(): FlowSpec {
    if (mode === "builder") {
      return builderToFlowSpec(builderNodes, builderEdges);
    }
    return viewerSpec;
  }

  function handleExportJson() {
    const spec = getExportSpec();
    downloadBlob(
      new Blob([JSON.stringify(spec, null, 2)], { type: "application/json;charset=utf-8" }),
      `${spec.id}.json`
    );
    setNotice("Exported JSON.");
  }

  async function handleExportPng() {
    if (!canvasCaptureRef.current) return;
    setBusyPngExport(true);
    try {
      const dataUrl = await toPng(canvasCaptureRef.current, {
        cacheBust: true,
        backgroundColor: "#f4f7fc",
        pixelRatio: 2
      });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${getExportSpec().id}.png`;
      anchor.click();
      setNotice("Exported PNG.");
    } catch {
      setNotice("PNG export failed.");
    } finally {
      setBusyPngExport(false);
    }
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseFlowSpec(JSON.parse(text));
      const positions = parsed.ui?.nodePositions ?? {};
      if (mode === "builder") {
        const imported = parsed.nodes.map((fn, i) => toRfNode(fn, positions[fn.id] ?? { x: 120 + (i % 3) * 260, y: 100 + Math.floor(i / 3) * 160 }));
        const importedEdges: Edge[] = parsed.edges.map((e) => ({
          id: e.id,
          source: e.from,
          target: e.to,
          label: e.label,
          ...EDGE_STYLE
        }));
        setBuilderNodes(imported);
        setBuilderEdges(importedEdges);
      } else {
        setCustomViewerSpec(parsed);
        setChoice("custom");
      }
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setNotice("Imported JSON.");
    } catch {
      setNotice("Invalid JSON or flow schema.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleExportMiro() {
    if (!miroBoardId.trim() || !miroToken.trim()) {
      setNotice("Enter Miro board ID and token.");
      return;
    }
    setBusyMiroExport(true);
    try {
      const spec = getExportSpec();
      const result = await exportFlowToMiro({
        boardId: miroBoardId.trim(),
        accessToken: miroToken.trim(),
        flowSpec: spec,
        positionOverrides: spec.ui?.nodePositions ?? {}
      });
      setNotice(`Exported to Miro: ${result.shapeCount} shapes, ${result.connectorCount} connectors.`);
    } catch (error) {
      if (typeof error === "object" && error && "status" in error) {
        setNotice(`Miro export failed (status ${(error as { status: number }).status}).`);
      } else {
        setNotice("Miro export failed.");
      }
    } finally {
      setBusyMiroExport(false);
    }
  }

  /* ── render ── */
  return (
    <ReactFlowProvider>
      <div className="shell">
        <aside className="sidebar">
          <h1>Flow Gameplan</h1>
          <button type="button" className={`sidebar-btn ${mode === "viewer" ? "active" : ""}`} onClick={() => setMode("viewer")}>
            Viewer
          </button>
          <button type="button" className={`sidebar-btn ${mode === "builder" ? "active" : ""}`} onClick={() => setMode("builder")}>
            Builder
          </button>

          {mode === "viewer" ? (
            <div className="sidebar-section">
              <label>Preset</label>
              <select value={choice} onChange={(e) => setChoice(e.target.value as TemplateChoice)}>
                {CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sidebar-section">
              <label>Builder tools</label>
              <div className="tool-grid">
                {(["trigger", "email", "sms", "wait", "split", "outcome", "profileFilter"] as NodeKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/flow-node-kind", kind);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => appendBuilderNode(kind)}
                  >
                    + {kind === "profileFilter" ? "Filter" : kind.charAt(0).toUpperCase() + kind.slice(1)}
                  </button>
                ))}
              </div>
              <button type="button" className="reset-btn" onClick={resetBuilderFlow}>Reset builder</button>
              <small className="hint">Drag a tool onto canvas or click to append.</small>
            </div>
          )}

          <div className="sidebar-section">
            <label>Miro export</label>
            <input type="text" placeholder="Board ID" value={miroBoardId} onChange={(e) => setMiroBoardId(e.target.value)} />
            <input type="password" placeholder="Access token" value={miroToken} onChange={(e) => setMiroToken(e.target.value)} />
            <button type="button" onClick={handleExportMiro} disabled={busyMiroExport}>
              {busyMiroExport ? "Exporting..." : "Export to Miro"}
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="toolbar">
            <button type="button" onClick={handleExportJson}>Export JSON</button>
            <button type="button" onClick={handleExportPng} disabled={busyPngExport}>
              {busyPngExport ? "Exporting..." : "Export PNG"}
            </button>
            <button type="button" onClick={() => importInputRef.current?.click()}>Import JSON</button>
            <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden-input" onChange={handleImportJson} />
            <span className="mode-pill">{mode === "viewer" ? "Viewer mode" : "Builder mode"}</span>
            {notice ? <span className="notice">{notice}</span> : null}
          </header>

          <div className="canvas-wrap" ref={canvasCaptureRef}>
            <ReactFlow
              onInit={(instance) => { reactFlowRef.current = instance; }}
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              fitView
              nodesDraggable={mode === "builder"}
              nodesConnectable={mode === "builder"}
              elementsSelectable
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
              onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}
              onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
              onDragOver={(event) => {
                if (mode !== "builder") return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (mode !== "builder" || !reactFlowRef.current) return;
                event.preventDefault();
                const rawKind = event.dataTransfer.getData("application/flow-node-kind");
                const allowed: NodeKind[] = ["trigger", "email", "sms", "wait", "split", "outcome", "profileFilter"];
                if (!allowed.includes(rawKind as NodeKind)) return;
                const position = reactFlowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                appendBuilderNode(rawKind as NodeKind, position);
              }}
              deleteKeyCode={mode === "builder" ? "Delete" : null}
              panOnDrag
              defaultEdgeOptions={{
                type: "default",
                ...EDGE_STYLE
              }}
            >
              <Background color="#d6deef" gap={24} />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
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
                <label>
                  Title
                  <input
                    value={selectedFlowNode.title}
                    disabled={mode !== "builder"}
                    onChange={(e) => {
                      if (mode !== "builder") return;
                      updateBuilderNodeData(selectedFlowNode.id, (fn) =>
                        "title" in fn ? { ...fn, title: e.target.value } : fn
                      );
                    }}
                  />
                </label>
              ) : null}

              {"event" in selectedFlowNode ? (
                <label>
                  Trigger event
                  <input
                    value={selectedFlowNode.event}
                    disabled={mode !== "builder"}
                    onChange={(e) => {
                      if (mode !== "builder") return;
                      updateBuilderNodeData(selectedFlowNode.id, (fn) =>
                        fn.type === "trigger" ? { ...fn, event: e.target.value } : fn
                      );
                    }}
                  />
                </label>
              ) : null}

              {"condition" in selectedFlowNode ? (
                <label>
                  Split condition
                  <input
                    value={selectedFlowNode.condition}
                    disabled={mode !== "builder"}
                    onChange={(e) => {
                      if (mode !== "builder") return;
                      updateBuilderNodeData(selectedFlowNode.id, (fn) =>
                        fn.type === "split" ? { ...fn, condition: e.target.value } : fn
                      );
                    }}
                  />
                </label>
              ) : null}

              {mode === "builder" ? (
                <button type="button" className="danger" onClick={deleteSelectedNode}>Delete node</button>
              ) : null}
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="details">
              <p><b>Edge:</b> {selectedEdge.id}</p>
              <label>
                Label
                <input
                  value={selectedEdge.label ?? ""}
                  disabled={mode !== "builder"}
                  onChange={(e) => {
                    if (mode !== "builder") return;
                    updateBuilderEdgeLabel(selectedEdge.id, e.target.value);
                  }}
                />
              </label>
              {mode === "builder" ? (
                <button type="button" className="danger" onClick={deleteSelectedEdge}>Delete edge</button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </ReactFlowProvider>
  );
}
