import { useMemo, useRef, useState, type ChangeEvent } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  ReactFlowProvider,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange
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
type AppNodeData = {
  title: string;
  subtitle: string;
  nodeType: FlowNode["type"];
  selected: boolean;
};

const CHOICES: Array<{ label: string; value: TemplateChoice }> = [
  { label: "Welcome Series (test case)", value: "welcome-series" },
  { label: "Core Foundation", value: "core-foundation" },
  { label: "Growth Engine", value: "growth-engine" },
  { label: "Full System", value: "full-system" },
  { label: "Custom (imported)", value: "custom" }
];

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

function ensureChannels(spec: FlowSpec, node: FlowNode): FlowSpec {
  if (node.type !== "message") {
    return spec;
  }
  if (spec.channels.includes(node.channel)) {
    return spec;
  }
  return {
    ...spec,
    channels: [...spec.channels, node.channel]
  };
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

function nextEdgeId(spec: FlowSpec): string {
  const prefix = "edge_";
  const existing = new Set(spec.edges.map((entry) => entry.id));
  let i = 1;
  while (existing.has(`${prefix}${i}`)) {
    i += 1;
  }
  return `${prefix}${i}`;
}

export default function App() {
  const [mode, setMode] = useState<CanvasMode>("viewer");
  const [choice, setChoice] = useState<TemplateChoice>("welcome-series");
  const [customViewerSpec, setCustomViewerSpec] = useState<FlowSpec | null>(null);
  const [builderSpec, setBuilderSpec] = useState<FlowSpec>(parseFlowSpec(welcomeSeriesFixture));
  const [builderPositions, setBuilderPositions] = useState<PositionMap>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busyPngExport, setBusyPngExport] = useState(false);
  const [busyMiroExport, setBusyMiroExport] = useState(false);
  const [miroBoardId, setMiroBoardId] = useState("");
  const [miroToken, setMiroToken] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const canvasCaptureRef = useRef<HTMLDivElement | null>(null);

  const viewerSpec = useMemo(() => {
    if (choice === "custom" && customViewerSpec) {
      return customViewerSpec;
    }
    return getSpecFromChoice(choice);
  }, [choice, customViewerSpec]);

  const activeSpec = mode === "viewer" ? viewerSpec : builderSpec;
  const activePositions =
    mode === "builder" ? builderPositions : (activeSpec.ui?.nodePositions ?? {});

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
          position: { x: node.x, y: node.y },
          data: {
            title: node.title,
            subtitle: raw ? nodeSubtitle(raw) : node.type,
            nodeType: node.type,
            selected: selectedNodeId === node.id
          },
          style: {
            width: node.width,
            minHeight: node.height,
            borderRadius: 10,
            border: "1px solid #c6cde2",
            padding: 12,
            boxShadow: "0 3px 10px rgba(17,29,72,0.08)",
            background: "#fff",
            fontSize: 12
          },
          dragHandle: ".node-title",
          draggable: mode === "builder",
          type: "default"
        };
      }),
    [layout.nodes, activeSpec.nodes, mode, selectedNodeId]
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      activeSpec.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.label,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#727a8a" },
        style: { stroke: "#727a8a", strokeWidth: 2 },
        labelStyle: { fill: "#5b6072", fontWeight: 700, fontSize: 12 },
        animated: false
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
    const validNodeIds = new Set(parsed.data.nodes.map((node) => node.id));
    const cleanedPositions: PositionMap = {};
    for (const [key, value] of Object.entries(nextPositions)) {
      if (validNodeIds.has(key)) {
        cleanedPositions[key] = value;
      }
    }
    setBuilderSpec(parsed.data);
    setBuilderPositions(cleanedPositions);
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
    let draft = deepClone(builderSpec);
    for (const edgeId of removeIds) {
      try {
        draft = removeEdge(draft, edgeId);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Edge removal failed.");
      }
    }
    applyBuilderDraft(draft);
  }

  function handleConnect(connection: Connection) {
    if (mode !== "builder" || !connection.source || !connection.target) {
      return;
    }
    try {
      const draft = addEdge(builderSpec, {
        id: nextEdgeId(builderSpec),
        from: connection.source,
        to: connection.target
      });
      applyBuilderDraft(draft);
      setNotice("Connected nodes.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Connect failed.");
    }
  }

  function updateSelectedNode(mutator: (draft: FlowSpec, nodeId: string) => FlowSpec) {
    if (mode !== "builder" || !selectedNodeId) {
      return;
    }
    try {
      const draft = mutator(builderSpec, selectedNodeId);
      applyBuilderDraft(draft);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Node update failed.");
    }
  }

  function addBuilderNode(kind: "email" | "sms" | "wait" | "split" | "outcome" | "profileFilter") {
    if (mode !== "builder") {
      return;
    }
    const baseId = `${kind}_${Date.now()}`;
    const id = sanitizeId(baseId);
    const draftBase = deepClone(builderSpec);
    let node: FlowNode;

    if (kind === "email") {
      node = { id, type: "message", channel: "email", title: "Email" };
    } else if (kind === "sms") {
      node = { id, type: "message", channel: "sms", title: "SMS" };
    } else if (kind === "wait") {
      node = { id, type: "wait", duration: { ...builderSpec.defaults.delay } };
    } else if (kind === "split") {
      node = {
        id,
        type: "split",
        title: "Conditional Split",
        condition: "Condition",
        labels: { yes: "Yes", no: "No" }
      };
    } else if (kind === "profileFilter") {
      node = { id, type: "profileFilter", title: "Profile Filters", filters: ["Filter"] };
    } else {
      node = { id, type: "outcome", title: "Outcome", result: "Completed" };
    }

    let draft = ensureChannels(draftBase, node);
    draft = addNode(draft, node);
    const from = selectedNodeId ?? draft.nodes.find((entry) => entry.type === "trigger")?.id;
    if (from) {
      draft = addEdge(draft, { id: nextEdgeId(draft), from, to: id });
    }

    if (kind === "split") {
      const yesId = `${id}_yes_outcome`;
      const noId = `${id}_no_outcome`;
      draft = addNode(draft, { id: yesId, type: "outcome", title: "Yes Outcome", result: "Yes path" });
      draft = addNode(draft, { id: noId, type: "outcome", title: "No Outcome", result: "No path" });
      draft = addEdge(draft, { id: nextEdgeId(draft), from: id, to: yesId, label: "Yes" });
      draft = addEdge(draft, { id: nextEdgeId(draft), from: id, to: noId, label: "No" });
    }

    applyBuilderDraft(draft);
    setSelectedNodeId(id);
    setNotice("Node added.");
  }

  function deleteSelectedNode() {
    if (mode !== "builder" || !selectedNodeId) {
      return;
    }
    try {
      const draft = removeNode(builderSpec, selectedNodeId);
      applyBuilderDraft(draft);
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
      const draft = removeEdge(builderSpec, selectedEdgeId);
      applyBuilderDraft(draft);
      setSelectedEdgeId(null);
      setNotice("Edge removed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Edge removal failed.");
    }
  }

  function resetAutoLayout() {
    if (mode !== "builder") {
      return;
    }
    setBuilderPositions({});
    setNotice("Auto-layout restored.");
  }

  function downloadBlob(content: Blob, filename: string) {
    const url = URL.createObjectURL(content);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
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
        backgroundColor: "#f3f4f7",
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
      setNotice("Enter Miro board ID and access token first.");
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
      setNotice(
        `Exported to Miro: ${result.shapeCount} shapes, ${result.connectorCount} connectors.`
      );
    } catch (error) {
      if (typeof error === "object" && error && "status" in error) {
        const status = String((error as { status: number }).status);
        setNotice(`Miro export failed (status ${status}). Check token/board access.`);
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
          <button
            className={`sidebar-btn ${mode === "viewer" ? "active" : ""}`}
            type="button"
            onClick={() => setMode("viewer")}
          >
            👁 Viewer
          </button>
          <button
            className={`sidebar-btn ${mode === "builder" ? "active" : ""}`}
            type="button"
            onClick={() => setMode("builder")}
          >
            ✏ Builder
          </button>

          {mode === "viewer" ? (
            <div className="sidebar-section">
              <label>Preset</label>
              <select value={choice} onChange={(event) => setChoice(event.target.value as TemplateChoice)}>
                {CHOICES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sidebar-section">
              <label>Builder tools</label>
              <div className="tool-grid">
                <button type="button" onClick={() => addBuilderNode("email")}>+ Email</button>
                <button type="button" onClick={() => addBuilderNode("sms")}>+ SMS</button>
                <button type="button" onClick={() => addBuilderNode("wait")}>+ Wait</button>
                <button type="button" onClick={() => addBuilderNode("split")}>+ Split</button>
                <button type="button" onClick={() => addBuilderNode("outcome")}>+ Outcome</button>
                <button type="button" onClick={() => addBuilderNode("profileFilter")}>+ Filter</button>
              </div>
              <button type="button" className="reset-btn" onClick={resetAutoLayout}>
                Auto-layout
              </button>
            </div>
          )}

          <div className="sidebar-section">
            <label>Miro</label>
            <input
              type="text"
              value={miroBoardId}
              placeholder="Board ID"
              onChange={(event) => setMiroBoardId(event.target.value)}
            />
            <input
              type="password"
              value={miroToken}
              placeholder="Access token"
              onChange={(event) => setMiroToken(event.target.value)}
            />
            <button type="button" onClick={handleExportMiro} disabled={busyMiroExport}>
              {busyMiroExport ? "Exporting..." : "Export to Miro"}
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="toolbar">
            <button type="button" onClick={handleExportJson}>📥 Export JSON</button>
            <button type="button" onClick={handleExportPng} disabled={busyPngExport}>
              {busyPngExport ? "Exporting..." : "🖼 Export PNG"}
            </button>
            <button type="button" onClick={() => importInputRef.current?.click()}>📤 Import JSON</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden-input"
              onChange={handleImportJson}
            />
            {notice ? <span className="notice">{notice}</span> : null}
          </header>

          <div className="canvas-wrap" ref={canvasCaptureRef}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
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
              deleteKeyCode={mode === "builder" ? "Delete" : null}
              defaultEdgeOptions={{
                markerEnd: { type: MarkerType.ArrowClosed, color: "#727a8a" }
              }}
            >
              <Background color="#d2d8e8" gap={24} />
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
                        const updated = updateNodeTitle(builderSpec, selectedNode.id, event.target.value);
                        applyBuilderDraft(updated);
                      } catch (error) {
                        setNotice(error instanceof Error ? error.message : "Update failed.");
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
                    onChange={(event) =>
                      updateSelectedNode((draft, nodeId) => ({
                        ...draft,
                        nodes: draft.nodes.map((node) =>
                          node.id === nodeId && node.type === "trigger"
                            ? { ...node, event: event.target.value }
                            : node
                        )
                      }))
                    }
                  />
                </label>
              ) : null}
              {"condition" in selectedNode ? (
                <label>
                  Split condition
                  <input
                    value={selectedNode.condition}
                    disabled={mode !== "builder"}
                    onChange={(event) =>
                      updateSelectedNode((draft, nodeId) => ({
                        ...draft,
                        nodes: draft.nodes.map((node) =>
                          node.id === nodeId && node.type === "split"
                            ? { ...node, condition: event.target.value }
                            : node
                        )
                      }))
                    }
                  />
                </label>
              ) : null}
              {"duration" in selectedNode ? (
                <label>
                  Wait value
                  <input
                    type="number"
                    min={1}
                    value={selectedNode.duration.value}
                    disabled={mode !== "builder"}
                    onChange={(event) =>
                      updateSelectedNode((draft, nodeId) => ({
                        ...draft,
                        nodes: draft.nodes.map((node) =>
                          node.id === nodeId && node.type === "wait"
                            ? {
                                ...node,
                                duration: {
                                  ...node.duration,
                                  value: Math.max(1, Number(event.target.value || 1))
                                }
                              }
                            : node
                        )
                      }))
                    }
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
                      const updated = updateEdgeLabel(builderSpec, selectedEdge.id, event.target.value);
                      applyBuilderDraft(updated);
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
