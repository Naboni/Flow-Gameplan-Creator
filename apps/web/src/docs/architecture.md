# Architecture

## Overview

Flow Gameplan Creator is a React single-page app for building and visualising email/SMS marketing automation flows.

```
App
└── ThemeProvider
    └── ErrorBoundary
        └── AppInner          ← all state lives here
            ├── <aside>       Left sidebar
            ├── <main>        Navbar + canvas
            └── <aside>       Right details panel
```

---

## Folder structure

```
apps/web/src/
  App.tsx               Root component (~230 lines)
  hooks/                Business logic, one hook per concern
  components/           Pure UI components
  utils/                Stateless helper functions
  types/                Shared TypeScript types
  constants.ts          App-wide constants
  docs/                 This documentation
```

---

## State architecture

All state lives in `AppInner`. It is divided into five feature hooks plus a small block of shared state.

### Shared state (in App.tsx)

| State | Type | Purpose |
|---|---|---|
| `tab` | `AppTab` | Which tab is active |
| `selectedNodeId` | `string \| null` | Selected canvas node |
| `selectedEdgeId` | `string \| null` | Selected canvas edge |
| `libraryActiveType` | `FlowType` | Active type in Library tab |

### Feature hooks

| Hook | Owns |
|---|---|
| `useGenerateFlow` | Generate-tab form, API calls, chat |
| `useEditorFlow` | Editor-tab canvas CRUD |
| `useFlowCanvas` | Derived canvas nodes/edges, auto-position |
| `useNodeActions` | Node callbacks (preview, edit, delete, status), email polling |
| `useExportImport` | All export/import handlers and their loading states |

---

## Data flow

```
useGenerateFlow ──────► activeGenFlow
                              │
useEditorFlow ────────► editorNodes/Edges
                              │
                    useFlowCanvas
                    (builds flowNodes/flowEdges
                     via buildLayout + useAutoPosition)
                              │
              ┌───────────────┴──────────────┐
         ReactFlow canvas              DetailsPanel
              │
        useNodeActions
        (injects callbacks via nodeCallbacksRef)
```

---

## Tab system

Three tabs, each with its own sidebar content:

| Tab | Sidebar | Canvas |
|---|---|---|
| **Generate** | Form → GenerateSidebar; Results → GenerateSidebar (done view) | ReactFlow (read-only) + ChatPanel overlay |
| **Library** | LibrarySidebar (flow type list) | LibraryView (static diagrams) |
| **Editor** | EditorSidebar (preset, add nodes, reset) | ReactFlow (fully editable) |

Export/Miro section is always visible at the bottom of the sidebar except on Library.

---

## Key patterns

### nodeCallbacksRef

`FlowCanvasNode` needs callbacks (preview, edit, delete, status) but they change on every render due to `useCallback` deps. Rather than passing them as props (which would force all nodes to re-render), they are stored in a `useRef` and injected into node data by `useFlowCanvas`. This means nodes always call the latest callback without re-rendering.

### correctedGenCacheRef

`useAutoPosition` measures actual rendered node heights and corrects Y spacing. Results are cached per flow index so switching back to a previously-viewed generated flow does not re-trigger measurement. The cache is cleared on every new generation.

### Email editor polling

Opening the email editor (`/email-editor/:id`) is a separate window that saves changes to `localStorage`. `useNodeActions` runs a 1-second `setInterval` to check for those changes and apply them to the relevant node without requiring a page reload.

### openFlowInEditor

This function lives in `App.tsx` (not in a hook) because it is the only place that needs to read from both `canvas.flowNodes` (output of `useFlowCanvas`) and `editor.setEditorNodes` (from `useEditorFlow`) at the same time. Moving it to either hook would create a circular dependency.
