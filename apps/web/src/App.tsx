import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge as rfAddEdge,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import { type FlowSpec, type FlowType } from "@flow/core";
import { ThemeProvider, useTheme } from "./components/ThemeProvider";
import { toast, Toaster } from "sonner";

import type { AppTab, NodeCallbacks } from "./types/flow";
import { EDGE_STYLE } from "./constants";
import { FlowCanvasNode } from "./components/FlowCanvasNode";
import { SmartEdge } from "./components/SmartEdge";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrandQuestionnaire } from "./components/BrandQuestionnaire";
import { specToRfEdges, specToRfNodes } from "./utils/flowHelpers";

import { useGenerateFlow } from "./hooks/useGenerateFlow";
import { useEditorFlow } from "./hooks/useEditorFlow";
import { useFlowCanvas } from "./hooks/useFlowCanvas";
import { useNodeActions } from "./hooks/useNodeActions";
import { useExportImport } from "./hooks/useExportImport";

import { AppNavbar } from "./components/AppNavbar";
import { MainCanvas } from "./components/MainCanvas";
import { DetailsPanel } from "./components/DetailsPanel";
import { LibrarySidebar } from "./components/LibrarySidebar";
import { GenerateSidebar } from "./components/GenerateSidebar";
import { EditorSidebar } from "./components/EditorSidebar";
import { ExportSection } from "./components/ExportSection";
import { FlowSpecModal } from "./components/FlowSpecModal";

function AppInner() {
  const { theme } = useTheme();

  // Shared state — used across multiple hooks and components.
  const [tab, setTab] = useState<AppTab>("generate");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [libraryActiveType, setLibraryActiveType] = useState<FlowType>("email-welcome");

  const canvasCaptureRef = useRef<HTMLDivElement>(null);
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const nodeCallbacksRef = useRef<NodeCallbacks | null>(null);
  const nodeTypes = useMemo(() => ({ flowNode: FlowCanvasNode }), []);
  const edgeTypes = useMemo(() => ({ smartEdge: SmartEdge }), []);

  const isEditorActive = tab === "editor";

  // Feature hooks — each owns a slice of state and its handlers.
  const generate = useGenerateFlow(tab);

  const editor = useEditorFlow({
    selectedNodeId, selectedEdgeId,
    setSelectedNodeId, setSelectedEdgeId,
    setTab,
  });

  const canvas = useFlowCanvas({
    activeGenFlow: generate.activeGenFlow,
    isEditorActive,
    activeFlowIndex: generate.activeFlowIndex,
    tab,
    editorNodes: editor.editorNodes,
    editorEdges: editor.editorEdges,
    correctedGenCacheRef: generate.correctedGenCacheRef,
    selectedNodeId,
    selectedEdgeId,
    nodeCallbacksRef,
    setEditorNodes: editor.setEditorNodes,
  });

  const actions = useNodeActions({
    isEditorActive,
    tab,
    genResult: generate.genResult,
    setGenResult: generate.setGenResult,
    activeFlowIndex: generate.activeFlowIndex,
    selectedNodeId,
    setSelectedNodeId,
    setEditorNodes: editor.setEditorNodes,
    setEditorEdges: editor.setEditorEdges,
    updateEditorNodeData: editor.updateEditorNodeData,
    genBrand: generate.genBrand,
    genUrl: generate.genUrl,
    flowNodes: canvas.flowNodes,
  });

  // Keep the ref in sync so useFlowCanvas can inject callbacks into nodes.
  nodeCallbacksRef.current = actions.nodeCallbacks;

  const exportImport = useExportImport({
    isEditorActive,
    isMultiFlowEditor: editor.isMultiFlowEditor,
    tab,
    activeGenFlow: generate.activeGenFlow,
    genResult: generate.genResult,
    editorNodes: editor.editorNodes,
    editorEdges: editor.editorEdges,
    editorFlows: editor.editorFlows,
    activeEditorFlowIndex: editor.activeEditorFlowIndex,
    setEditorNodes: editor.setEditorNodes,
    setEditorEdges: editor.setEditorEdges,
    setEditorFlows: editor.setEditorFlows,
    setActiveEditorFlowIndex: editor.setActiveEditorFlowIndex,
    setSelectedNodeId,
    setSelectedEdgeId,
    setTab,
    flowNodes: canvas.flowNodes,
    theme,
    canvasCaptureRef,
  });

  // Re-fit the view once node heights have been measured and corrected.
  useEffect(() => {
    if (canvas.didReposition && reactFlowRef.current) {
      requestAnimationFrame(() => reactFlowRef.current?.fitView({ duration: 200 }));
    }
  }, [canvas.didReposition]);

  // Loads a flow from Generate/Library into the Editor tab, reusing
  // already-positioned canvas nodes when their IDs match the spec.
  function openFlowInEditor(spec: FlowSpec) {
    const currentIds = new Set(canvas.flowNodes.map((n) => n.id));
    const specIds = new Set(spec.nodes.map((n) => n.id));
    const match = specIds.size > 0 && [...specIds].every((id) => currentIds.has(id));

    if (match) {
      editor.setEditorNodes(canvas.flowNodes.map((n) => ({ ...n, draggable: undefined })));
      editor.setEditorEdges([...canvas.flowEdges]);
    } else {
      const nodes = specToRfNodes(spec);
      editor.setEditorNodes(nodes);
      editor.setEditorEdges(specToRfEdges(spec, nodes));
    }
    editor.setEditorFlows([]);
    editor.setActiveEditorFlowIndex(0);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setTab("editor");
    toast.success(`Loaded "${spec.name}" into editor.`);
  }

  function switchTab(next: AppTab) {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setTab(next);
  }

  // ReactFlow event handlers — bridge between canvas events and state.
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (isEditorActive) {
      // Filter 'remove' changes: deletions are handled explicitly to avoid
      // ReactFlow de-sync glitches.
      const safe = changes.filter((c) => c.type !== "remove");
      if (safe.length > 0) editor.setEditorNodes((nds) => applyNodeChanges(safe, nds));
    }
    canvas.autoNodesChange(changes);
  }, [isEditorActive, canvas.autoNodesChange, editor.setEditorNodes]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (!isEditorActive) return;
    editor.setEditorEdges((eds) => applyEdgeChanges(changes, eds));
  }, [isEditorActive, editor.setEditorEdges]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!isEditorActive || !connection.source || !connection.target) return;
    editor.setEditorEdges((eds) => rfAddEdge({ ...connection, ...EDGE_STYLE }, eds));
    toast.success("Connected nodes.");
  }, [isEditorActive, editor.setEditorEdges]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ReactFlowProvider>
      <div className="flex h-screen overflow-hidden bg-background">

        {/* Left sidebar */}
        <aside className="w-[290px] flex-shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col overflow-y-auto">
          <div className="flex items-center px-5 h-[52px] border-b border-sidebar-border shrink-0">
            <span className="text-base font-bold text-foreground tracking-tight">Flow Gameplan Creator</span>
          </div>
          <div className="flex-1 px-3 py-4 flex flex-col gap-4">
            {tab === "library" && (
              <LibrarySidebar
                activeType={libraryActiveType}
                onTypeChange={setLibraryActiveType}
              />
            )}
            {tab === "generate" && (
              <GenerateSidebar
                genStep={generate.genStep}
                genResult={generate.genResult}
                genBusy={generate.genBusy}
                genError={generate.genError}
                genPlan={generate.genPlan}
                onPlanChange={generate.setGenPlan}
                genUrl={generate.genUrl}
                onUrlChange={generate.setGenUrl}
                genBrand={generate.genBrand}
                onBrandChange={generate.setGenBrand}
                customFlowText={generate.customFlowText}
                onOpenFlowSpec={() => generate.setFlowSpecModalOpen(true)}
                questionnaireAnsweredCount={generate.questionnaireAnsweredCount}
                hasFilloutData={generate.hasFilloutData}
                onOpenQuestionnaire={() => generate.setQuestionnaireOpen(true)}
                activeFlowIndex={generate.activeFlowIndex}
                onFlowIndexChange={generate.setActiveFlowIndex}
                onOpenInEditor={openFlowInEditor}
                onExportAll={exportImport.handleExportAllJson}
                onReset={generate.resetGeneration}
                onGenerate={generate.handleGenerate}
              />
            )}
            {tab === "editor" && (
              <EditorSidebar
                isMultiFlowEditor={editor.isMultiFlowEditor}
                editorFlows={editor.editorFlows}
                activeEditorFlowIndex={editor.activeEditorFlowIndex}
                editorPreset={editor.editorPreset}
                onSwitchFlow={editor.switchEditorFlow}
                onPresetChange={(val) => {
                  editor.setEditorPreset(val);
                  if (val) editor.loadPresetIntoEditor(val);
                }}
                onAddNode={editor.appendEditorNode}
                onReset={editor.resetEditorFlow}
              />
            )}
          </div>
          {tab !== "library" && (
            <ExportSection
              tab={tab}
              isEditorActive={isEditorActive}
              isMultiFlowEditor={editor.isMultiFlowEditor}
              hasContent={canvas.hasContent}
              busyPngExport={exportImport.busyPngExport}
              busyMiroExport={exportImport.busyMiroExport}
              miroBoardId={exportImport.miroBoardId}
              onMiroBoardIdChange={exportImport.setMiroBoardId}
              onExportJson={exportImport.handleExportJson}
              onExportPng={exportImport.handleExportPng}
              onImportJson={exportImport.handleImportJson}
              onExportAllEditorFlows={exportImport.handleExportAllEditorFlows}
              onExportMiro={exportImport.handleExportMiro}
              genResult={generate.genResult}
            />
          )}
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <AppNavbar tab={tab} onTabChange={switchTab} />
          <MainCanvas
            tab={tab}
            genStep={generate.genStep}
            genBusy={generate.genBusy}
            genResult={generate.genResult}
            activeFlowIndex={generate.activeFlowIndex}
            activeEditorFlowIndex={editor.activeEditorFlowIndex}
            isEditorActive={isEditorActive}
            libraryActiveType={libraryActiveType}
            nodes={canvas.flowNodes}
            edges={canvas.flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            theme={theme}
            canvasCaptureRef={canvasCaptureRef}
            reactFlowRef={reactFlowRef}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeSelect={(nodeId) => { setSelectedNodeId(nodeId); setSelectedEdgeId(null); }}
            onEdgeSelect={(edgeId) => { setSelectedEdgeId(edgeId); setSelectedNodeId(null); }}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
            onDropNode={editor.appendEditorNode}
            chatMessages={generate.chatMessages}
            chatLoading={generate.chatLoading}
            onChatSend={generate.handleChatSend}
            onClearChat={() => generate.setChatMessages([])}
          />
        </main>

        {/* Right details panel */}
        {tab !== "library" && (
          <DetailsPanel
            selectedFlowNode={canvas.selectedFlowNode}
            selectedEdge={canvas.selectedEdge}
            isEditorActive={isEditorActive}
            onUpdateNodeData={editor.updateEditorNodeData}
            onUpdateEdgeLabel={editor.updateEditorEdgeLabel}
            onDeleteNode={editor.deleteSelectedNode}
            onDeleteEdge={editor.deleteSelectedEdge}
          />
        )}
      </div>

      {/* Dialogs */}
      <FlowSpecModal
        open={generate.flowSpecModalOpen}
        onOpenChange={generate.setFlowSpecModalOpen}
        value={generate.customFlowText}
        onChange={generate.setCustomFlowText}
        disabled={generate.genBusy}
        infoOpen={generate.flowSpecInfoOpen}
        onInfoToggle={() => generate.setFlowSpecInfoOpen((v) => !v)}
      />
      <BrandQuestionnaire
        open={generate.questionnaireOpen}
        onOpenChange={generate.setQuestionnaireOpen}
        data={generate.questionnaireData}
        onSave={generate.setQuestionnaireData}
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
