# Components

All components live in `src/components/`.

---

## App-level layout

### AppNavbar

**File:** `AppNavbar.tsx`

Top navigation bar. Renders the three tab buttons (Generate / Library / Editor) and the `ThemeToggle` button.

| Prop | Type | Description |
|---|---|---|
| `tab` | `AppTab` | Currently active tab |
| `onTabChange` | `(tab: AppTab) => void` | Called when a tab is clicked |

---

### ThemeToggle

**File:** `ThemeToggle.tsx`

Sun/Moon icon button. No props — reads from the nearest `ThemeProvider` via `useTheme()`.

---

### MainCanvas

**File:** `MainCanvas.tsx`

Central content area. Conditionally renders one of:
1. `LibraryView` — when `tab === "library"`
2. A spinner or instructional copy — when `tab === "generate"` and generation is not done
3. A ReactFlow canvas — when a flow is ready or the Editor tab is active

The `ChatPanel` always floats as an overlay when `tab === "generate"`.

Key props: `canvasCaptureRef` (used for PNG export), `reactFlowRef` (used for drop-position conversion), `onDropNode` (called when a node is dragged from the sidebar onto the canvas).

---

### DetailsPanel

**File:** `DetailsPanel.tsx`

Right sidebar. Displays and (when the editor is active) allows editing of the selected node or edge.

- **Node fields:** ID, type, title, trigger event, split condition, copy hint, strategy (primary/secondary focus)
- **Edge fields:** ID, label
- **Delete buttons:** shown only when `isEditorActive === true`

| Prop | Description |
|---|---|
| `selectedFlowNode` | The currently selected `FlowNode`, or `null` |
| `selectedEdge` | `{ id, label? }` or `null` |
| `isEditorActive` | Enables editing and delete buttons |
| `onUpdateNodeData` | Updater callback for node data |
| `onUpdateEdgeLabel` | Updates edge label |
| `onDeleteNode` / `onDeleteEdge` | Delete the selected item |

---

## Sidebar panels

### LibrarySidebar

**File:** `LibrarySidebar.tsx`

Vertical list of flow types shown on the Library tab. Clicking an item updates the canvas.

| Prop | Description |
|---|---|
| `activeType` | Currently selected `FlowType` |
| `onTypeChange` | Called when the user selects a type |

---

### GenerateSidebar

**File:** `GenerateSidebar.tsx`

Left sidebar for the Generate tab. Has two views:

- **Form view** (`genStep !== "done"`) — plan selector, flow spec button, brand URL/name inputs, questionnaire button, generate button, error message
- **Results view** (`genStep === "done"`) — generated flow list, "Edit in Editor", "Export All", "New Generation" buttons

See `GenerateSidebarProps` in the file for the full prop list.

---

### EditorSidebar

**File:** `EditorSidebar.tsx`

Left sidebar for the Editor tab. Four sections:
1. **Flow selector** — only when `isMultiFlowEditor` is true; lets the user switch between imported flows
2. **Preset picker** — loads a bundled template into the canvas
3. **Add Nodes palette** — click-to-append or drag-and-drop buttons grouped by Actions / Timing / Logic
4. **Reset button**

---

### ExportSection

**File:** `ExportSection.tsx`

Sticky bottom panel visible on all tabs except Library. Two sub-sections:
- **Export** — JSON, PNG, Import JSON (editor only), Export All (multi-flow editor only)
- **Miro** — board-ID input + export button

Owns the hidden `<input type="file">` ref internally; the parent only provides `onImportJson`.

---

## Dialogs

### FlowSpecModal

**File:** `FlowSpecModal.tsx`

Dialog for writing a free-text flow description before generation (custom plan only). Contains a collapsible help panel and a resizable textarea.

| Prop | Description |
|---|---|
| `open` / `onOpenChange` | Dialog visibility |
| `value` / `onChange` | Textarea value |
| `disabled` | Disabled while generation is running |
| `infoOpen` / `onInfoToggle` | Controls the help panel |

---

### BrandQuestionnaire

**File:** `BrandQuestionnaire.tsx` (pre-existing)

Dialog for optional brand details: discount notes, special instructions, and Fillout survey responses.

---

## Canvas nodes & edges

### FlowCanvasNode

**File:** `FlowCanvasNode.tsx` (pre-existing)

Custom ReactFlow node. Renders based on `nodeType` (trigger, message, wait, split, outcome, etc.) and shows a context menu when `data.callbacks` is present.

---

### SmartEdge

**File:** `SmartEdge.tsx` (pre-existing)

Custom ReactFlow edge that routes around other nodes.

---

## Infrastructure

### ThemeProvider

**File:** `ThemeProvider.tsx` (pre-existing)

Context provider that exposes `theme` (`"light"` | `"dark"`) and `toggleTheme()` to the entire tree.

---

### ErrorBoundary

**File:** `ErrorBoundary.tsx` (pre-existing)

Catches render-time errors and shows a fallback UI.

---

### LibraryView

**File:** `LibraryView.tsx` (pre-existing)

Renders a read-only ReactFlow canvas for the selected library flow type.

---

### ChatPanel

**File:** `ChatPanel.tsx` (pre-existing)

Floating chat panel for the AI flow builder. Renders a message list + send input and manages its own collapsed/expanded state.
