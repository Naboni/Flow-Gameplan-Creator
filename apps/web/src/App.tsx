import { useMemo, useRef, useState, type ChangeEvent } from "react";
import ReactFlow, {
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
  addEdge,
  addNode,
  expandPackageTemplate,
  parseFlowSpec,
  parseFlowSpecSafe,
  removeEdge,
  removeNode,
  updateEdgeLabel,
  updateNodeTitle,
  welcomeSeriesFixture,
  type FlowNode,
  type FlowSpec
} from "@flow/core";
import { buildLayout } from "@flow/layout";
import { exportFlowToMiro } from "@flow/miro";
import { toPng } from "html-to-image";

type CanvasMode = "viewer" | "builder";
type TemplateChoice = "welcome-series" | "core-foundation" | "growth-engine" | "full-system" | "custom";
type PositionMap = Record<string, { x: number; y: number }>;
type NodeKind = "email" | "sms" | "wait" | "split" | "outcome" | "profileFilter";

type AppNodeData = {
  title: string;
  subtitle: string;
  nodeType: FlowNode["type"];
};

const CHOICES: Array<{ label: string; value: TemplateChoice }> = [
  { label: "Welcome Series (test case)", value: "welcome-series" },
  { label: "Core Foundation", value: "core-foundation" },
  { label: "Growth Engine", value: "growth-engine" },
  { label: "Full System", value: "full-system" },
  { label: "Custom (imported)", value: "custom" }
];

const BUILDER_BASE_SPEC: FlowSpec = parseFlowSpec({
  id: "builder_flow",
  name: "Custom Builder Flow",
  source: { mode: "manual" },
  channels: ["email"],
  defaults: { delay: { value: 2, unit: "days" } },
  nodes: [
    { id: "builder_trigger", type: "trigger", title: "Trigger", event: "Define your trigger" },
    { id: "builder_outcome", type: "outcome", title: "Outcome", result: "Define your outcome" }
  ],
  edges: [{ id: "builder_edge_1", from: "builder_trigger", to: "builder_outcome" }]
});

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
  if (node.type === "message") {
    return node.channel.toUpperCase();
  }
  if (node.type === "wait") {
    return `${node.duration.value} ${node.duration.unit}`;
  }
  if (node.type === "split") {
    return node.condition;
  }
  if (node.type === "trigger") {
    return node.event;
  }
  return node.type;
}

function ensureChannels(spec: FlowSpec, node: FlowNode): FlowSpec {
  if (node.type !== "message" || spec.channels.includes(node.channel)) {
    return spec;
  }
  return { ...spec, channels: [...spec.channels, node.channel] };
}

function nextEdgeId(spec: FlowSpec): string {
  const existing = new Set(spec.edges.map((entry) => entry.id));
  let i = 1;
  while (existing.has(`edge_${i}`)) {
    i += 1;
  }
  return `edge_${i}`;
}

function buildExportSpec(spec: FlowSpec, positions: PositionMap): FlowSpec {
  if (Object.keys(positions).length === 0) {
    return spec;
  }
  return {
    ...spec,
    ui: {
      ...(spec.ui ?? {}),
      nodePositions: positions
    }
  };
}

function downloadBlob(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createNodeFromKind(kind: NodeKind): FlowNode {
  const id = sanitizeId(`${kind}_${Date.now()}`);
  if (kind === "email") {
    return { id, type: "message", channel: "email", title: "Email" };
  }
  if (kind === "sms") {
    return { id, type: "message", channel: "sms", title: "SMS" };
  }
  if (kind === "wait") {
    return { id, type: "wait", duration: { value: 1, unit: "days" } };
  }
  if (kind === "split") {
    return {
      id,
      type: "split",
      title: "Conditional Split",
      condition: "Condition",
      labels: { yes: "Yes", no: "No" }
    };
  }
  if (kind === "profileFilter") {
    return { id, type: "profileFilter", title: "Profile Filters", filters: ["Filter"] };
  }
  return { id, type: "outcome", title: "Outcome", result: "Completed" };
}

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

export default function App() {
  const [mode, setMode] = useState<CanvasMode>("viewer");
  const [choice, setChoice] = useState<TemplateChoice>("welcome-series");
  const [customViewerSpec, setCustomViewerSpec] = useState<FlowSpec | null>(null);
  const [builderSpec, setBuilderSpec] = useState<FlowSpec>(BUILDER_BASE_SPEC);
  const [builderPositions, setBuilderPositions] = useState<PositionMap>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busyPngExport, setBusyPngExport] = useState(false);
  const [busyMiroExport, setBusyMiroExport] = useState(false);
  const [miroBoardId, setMiroBoardId] = useState("");
  const [miroToken, setMiroToken] = useState("");
  const [draggingKind, setDraggingKind] = useState<NodeKind | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const canvasCaptureRef = useRef<HTMLDivElement | null>(null);
  const reactFlowRef = useRef<{
    screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
  } | null>(null);
  const nodeTypes = useMemo(() => ({ flowNode: FlowCanvasNode }), []);

  const viewerSpec = useMemo(() => {
    if (choice === "custom" && customViewerSpec) {
      return customViewerSpec;
    }
    return getSpecFromChoice(choice);
  }, [choice, customViewerSpec]);

  const activeSpec = mode === "viewer" ? viewerSpec : builderSpec;
  const activePositions = mode === "builder" ? builderPositions : (activeSpec.ui?.nodePositions ?? {});
  const layout = useMemo(
    () => buildLayout(activeSpec, { positionOverrides: activePositions }),
    [activeSpec, activePositions]
  );

  const flowNodes = useMemo<Node<AppNodeData>[]>(
    () =>
      layout.nodes.map((node) => {
        const raw = activeSpec.nodes.find((entry) => entry.id === node.id);
        return {
          id: node.id,
          type: "flowNode",
          position: { x: node.x, y: node.y },
          data: {
            title: node.title,
            subtitle: raw ? nodeSubtitle(raw) : node.type,
            nodeType: node.type
          },
          draggable: mode === "builder"
        };
      }),
    [layout.nodes, activeSpec.nodes, mode]
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      activeSpec.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.label,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6f7b91" },
        style: { stroke: "#6f7b91", strokeWidth: 2 },
        labelStyle: { fill: "#51607d", fontWeight: 700, fontSize: 12 }
      })),
    [activeSpec.edges]
  );

  const selectedNode = selectedNodeId
    ? activeSpec.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const selectedEdge = selectedEdgeId
    ? activeSpec.edges.find((edge) => edge.id === selectedEdgeId) ?? null
    : null;

  function applyBuilderDraft(draft: FlowSpec, nextPositions: PositionMap = builderPositions) {
    const parsed = parseFlowSpecSafe(draft);
    if (!parsed.success) {
      setNotice(`Invalid update: ${parsed.error.issues[0]?.message ?? "Unknown error"}`);
      return;
    }
    const validIds = new Set(parsed.data.nodes.map((node) => node.id));
    const cleaned: PositionMap = {};
    for (const [id, position] of Object.entries(nextPositions)) {
      if (validIds.has(id)) {
        cleaned[id] = position;
      }
    }
    setBuilderSpec(parsed.data);
    setBuilderPositions(cleaned);
  }

  function appendBuilderNode(kind: NodeKind, position?: { x: number; y: number }) {
    if (mode !== "builder") {
      return;
    }
    const created = createNodeFromKind(kind);
    let draft = ensureChannels(builderSpec, created);
    draft = addNode(draft, created);
    const from = selectedNodeId ?? draft.nodes.find((node) => node.type === "trigger")?.id;
    if (from) {
      draft = addEdge(draft, { id: nextEdgeId(draft), from, to: created.id });
    }
    if (kind === "split") {
      const yesNode = { id: `${created.id}_yes`, type: "outcome" as const, title: "Yes Outcome", result: "Yes path" };
      const noNode = { id: `${created.id}_no`, type: "outcome" as const, title: "No Outcome", result: "No path" };
      draft = addNode(draft, yesNode);
      draft = addNode(draft, noNode);
      draft = addEdge(draft, { id: nextEdgeId(draft), from: created.id, to: yesNode.id, label: "Yes" });
      draft = addEdge(draft, { id: nextEdgeId(draft), from: created.id, to: noNode.id, label: "No" });
    }
    const nextPositions = { ...builderPositions };
    if (position) {
      nextPositions[created.id] = position;
    }
    applyBuilderDraft(draft, nextPositions);
    setSelectedNodeId(created.id);
    setNotice("Node added.");
  }

  function handleNodesChange(changes: NodeChange[]) {
    if (mode !== "builder") {
      return;
    }
    const next = { ...builderPositions };
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        next[change.id] = change.position;
      }
    }
    setBuilderPositions(next);
  }

  function handleEdgesChange(changes: EdgeChange[]) {
    if (mode !== "builder") {
      return;
    }
    const removeIds = changes
      .filter((change): change is EdgeChange & { type: "remove" } => change.type === "remove")
      .map((entry) => entry.id);
    if (removeIds.length === 0) {
      return;
    }
    let draft = builderSpec;
    try {
      for (const edgeId of removeIds) {
        draft = removeEdge(draft, edgeId);
      }
      applyBuilderDraft(draft);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Edge update failed.");
    }
  }

  function handleConnect(connection: Connection) {
    if (mode !== "builder" || !connection.source || !connection.target) {
      return;
    }
    try {
      applyBuilderDraft(
        addEdge(builderSpec, {
          id: nextEdgeId(builderSpec),
          from: connection.source,
          to: connection.target
        })
      );
      setNotice("Connected nodes.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Connect failed.");
    }
  }

  function deleteSelectedNode() {
    if (mode !== "builder" || !selectedNodeId) {
      return;
    }
    try {
      applyBuilderDraft(removeNode(builderSpec, selectedNodeId));
      setSelectedNodeId(null);
      setNotice("Node removed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Node removal failed.");
    }
  }

  function deleteSelectedEdge() {
    if (mode !== "builder" || !selectedEdgeId) {
      return;
    }
    try {
      applyBuilderDraft(removeEdge(builderSpec, selectedEdgeId));
      setSelectedEdgeId(null);
      setNotice("Edge removed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Edge removal failed.");
    }
  }

  function resetAutoLayout() {
    setBuilderPositions({});
    setNotice("Auto-layout restored.");
  }

  function resetBuilderFlow() {
    setBuilderSpec(BUILDER_BASE_SPEC);
    setBuilderPositions({});
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNotice("Builder reset.");
  }

  function handleExportJson() {
    const exportSpec = buildExportSpec(activeSpec, activePositions);
    downloadBlob(
      new Blob([JSON.stringify(exportSpec, null, 2)], { type: "application/json;charset=utf-8" }),
      `${activeSpec.id}.json`
    );
    setNotice("Exported JSON.");
  }

  async function handleExportPng() {
    if (!canvasCaptureRef.current) {
      return;
    }
    setBusyPngExport(true);
    try {
      const dataUrl = await toPng(canvasCaptureRef.current, {
        cacheBust: true,
        backgroundColor: "#f4f7fc",
        pixelRatio: 2
      });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${activeSpec.id}.png`;
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
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseFlowSpec(JSON.parse(text));
      const importedPositions = parsed.ui?.nodePositions ?? {};
      if (mode === "builder") {
        setBuilderSpec(parsed);
        setBuilderPositions(importedPositions);
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
      const result = await exportFlowToMiro({
        boardId: miroBoardId.trim(),
        accessToken: miroToken.trim(),
        flowSpec: activeSpec,
        positionOverrides: activePositions
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
              <select value={choice} onChange={(event) => setChoice(event.target.value as TemplateChoice)}>
                {CHOICES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sidebar-section">
              <label>Builder tools</label>
              <div className="tool-grid">
                <button type="button" draggable onDragStart={() => setDraggingKind("email")} onClick={() => appendBuilderNode("email")}>+ Email</button>
                <button type="button" draggable onDragStart={() => setDraggingKind("sms")} onClick={() => appendBuilderNode("sms")}>+ SMS</button>
                <button type="button" draggable onDragStart={() => setDraggingKind("wait")} onClick={() => appendBuilderNode("wait")}>+ Wait</button>
                <button type="button" draggable onDragStart={() => setDraggingKind("split")} onClick={() => appendBuilderNode("split")}>+ Split</button>
                <button type="button" draggable onDragStart={() => setDraggingKind("outcome")} onClick={() => appendBuilderNode("outcome")}>+ Outcome</button>
                <button type="button" draggable onDragStart={() => setDraggingKind("profileFilter")} onClick={() => appendBuilderNode("profileFilter")}>+ Filter</button>
              </div>
              <button type="button" className="reset-btn" onClick={resetAutoLayout}>Auto-layout</button>
              <button type="button" className="reset-btn" onClick={resetBuilderFlow}>Reset builder</button>
              <small className="hint">Drag a tool onto canvas or click to append.</small>
            </div>
          )}

          <div className="sidebar-section">
            <label>Miro export</label>
            <input type="text" placeholder="Board ID" value={miroBoardId} onChange={(event) => setMiroBoardId(event.target.value)} />
            <input type="password" placeholder="Access token" value={miroToken} onChange={(event) => setMiroToken(event.target.value)} />
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
              onInit={(instance) => {
                reactFlowRef.current = instance;
              }}
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              nodeTypes={nodeTypes}
              nodesDraggable={mode === "builder"}
              nodesConnectable={mode === "builder"}
              elementsSelectable
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
              }}
              onDragOver={(event) => {
                if (mode !== "builder") {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (mode !== "builder" || !draggingKind || !reactFlowRef.current) {
                  return;
                }
                event.preventDefault();
                const position = reactFlowRef.current.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY
                });
                appendBuilderNode(draggingKind, position);
                setDraggingKind(null);
              }}
              deleteKeyCode={mode === "builder" ? "Delete" : null}
              defaultEdgeOptions={{
                markerEnd: { type: MarkerType.ArrowClosed, color: "#6f7b91" }
              }}
            >
              <Background color="#d6deef" gap={24} />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
          </div>
        </main>

        <aside className="panel">
          <h2>Details</h2>
          {!selectedNode && !selectedEdge ? <p>Select a node or edge.</p> : null}

          {selectedNode ? (
            <div className="details">
              <p><b>ID:</b> {selectedNode.id}</p>
              <p><b>Type:</b> {selectedNode.type}</p>
              {"title" in selectedNode ? (
                <label>
                  Title
                  <input
                    value={selectedNode.title}
                    onChange={(event) => {
                      if (mode !== "builder") {
                        return;
                      }
                      try {
                        applyBuilderDraft(updateNodeTitle(builderSpec, selectedNode.id, event.target.value));
                      } catch (error) {
                        setNotice(error instanceof Error ? error.message : "Node update failed.");
                      }
                    }}
                  />
                </label>
              ) : null}
              {"event" in selectedNode ? (
                <label>
                  Trigger event
                  <input
                    value={selectedNode.event}
                    disabled={mode !== "builder"}
                    onChange={(event) => {
                      if (mode !== "builder") {
                        return;
                      }
                      const draft = {
                        ...builderSpec,
                        nodes: builderSpec.nodes.map((node) =>
                          node.id === selectedNode.id && node.type === "trigger"
                            ? { ...node, event: event.target.value }
                            : node
                        )
                      };
                      applyBuilderDraft(draft);
                    }}
                  />
                </label>
              ) : null}
              {"condition" in selectedNode ? (
                <label>
                  Split condition
                  <input
                    value={selectedNode.condition}
                    disabled={mode !== "builder"}
                    onChange={(event) => {
                      if (mode !== "builder") {
                        return;
                      }
                      const draft = {
                        ...builderSpec,
                        nodes: builderSpec.nodes.map((node) =>
                          node.id === selectedNode.id && node.type === "split"
                            ? { ...node, condition: event.target.value }
                            : node
                        )
                      };
                      applyBuilderDraft(draft);
                    }}
                  />
                </label>
              ) : null}
              {mode === "builder" ? (
                <button type="button" className="danger" onClick={deleteSelectedNode}>
                  Delete node
                </button>
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
                  onChange={(event) => {
                    if (mode !== "builder") {
                      return;
                    }
                    try {
                      applyBuilderDraft(updateEdgeLabel(builderSpec, selectedEdge.id, event.target.value));
                    } catch (error) {
                      setNotice(error instanceof Error ? error.message : "Edge update failed.");
                    }
                  }}
                />
              </label>
              {mode === "builder" ? (
                <button type="button" className="danger" onClick={deleteSelectedEdge}>
                  Delete edge
                </button>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </ReactFlowProvider>
  );
}
