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
import { parseFlowSpecSafe, FLOW_TYPE_LABELS, type FlowNode, type FlowSpec, type FlowType } from "@flow/core";
import { buildLayout } from "@flow/layout";
import { exportFlowToMiro } from "@flow/miro";
import { toPng } from "html-to-image";
import { Pencil, Download, RotateCcw, FileJson, Image, Upload, Send } from "lucide-react";

import type { AppNodeData, AppTab, BrandProfile, GeneratedResult, NodeKind, PlanKey, TemplateChoice } from "./types/flow";
import { API_BASE, EDGE_STYLE, PLAN_OPTIONS, VIEWER_CHOICES, rfContainerWidth } from "./constants";
import { FlowCanvasNode } from "./components/FlowCanvasNode";
import { SmartEdge } from "./components/SmartEdge";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LibraryView, FLOW_TYPES } from "./components/LibraryView";
import { CustomPlanBuilder } from "./components/CustomPlanBuilder";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const [genPlan, setGenPlan] = useState<PlanKey>("custom");
  const [genUrl, setGenUrl] = useState("");
  const [genBrand, setGenBrand] = useState("");
  const [genNotes, setGenNotes] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genStep, setGenStep] = useState<"form" | "analyzing" | "generating" | "done">("form");
  const [genResult, setGenResult] = useState<GeneratedResult | null>(null);
  const [genError, setGenError] = useState("");
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);
  const [customTemplateIds, setCustomTemplateIds] = useState<string[]>([]);

  /* library tab */
  const [libraryActiveType, setLibraryActiveType] = useState<FlowType>("email-welcome");

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

  const hasContent = isEditorActive
    ? editorNodes.length > 0
    : tab === "generate"
      ? !!activeGenFlow
      : tab !== "library";

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

  const handleCustomSelectionChange = useCallback((ids: string[]) => {
    setCustomTemplateIds(ids);
  }, []);

  async function handleGenerate() {
    if (!genUrl.trim() || !genBrand.trim()) {
      setGenError("Please enter a website URL and brand name.");
      return;
    }
    if (genPlan === "custom" && customTemplateIds.length === 0) {
      setGenError("Select at least one template from the library.");
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
      const genBody = genPlan === "custom"
        ? { customTemplateIds, brandProfile: profile }
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
      const dataUrl = await toPng(canvasCaptureRef.current, { cacheBust: true, backgroundColor: "#f8fafc", pixelRatio: 2 });
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

  const TAB_ITEMS: { value: AppTab; label: string; primary?: boolean }[] = [
    { value: "generate", label: "Generate", primary: true },
    { value: "library", label: "Library", primary: true },
    { value: "viewer", label: "Viewer" },
    { value: "editor", label: "Editor" },
  ];

  return (
    <ReactFlowProvider>
      <div className="flex h-screen overflow-hidden">
          {/* ── sidebar ── */}
          <aside className="w-[260px] flex-shrink-0 border-r border-border bg-white flex flex-col overflow-y-auto">
            <div className="px-4 pt-4 pb-2">
              <h1 className="text-lg font-bold text-slate-900">Flow Gameplan</h1>
            </div>
            <div className="flex-1 p-4 pt-2 flex flex-col gap-3">
              {/* library sidebar */}
              {tab === "library" && (
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Flow Types</p>
                  {FLOW_TYPES.map((ft) => (
                    <button
                      key={ft}
                      type="button"
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                        ft === libraryActiveType
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-muted font-medium"
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
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Generated flows — {genResult.planName}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{genResult.brandName} · {genResult.flows.length} flows</p>
                    </div>
                    <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
                      {genResult.flows.map((flow, idx) => (
                        <button
                          key={flow.id}
                          type="button"
                          className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors truncate ${
                            idx === activeFlowIndex
                              ? "bg-primary/10 text-primary border border-primary/30"
                              : "text-foreground hover:bg-muted border border-transparent"
                          }`}
                          onClick={() => setActiveFlowIndex(idx)}
                        >
                          {flow.name}
                        </button>
                      ))}
                    </div>
                    <Separator />
                    <div className="flex flex-col gap-2">
                      <Button size="sm" onClick={() => openFlowInEditor(genResult.flows[activeFlowIndex])}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        Edit in Editor
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleExportAllJson}>
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Export All (JSON)
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setGenStep("form"); setGenResult(null); }}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        New Generation
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="gen-plan">Plan</Label>
                      <select
                        id="gen-plan"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={genPlan}
                        onChange={(e) => setGenPlan(e.target.value as PlanKey)}
                        disabled={genBusy}
                      >
                        {PLAN_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">{PLAN_OPTIONS.find((p) => p.value === genPlan)?.desc}</p>
                    </div>

                    {genPlan === "custom" && (
                      <div className="flex flex-col gap-1.5">
                        <Label>Select templates</Label>
                        <CustomPlanBuilder disabled={genBusy} onSelectionChange={handleCustomSelectionChange} />
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="gen-url">Client website URL</Label>
                      <Input id="gen-url" type="url" placeholder="https://example.com" value={genUrl} onChange={(e) => setGenUrl(e.target.value)} disabled={genBusy} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="gen-brand">Brand name</Label>
                      <Input id="gen-brand" type="text" placeholder="Brand Name" value={genBrand} onChange={(e) => setGenBrand(e.target.value)} disabled={genBusy} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="gen-notes">Additional notes (optional)</Label>
                      <Textarea
                        id="gen-notes"
                        rows={3}
                        placeholder="Products, audience, tone, discount codes..."
                        value={genNotes}
                        onChange={(e) => setGenNotes(e.target.value)}
                        disabled={genBusy}
                      />
                    </div>

                    <Button className="mt-1" onClick={handleGenerate} disabled={genBusy}>
                      {genBusy
                        ? genStep === "analyzing" ? "Analyzing brand..." : "Generating flows..."
                        : <>Generate Gameplan</>
                      }
                    </Button>

                    {genError && <p className="text-sm font-medium text-destructive">{genError}</p>}
                  </div>
                )
              )}

              {/* viewer sidebar */}
              {tab === "viewer" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="viewer-preset">Preset</Label>
                  <select
                    id="viewer-preset"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={viewerChoice}
                    onChange={(e) => setViewerChoice(e.target.value as TemplateChoice)}
                  >
                    {VIEWER_CHOICES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* editor sidebar */}
              {tab === "editor" && (
                <div className="flex flex-col gap-3">
                  {([
                    { label: "Actions", kinds: ["trigger", "email", "sms", "outcome"] as NodeKind[] },
                    { label: "Timing", kinds: ["wait"] as NodeKind[] },
                    { label: "Logic", kinds: ["split", "profileFilter"] as NodeKind[] },
                    { label: "Annotations", kinds: ["note", "strategy"] as NodeKind[] }
                  ]).map((category) => (
                    <div key={category.label}>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">{category.label}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {category.kinds.map((kind) => {
                          const displayLabel = kind === "profileFilter" ? "Filter" : kind.charAt(0).toUpperCase() + kind.slice(1);
                          return (
                            <button key={kind} type="button" draggable
                              onDragStart={(e) => { e.dataTransfer.setData("application/flow-node-kind", kind); e.dataTransfer.effectAllowed = "move"; }}
                              onClick={() => appendEditorNode(kind)}
                              className={`h-9 rounded-md border text-sm font-medium cursor-grab transition-colors ${
                                kind === "note"
                                  ? "bg-orange-50 border-orange-300 text-orange-800 hover:bg-orange-100"
                                  : kind === "strategy"
                                    ? "bg-gradient-to-br from-orange-50 to-orange-100 border-orange-400 text-orange-700 hover:from-orange-100 hover:to-orange-200"
                                    : "bg-white border-input text-foreground hover:bg-muted"
                              }`}
                            >+ {displayLabel}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={resetEditorFlow}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Reset editor
                  </Button>
                  <p className="text-xs text-muted-foreground">Drag a tool onto canvas or click to append.</p>
                </div>
              )}
            </div>

            {/* ── export section (bottom of sidebar) ── */}
            {tab !== "library" && (
              <div className="border-t border-border p-4 flex flex-col gap-2">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Export</p>
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
                  </>
                )}
                <Separator className="my-1" />
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Miro</p>
                <Input className="h-8 text-xs" placeholder="Board ID" value={miroBoardId} onChange={(e) => setMiroBoardId(e.target.value)} />
                <Input className="h-8 text-xs" type="password" placeholder="Access token" value={miroToken} onChange={(e) => setMiroToken(e.target.value)} />
                <Button variant="outline" size="sm" onClick={handleExportMiro} disabled={busyMiroExport}>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {busyMiroExport ? "Exporting..." : "Export to Miro"}
                </Button>
              </div>
            )}
          </aside>

          {/* ── main area ── */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* tab bar */}
            <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-border">
              <nav className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {TAB_ITEMS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => switchTab(t.value)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                      tab === t.value
                        ? t.primary
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-white text-foreground shadow-sm"
                        : t.primary
                          ? "text-primary hover:bg-primary/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/60"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
              {notice && <span className="ml-auto text-sm font-medium text-emerald-600">{notice}</span>}
            </div>

            {/* canvas / content */}
            <div className="flex-1 bg-slate-50" ref={canvasCaptureRef}>
              {tab === "library" ? (
                <LibraryView activeType={libraryActiveType} />
              ) : tab === "generate" && genStep !== "done" ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md px-6">
                    {genBusy ? (
                      <>
                        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-muted-foreground">{genStep === "analyzing" ? "Analyzing brand website..." : "Generating tailored flows..."}</p>
                        <p className="text-xs text-muted-foreground mt-2">This may take 30-60 seconds depending on the plan size.</p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-xl font-semibold text-foreground mb-3">Generate a Flow Gameplan</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">Fill in the client details in the sidebar and click <b>Generate Gameplan</b>.</p>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-2">The platform will analyze the brand and create a complete set of tailored email/SMS flows.</p>
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
          {tab !== "library" && (
          <aside className="w-[320px] flex-shrink-0 border-l border-border bg-white p-4 overflow-y-auto">
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

                {"body" in selectedFlowNode && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Body</Label>
                    <Textarea value={selectedFlowNode.body} disabled={!isEditorActive} rows={6}
                      onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "note" ? { ...fn, body: e.target.value } : fn); }} />
                  </div>
                )}

                {"copyHint" in selectedFlowNode && selectedFlowNode.copyHint && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Copy hint</Label>
                    <Textarea value={selectedFlowNode.copyHint} disabled rows={3} />
                  </div>
                )}

                {"primaryFocus" in selectedFlowNode && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label>Primary focus</Label>
                      <Textarea value={selectedFlowNode.primaryFocus} disabled={!isEditorActive} rows={3}
                        onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "strategy" ? { ...fn, primaryFocus: e.target.value } : fn); }} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Secondary focus</Label>
                      <Textarea value={selectedFlowNode.secondaryFocus} disabled={!isEditorActive} rows={3}
                        onChange={(e) => { if (!isEditorActive) return; updateEditorNodeData(selectedFlowNode.id, (fn) => fn.type === "strategy" ? { ...fn, secondaryFocus: e.target.value } : fn); }} />
                    </div>
                    {"branchLabel" in selectedFlowNode && selectedFlowNode.branchLabel && (
                      <p className="text-sm"><b>Branch:</b> {selectedFlowNode.branchLabel === "yes" ? "Yes (purchaser)" : "No (non-purchaser)"}</p>
                    )}
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
