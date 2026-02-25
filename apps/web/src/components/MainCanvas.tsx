import type { ComponentType } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import { LibraryView } from "./LibraryView";
import { ChatPanel, type ChatMessage } from "./ChatPanel";
import { EDGE_STYLE } from "../constants";
import type { AppNodeData, AppTab, GeneratedResult, NodeKind } from "../types/flow";
import type { FlowType } from "@flow/core";

export interface MainCanvasProps {
  /** The currently active tab. */
  tab: AppTab;
  /** Current stage of the generation pipeline. */
  genStep: "form" | "analyzing" | "generating" | "done";
  /** `true` while a generation API call is in flight. */
  genBusy: boolean;
  /** The completed generation result, or `null`. */
  genResult: GeneratedResult | null;
  /**
   * Used as part of the ReactFlow `key` prop on the Generate tab to force a
   * remount when the user switches between generated flows.
   */
  activeFlowIndex: number;
  /**
   * Used as part of the ReactFlow `key` prop on the Editor tab to force a
   * remount when the user switches between editor flows.
   */
  activeEditorFlowIndex: number;
  /** `true` when the Editor tab is active. */
  isEditorActive: boolean;

  // ── Library tab ──────────────────────────────────────────────────────────

  /** Flow type currently selected in the Library tab. */
  libraryActiveType: FlowType;

  // ── ReactFlow canvas ─────────────────────────────────────────────────────

  /** Nodes to render on the canvas. */
  nodes: Node<AppNodeData>[];
  /** Edges to render on the canvas. */
  edges: Edge[];
  /** Memoized ReactFlow node-type map (`{ flowNode: FlowCanvasNode }`). */
  nodeTypes: Record<string, ComponentType<any>>;
  /** Memoized ReactFlow edge-type map (`{ smartEdge: SmartEdge }`). */
  edgeTypes: Record<string, ComponentType<any>>;
  /** Current UI theme, used to set the background dot/grid colour. */
  theme: string;
  /**
   * Ref attached to the outer wrapper `<div>`.
   * Used by the PNG export handler to capture the canvas contents.
   */
  canvasCaptureRef: React.RefObject<HTMLDivElement>;
  /**
   * Ref that will hold the `ReactFlowInstance` after `onInit` fires.
   * Used to convert drop-event screen coordinates to canvas coordinates.
   */
  reactFlowRef: React.MutableRefObject<ReactFlowInstance | null>;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  /** Called with the node ID when a node is clicked. */
  onNodeSelect: (nodeId: string) => void;
  /** Called with the edge ID when an edge is clicked. */
  onEdgeSelect: (edgeId: string) => void;
  /** Called when the background pane is clicked (deselects everything). */
  onPaneClick: () => void;
  /**
   * Called when a node-kind is dropped from the sidebar palette onto the
   * canvas.  The caller converts screen coordinates to flow coordinates and
   * appends the new node.
   */
  onDropNode: (kind: NodeKind, position: { x: number; y: number }) => void;

  // ── Chat panel ───────────────────────────────────────────────────────────

  /** Chat message history for the AI flow builder panel. */
  chatMessages: ChatMessage[];
  /** `true` while the chat API request is in flight. */
  chatLoading: boolean;
  /** Called when the user sends a chat message. */
  onChatSend: (message: string) => void;
  /** Clears all chat messages. */
  onClearChat: () => void;
}

/** Node kinds accepted by the drag-and-drop handler. */
const ALLOWED_DROP_KINDS: NodeKind[] = [
  "trigger",
  "email",
  "sms",
  "wait",
  "split",
  "outcome",
  "profileFilter",
  "merge",
];

export function MainCanvas({
  tab,
  genStep,
  genBusy,
  genResult,
  activeFlowIndex,
  activeEditorFlowIndex,
  isEditorActive,
  libraryActiveType,
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  theme,
  canvasCaptureRef,
  reactFlowRef,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeSelect,
  onEdgeSelect,
  onPaneClick,
  onDropNode,
  chatMessages,
  chatLoading,
  onChatSend,
  onClearChat,
}: MainCanvasProps) {
  return (
    <div className="flex-1 bg-canvas relative" ref={canvasCaptureRef}>
      {tab === "library" ? (
        /* ── Library view ─────────────────────────────────────────────── */
        <LibraryView activeType={libraryActiveType} />
      ) : tab === "generate" && genStep !== "done" ? (
        /* ── Loading / instructions ────────────────────────────────────── */
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md px-6">
            {genBusy ? (
              <>
                <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {genStep === "analyzing"
                    ? "Analyzing brand website..."
                    : "Generating tailored flows..."}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  This may take 30–60 seconds depending on the plan size.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  Generate a Flow Gameplan
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Fill in the client details in the sidebar and click{" "}
                  <b>Generate Gameplan</b>.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                  Or use the <b>AI Chat</b> below to describe a flow in plain
                  English.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ── ReactFlow canvas ──────────────────────────────────────────── */
        <ReactFlow
          key={
            tab === "generate" && genResult
              ? `gen-${activeFlowIndex}`
              : `editor-${activeEditorFlowIndex}`
          }
          onInit={(inst) => {
            reactFlowRef.current = inst;
          }}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesDraggable={isEditorActive}
          nodesConnectable={isEditorActive}
          elementsSelectable
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => {
            onNodeSelect(node.id);
          }}
          onEdgeClick={(_, edge) => {
            onEdgeSelect(edge.id);
          }}
          onPaneClick={onPaneClick}
          onDragOver={(event) => {
            if (!isEditorActive) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            if (!isEditorActive || !reactFlowRef.current) return;
            event.preventDefault();
            const rawKind = event.dataTransfer.getData("application/flow-node-kind");
            if (!ALLOWED_DROP_KINDS.includes(rawKind as NodeKind)) return;
            onDropNode(
              rawKind as NodeKind,
              reactFlowRef.current.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              })
            );
          }}
          deleteKeyCode={null}
          panOnDrag
          defaultEdgeOptions={{ ...EDGE_STYLE }}
        >
          <Background
            color={theme === "dark" ? "rgba(255,255,255,0.06)" : "#e2e8f0"}
            gap={24}
          />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      )}

      {/* ChatPanel is always rendered on the Generate tab, as a floating overlay */}
      {tab === "generate" && (
        <ChatPanel
          messages={chatMessages}
          onSend={onChatSend}
          onClear={onClearChat}
          loading={chatLoading}
          disabled={genBusy}
        />
      )}
    </div>
  );
}
