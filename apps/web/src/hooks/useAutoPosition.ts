import { useCallback, useEffect, useRef, useState } from "react";
import { applyNodeChanges, type Node, type NodeChange, type Edge } from "reactflow";
import type { AppNodeData } from "../types/flow";

const ROW_SPACING = 44;
const SPLIT_GAP_MULTIPLIER = 2.25;


/**
 * Two-pass positioning hook.
 * Pass 1: layout engine computes estimated positions (used as initial state).
 * Pass 2: after React Flow measures actual node heights, Y positions are
 *          recomputed so that the gap between every parent's bottom edge
 *          and the next node's top edge is a fixed constant.
 *
 * After the initial adjustment the hook calls `onReposition` so the caller
 * can sync external state (e.g. editorNodes). From that point on the hook
 * returns `layoutNodes` directly, deferring to the caller's state.
 *
 * Fallback: if React Flow doesn't fire dimension changes within 150ms
 * (e.g. when the ReactFlow component remounts with a new key), the hook
 * queries the DOM directly for node heights.
 */
export function useAutoPosition(
  layoutNodes: Node<AppNodeData>[],
  layoutEdges: Edge[],
  enabled: boolean,
  onReposition?: (nodes: Node<AppNodeData>[]) => void
) {
  const [nodes, setNodes] = useState(layoutNodes);
  const measuredRef = useRef(new Map<string, number>());
  const adjustedRef = useRef(false);
  const prevKeyRef = useRef("");
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const edgesRef = useRef(layoutEdges);
  edgesRef.current = layoutEdges;
  const layoutRef = useRef(layoutNodes);
  layoutRef.current = layoutNodes;
  const onRepositionRef = useRef(onReposition);
  onRepositionRef.current = onReposition;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const inputKey = layoutNodes.map((n) => n.id).join(",");

  /** Attempt DOM-based measurement fallback */
  const tryDomMeasurement = useCallback(() => {
    if (adjustedRef.current || !enabledRef.current) return;
    const initNodes = layoutRef.current;
    const domMeasured = new Map<string, number>();
    for (const n of initNodes) {
      const el = document.querySelector(`.react-flow__node[data-id="${n.id}"]`);
      if (el) {
        const h = (el as HTMLElement).offsetHeight;
        if (h > 0) domMeasured.set(n.id, h);
      }
    }
    const allMeasured = initNodes.every((n) => domMeasured.has(n.id));
    if (allMeasured) {
      const adjusted = recomputePositions(initNodes, edgesRef.current, domMeasured);
      setNodes(adjusted);
      adjustedRef.current = true;
      measuredRef.current = domMeasured;
      onRepositionRef.current?.(adjusted);
    }
  }, []);

  useEffect(() => {
    if (inputKey !== prevKeyRef.current) {
      prevKeyRef.current = inputKey;
      setNodes(layoutNodes);
      adjustedRef.current = false;
      measuredRef.current.clear();

      // Clear any pending fallback timer
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
      // Schedule DOM fallback measurement
      if (enabled) {
        fallbackTimerRef.current = setTimeout(() => {
          tryDomMeasurement();
        }, 200);
      }
    }
  }, [inputKey, layoutNodes, enabled, tryDomMeasurement]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!enabled) return;

      if (adjustedRef.current) {
        setNodes((nds) => applyNodeChanges(changes, nds));
        return;
      }

      let hasDim = false;
      for (const c of changes) {
        if (c.type === "dimensions" && c.dimensions && c.dimensions.height > 0) {
          measuredRef.current.set(c.id, c.dimensions.height);
          hasDim = true;
        }
      }

      if (hasDim) {
        const initNodes = layoutRef.current;
        const allMeasured = initNodes.every((n) => measuredRef.current.has(n.id));
        if (allMeasured) {
          // Cancel fallback since we got real measurements
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
          const adjusted = recomputePositions(initNodes, edgesRef.current, measuredRef.current);
          setNodes(adjusted);
          adjustedRef.current = true;
          onRepositionRef.current?.(adjusted);
          return;
        }
      }

      const other = changes.filter((c) => c.type !== "dimensions");
      if (other.length > 0) {
        setNodes((nds) => applyNodeChanges(other, nds));
      }
    },
    [enabled]
  );

  /* After adjustment + callback, layoutNodes is updated by the caller.
     Return layoutNodes directly to avoid dual-state conflicts.
     Before adjustment, return the hook's internal nodes (being measured). */
  const displayNodes = enabled
    ? (adjustedRef.current ? layoutNodes : nodes)
    : layoutNodes;

  return {
    nodes: displayNodes,
    onNodesChange,
    didReposition: adjustedRef.current
  };
}

/* ── Recompute Y positions using measured heights + fixed gaps ── */

function recomputePositions(
  nodes: Node<AppNodeData>[],
  edges: Edge[],
  measured: Map<string, number>
): Node<AppNodeData>[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const sideIds = new Set<string>();
  for (const n of nodes) {
    const t = n.data.nodeType;
    if (t === "note" || t === "strategy") sideIds.add(n.id);
  }

  const mainEdges = edges.filter((e) => !sideIds.has(e.source));
  const sideEdges = edges.filter((e) => sideIds.has(e.source));

  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const inDeg = new Map<string, number>();

  for (const n of nodes) {
    if (sideIds.has(n.id)) continue;
    parents.set(n.id, []);
    children.set(n.id, []);
    inDeg.set(n.id, 0);
  }

  for (const e of mainEdges) {
    if (!parents.has(e.target) || !children.has(e.source)) continue;
    parents.get(e.target)!.push(e.source);
    children.get(e.source)!.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }

  const topo: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topo.push(id);
    for (const child of children.get(id) ?? []) {
      const d = (inDeg.get(child) ?? 1) - 1;
      inDeg.set(child, d);
      if (d === 0) queue.push(child);
    }
  }

  for (const n of nodes) {
    if (!sideIds.has(n.id) && !topo.includes(n.id)) topo.push(n.id);
  }

  /* ── Y positioning ──
     Every node's Y = parentY + parentHeight + fixed gap.
     Siblings in different branches do NOT align horizontally —
     this keeps all arrows the same constant length. */
  const newY = new Map<string, number>();

  for (const id of topo) {
    const node = nodeMap.get(id);
    if (!node) continue;

    const pList = parents.get(id) ?? [];
    if (pList.length === 0) {
      newY.set(id, node.position.y);
      continue;
    }

    let maxY = 0;
    for (const pid of pList) {
      const pNode = nodeMap.get(pid);
      if (!pNode) continue;
      const pY = newY.get(pid) ?? pNode.position.y;
      const pH = measured.get(pid) ?? 100;
      const gap =
        pNode.data.nodeType === "split"
          ? ROW_SPACING * SPLIT_GAP_MULTIPLIER
          : ROW_SPACING;
      const candidate = pY + pH + gap;
      if (candidate > maxY) maxY = candidate;
    }

    newY.set(id, maxY);
  }

  for (const e of sideEdges) {
    const targetY = newY.get(e.target);
    if (targetY !== undefined) {
      newY.set(e.source, targetY);
    }
  }

  return nodes.map((n) => {
    const y = newY.get(n.id);
    if (y === undefined || Math.abs(n.position.y - y) < 0.5) return n;
    return { ...n, position: { ...n.position, y } };
  });
}
