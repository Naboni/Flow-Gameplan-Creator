import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
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
} from "reactflow";
import { parseFlowSpecSafe, type FlowNode, type FlowSpec } from "@flow/core";
import { buildLayout } from "@flow/layout";
import { exportFlowToMiro } from "@flow/miro";
import { toPng } from "html-to-image";

import type { AppNodeData, AppTab, BrandProfile, GeneratedResult, NodeKind, PlanKey, TemplateChoice } from "./types/flow";
import { API_BASE, EDGE_STYLE, PLAN_OPTIONS, VIEWER_CHOICES, rfContainerWidth } from "./constants";
import { FlowCanvasNode } from "./components/FlowCanvasNode";
import { SmartEdge } from "./components/SmartEdge";
import { ErrorBoundary } from "./components/ErrorBoundary";
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

function AppInner() {
  const [tab, setTab] = useState<AppTab>("generate");

  /* generate tab */
  const [genPlan, setGenPlan] = useState<PlanKey>("core-foundation");
  const [genUrl, setGenUrl] = useState("");
  const [genBrand, setGenBrand] = useState("");
  const [genNotes, setGenNotes] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genStep, setGenStep] = useState<"form" | "analyzing" | "generating" | "done">("form");
  const [genResult, setGenResult] = useState<GeneratedResult | null>(null);
  const [genError, setGenError] = useState("");
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);

  /* viewer tab */
  const [viewerChoice, setViewerChoice] = useState<TemplateChoice>("welcome-series");
  const [customViewerSpec, setCustomViewerSpec] = useState<FlowSpec | null>(null);

  /* editor tab */
  const [editorNodes, setEditorNodes] = useState<Node<AppNodeData>[]>([]);
  const [editorEdges, setEditorEdges] = useState<Edge[]>([]);

  /* shared */
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

  /* ── computed specs and nodes ── */

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
    () => specToRfEdges(viewerSpec, viewerNodes),
    [viewerSpec, viewerNodes]
  );

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
  const flowNodes = isEditorActive ? editorNodes : (tab === "generate" && activeGenFlow ? genNodes : viewerNodes);
  const flowEdges = isEditorActive ? editorEdges : (tab === "generate" && activeGenFlow ? genEdges : viewerEdges);

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

  function openFlowInEditor(spec: FlowSpec) {
    const nodes = specToRfNodes(spec);
    setEditorNodes(nodes);
    setEditorEdges(specToRfEdges(spec, nodes));
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

  /* ── export / import ── */

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

      const single = Array.isArray(raw) ? raw[0] : raw;
      if (!single || !Array.isArray(single.nodes) || !Array.isArray(single.edges)) {
        setNotice("Invalid flow JSON — missing nodes or edges.");
        return;
      }

      let spec: FlowSpec;
      const result = parseFlowSpecSafe(single);
      if (result.success) {
        spec = result.data;
      } else {
        spec = single as FlowSpec;
      }

      const nodes = specToRfNodes(spec);
      setEditorNodes(nodes);
      setEditorEdges(specToRfEdges(spec, nodes));
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

  function switchTab(next: AppTab) {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setTab(next);
  }

  /* ── render ── */

  return (
    <ReactFlowProvider>
      <div className="shell">
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

          {/* generate sidebar */}
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

          {/* viewer sidebar */}
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

          {/* editor sidebar */}
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

          {/* miro export */}
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
            {(() => {
              const hasContent = isEditorActive
                ? editorNodes.length > 0
                : tab === "generate"
                  ? !!activeGenFlow
                  : true;
              return (
                <>
                  <button type="button" onClick={handleExportJson} disabled={!hasContent}>Export JSON</button>
                  <button type="button" onClick={handleExportPng} disabled={!hasContent || busyPngExport}>
                    {busyPngExport ? "Exporting..." : "Export PNG"}
                  </button>
                  {isEditorActive && (
                    <>
                      <button type="button" onClick={() => importInputRef.current?.click()}>Import JSON</button>
                      <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden-input" onChange={handleImportJson} />
                    </>
                  )}
                </>
              );
            })()}
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
