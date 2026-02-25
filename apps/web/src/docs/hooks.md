# Hooks

All custom hooks live in `src/hooks/`.

---

## useGenerateFlow(tab)

**File:** `hooks/useGenerateFlow.ts`

Owns all Generate-tab state and the two API calls.

### Parameters

| Param | Type | Why needed |
|---|---|---|
| `tab` | `AppTab` | To compute `activeGenFlow` only when on the Generate tab |

### State owned

| State | Purpose |
|---|---|
| `genPlan` | Selected plan key (`custom`, `core-foundation`, etc.) |
| `genUrl` | Client website URL input |
| `genBrand` | Brand name input |
| `genBusy` | Loading flag while API call is in flight |
| `questionnaireData` | Brand questionnaire field values |
| `questionnaireOpen` | Controls questionnaire dialog visibility |
| `genStep` | `form → analyzing → generating → done` pipeline stage |
| `genResult` | The full generated result (all flows + brand metadata) |
| `genError` | Validation or API error message |
| `activeFlowIndex` | Which flow in `genResult.flows` is currently shown |
| `customFlowText` | Free-text flow description for the custom plan |
| `flowSpecModalOpen` / `flowSpecInfoOpen` | FlowSpecModal open/info states |
| `chatMessages` | Chat message history |
| `chatLoading` | Loading flag for the chat API call |

### Derived values

| Value | Description |
|---|---|
| `questionnaireAnsweredCount` | Count of the 2 optional fields that have been filled |
| `hasFilloutData` | `true` when Fillout survey responses are present |
| `activeGenFlow` | The `FlowSpec` currently displayed on the canvas, or `null` |

### Key refs

| Ref | Description |
|---|---|
| `correctedGenCacheRef` | `Map<flowIndex, Node[]>` — caches auto-positioned nodes per flow |

### Handlers

| Handler | Description |
|---|---|
| `handleGenerate()` | Validate inputs → analyze brand → generate flows (2 API requests) |
| `handleChatSend(message)` | Send chat message, optionally apply returned flow spec |
| `resetGeneration()` | Clear cache + result + return to form view |

---

## useEditorFlow(opts)

**File:** `hooks/useEditorFlow.ts`

Owns all Editor-tab state and every canvas CRUD operation.

### Parameters

| Param | Purpose |
|---|---|
| `selectedNodeId` | Needed by `deleteSelectedNode` |
| `selectedEdgeId` | Needed by `deleteSelectedEdge` |
| `setSelectedNodeId` | Called after deletions and preset loads |
| `setSelectedEdgeId` | Called after deletions and preset loads |
| `setTab` | Called by `loadPresetIntoEditor` to switch to the editor |

### State owned

| State | Purpose |
|---|---|
| `editorNodes` | ReactFlow nodes on the editor canvas |
| `editorEdges` | ReactFlow edges on the editor canvas |
| `editorPreset` | Currently selected preset `<select>` value |
| `editorFlows` | All flows when multi-flow mode is active |
| `activeEditorFlowIndex` | Which flow in `editorFlows` is on the canvas |

### Derived values

| Value | Description |
|---|---|
| `isMultiFlowEditor` | `editorFlows.length > 1` |

### Handlers

| Handler | Description |
|---|---|
| `appendEditorNode(kind, position?)` | Creates a new node and adds it to the canvas |
| `deleteSelectedNode()` | Removes the selected node and its connected edges |
| `deleteSelectedEdge()` | Removes the selected edge |
| `updateEditorNodeData(nodeId, updater)` | Applies `updater` to a node's `FlowNode` and re-derives display fields |
| `updateEditorEdgeLabel(edgeId, label)` | Updates the label on an edge |
| `switchEditorFlow(targetIndex)` | Snapshots current canvas → loads target flow |
| `resetEditorFlow()` | Clears all editor state |
| `loadPresetIntoEditor(choice)` | Loads a bundled template into the canvas |

> `openFlowInEditor` is **not** in this hook — it lives in `App.tsx` because it needs `canvas.flowNodes`.

---

## useFlowCanvas(opts)

**File:** `hooks/useFlowCanvas.ts`

Computes ReactFlow nodes and edges from whichever flow is active, runs auto-positioning, and injects node callbacks.

### Parameters

| Param | Source |
|---|---|
| `activeGenFlow` | `useGenerateFlow` |
| `isEditorActive` | Derived from `tab` in `App.tsx` |
| `activeFlowIndex` | `useGenerateFlow` |
| `tab` | Shared state |
| `editorNodes` / `editorEdges` | `useEditorFlow` |
| `correctedGenCacheRef` | `useGenerateFlow` |
| `selectedNodeId` / `selectedEdgeId` | Shared state |
| `nodeCallbacksRef` | Created in `App.tsx`, populated by `useNodeActions` |
| `setEditorNodes` | `useEditorFlow` — called by `handleAutoReposition` |

### Returns

| Value | Description |
|---|---|
| `flowNodes` | Final nodes ready for ReactFlow (with injected callbacks) |
| `flowEdges` | Edges ready for ReactFlow |
| `autoNodesChange` | Pass to ReactFlow's `onNodesChange` |
| `didReposition` | `true` on the render where auto-positioning completed |
| `isCanvasActive` | Whether the canvas is currently visible |
| `selectedFlowNode` | `FlowNode` for the selected node, or `null` |
| `selectedEdge` | `{ id, label? }` for the selected edge, or `null` |
| `hasContent` | Whether there is anything to export |

---

## useNodeActions(opts)

**File:** `hooks/useNodeActions.ts`

Manages the four node-level actions and polls `localStorage` for email-editor changes.

### Parameters

Receives `isEditorActive`, `tab`, `genResult`/`setGenResult`, `activeFlowIndex`, `selectedNodeId`/`setSelectedNodeId`, `setEditorNodes`, `setEditorEdges`, `updateEditorNodeData`, `genBrand`, `genUrl`, `flowNodes`.

### Handlers

| Handler | Description |
|---|---|
| `handleNodePreview(nodeId)` | Stores node in localStorage, opens `/email-preview/:id` |
| `handleNodeEdit(nodeId)` | Stores node in localStorage, opens `/email-editor/:id` |
| `handleNodeDelete(nodeId)` | Removes node from editor or generate result |
| `handleNodeStatusChange(nodeId, status)` | Updates `status` on a message node |

### Returns

| Value | Description |
|---|---|
| `nodeCallbacks` | Object of the four handlers, passed to `nodeCallbacksRef` in `App.tsx` |

### Side effect

Runs a `setInterval` (1 s) to read `localStorage` for edits saved by detached email-editor windows and applies them to the matching node.

---

## useExportImport(opts)

**File:** `hooks/useExportImport.ts`

Manages all export/import operations and their loading states.

### State owned

| State | Description |
|---|---|
| `busyPngExport` | Loading flag for PNG export |
| `busyMiroExport` | Loading flag for Miro export |
| `miroBoardId` | Value of the Miro board-ID input |

### Handlers

| Handler | Description |
|---|---|
| `handleExportJson()` | Downloads the active flow as a `.json` file |
| `handleExportAllJson()` | Downloads all generated flows as a single JSON array |
| `handleExportAllEditorFlows()` | Downloads all editor flows (snapshots current canvas first) |
| `handleExportPng()` | Captures `canvasCaptureRef` div as a 2× PNG |
| `handleImportJson(event)` | Reads a `.json` file, validates each spec, loads into editor |
| `handleExportMiro()` | Exports flow(s) to the specified Miro board |

---

## useAutoPosition

**File:** `hooks/useAutoPosition.ts` (pre-existing)

Measures actual rendered node heights and corrects Y-axis spacing so arrows between nodes have uniform gaps. Used internally by `useFlowCanvas`.
