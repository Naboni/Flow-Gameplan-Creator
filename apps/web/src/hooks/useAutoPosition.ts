import { useCallback, useEffect, useRef, useState } from "react";
import { applyNodeChanges, type Node, type NodeChange, type Edge } from "reactflow";
import type { AppNodeData } from "../types/flow";

const ROW_SPACING = 44;
const SPLIT_GAP_MULTIPLIER = 2.25;
const END_EXTRA_MULTIPLIER = 0.75;

/**
 * Two-pass positioning hook.
 * Pass 1: layout engine computes estimated positions (used as initial state).
 * Pass 2: after React Flow measures actual node heights, Y positions are
 *          recomputed so that the gap between every parent's bottom edge
 *          and the next node's top edge is a fixed constant.
 *
 * After the initial adjustment, ALL subsequent changes (drag, selection,
 * dimension re-measurements) pass through normally — so the editor's
 * drag-and-drop continues to work without interference.
 *
 * @param onReposition  called once after the Y-correction is applied,
 *                      so the caller can sync external state (e.g. editorNodes).
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

  /* Refs so the callback always sees the latest values */
  const edgesRef = useRef(layoutEdges);
  edgesRef.current = layoutEdges;
  const layoutRef = useRef(layoutNodes);
  layoutRef.current = layoutNodes;
  const onRepositionRef = useRef(onReposition);
  onRepositionRef.current = onReposition;

  /* Reset when the set of nodes changes (different flow / tab) */
  const inputKey = layoutNodes.map((n) => n.id).join(",");

  useEffect(() => {
    if (inputKey !== prevKeyRef.current) {
      prevKeyRef.current = inputKey;
      setNodes(layoutNodes);
      adjustedRef.current = false;
      measuredRef.current.clear();
    }
  }, [inputKey, layoutNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!enabled) return;

      /* After the initial correction, pass ALL changes through normally.
         This lets editor drag / selection / dimension updates work. */
      if (adjustedRef.current) {
        setNodes((nds) => applyNodeChanges(changes, nds));
        return;
      }

      /* ── Pre-adjustment phase: capture dimensions ── */
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
          const adjusted = recomputePositions(initNodes, edgesRef.current, measuredRef.current);
          setNodes(adjusted);
          adjustedRef.current = true;
          onRepositionRef.current?.(adjusted);
          return;
        }
      }

      /* Apply non-dimension changes while waiting for all measurements */
      const other = changes.filter((c) => c.type !== "dimensions");
      if (other.length > 0) {
        setNodes((nds) => applyNodeChanges(other, nds));
      }
    },
    [enabled]
  );

  return {
    nodes: enabled ? nodes : layoutNodes,
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

  /* Separate side nodes (note / strategy) from main-flow nodes */
  const sideIds = new Set<string>();
  for (const n of nodes) {
    const t = n.data.nodeType;
    if (t === "note" || t === "strategy") sideIds.add(n.id);
  }

  const mainEdges = edges.filter((e) => !sideIds.has(e.source));
  const sideEdges = edges.filter((e) => sideIds.has(e.source));

  /* Build adjacency */
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

  /* Topological sort */
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

  /* Include any orphan main nodes */
  for (const n of nodes) {
    if (!sideIds.has(n.id) && !topo.includes(n.id)) topo.push(n.id);
  }

  /* Compute new Y per node: parentY + measuredHeight + FIXED_GAP */
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

    if (node.data.nodeType === "outcome") {
      maxY += Math.round(ROW_SPACING * END_EXTRA_MULTIPLIER);
    }

    newY.set(id, maxY);
  }

  /* Reposition side nodes to match their target's new Y */
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
