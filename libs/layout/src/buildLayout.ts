import type { FlowEdge, FlowNode, FlowSpec } from "@flow/core";

export type LayoutPoint = {
  x: number;
  y: number;
};

export type PositionedNode = {
  id: string;
  type: FlowNode["type"];
  title: string;
  width: number;
  height: number;
  x: number;
  y: number;
  depth: number;
  lane: number;
};

export type RoutedEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  points: LayoutPoint[];
};

export type LayoutResult = {
  nodes: PositionedNode[];
  edges: RoutedEdge[];
};

export type LayoutOptions = {
  rowSpacing?: number;
  laneSpacing?: number;
  sameLaneOffset?: number;
  paddingX?: number;
  paddingY?: number;
  positionOverrides?: Record<string, { x: number; y: number }>;
  nodeSizeOverrides?: Partial<Record<FlowNode["type"], { width: number; height: number }>>;
};

const DEFAULT_LAYOUT_OPTIONS: Omit<Required<LayoutOptions>, "positionOverrides" | "nodeSizeOverrides"> = {
  rowSpacing: 44,
  laneSpacing: 320,
  sameLaneOffset: 340,
  paddingX: 120,
  paddingY: 80
};

const NODE_SIZE_MAP: Record<FlowNode["type"], { width: number; height: number }> = {
  trigger: { width: 280, height: 94 },
  profileFilter: { width: 280, height: 100 },
  split: { width: 280, height: 100 },
  wait: { width: 280, height: 48 },
  message: { width: 280, height: 230 },
  outcome: { width: 72, height: 22 },
  note: { width: 320, height: 160 },
  strategy: { width: 320, height: 200 },
  merge: { width: 72, height: 28 }
};

const MSG_STRATEGY_EXTRA = 200;
const COLLISION_PAD_X = 32;
const COLLISION_PASSES = 12;

function getNodeSize(
  node: FlowNode,
  overrides?: Partial<Record<FlowNode["type"], { width: number; height: number }>>
): { width: number; height: number } {
  const base = overrides?.[node.type] ?? NODE_SIZE_MAP[node.type];
  if (node.type === "message" && node.strategy) {
    return { width: base.width, height: base.height + MSG_STRATEGY_EXTRA };
  }
  return base;
}

/**
 * Get the labels array from a split node safely — handles both
 * the old {yes,no} object format and the new string[] format.
 */
function getSplitLabels(node: FlowNode): string[] {
  if (node.type !== "split") return [];
  const raw = (node as Record<string, unknown>).labels;
  if (Array.isArray(raw)) return raw.filter(l => typeof l === "string" && l.trim()) as string[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const yes = typeof obj.yes === "string" ? obj.yes : "Yes";
    const no = typeof obj.no === "string" ? obj.no : "No";
    return [yes, no];
  }
  return ["Yes", "No"];
}

/**
 * Given a split node and one of its outgoing edges, return the
 * index of that edge's branch (0-based). Falls back to alphabetical
 * ordering of the edge label if no label match is found.
 */
function branchIndex(splitNode: FlowNode, edge: FlowEdge, allSplitEdges: FlowEdge[]): number {
  const labels = getSplitLabels(splitNode);
  const normalized = labels.map(l => l.trim().toLowerCase());
  const edgeLabel = (edge.label ?? "").trim().toLowerCase();
  const idx = normalized.indexOf(edgeLabel);
  if (idx >= 0) return idx;
  // fallback: use position in the sorted list of outgoing edges
  const sorted = [...allSplitEdges].sort((a, b) =>
    (a.label ?? "").localeCompare(b.label ?? "") || a.to.localeCompare(b.to)
  );
  return Math.max(0, sorted.findIndex(e => e.id === edge.id));
}

/**
 * Post-layout collision sweep. Pushes overlapping nodes apart
 * **symmetrically** (each pushed half the overlap distance).
 */
function resolveCollisions(nodes: PositionedNode[]): PositionedNode[] {
  const out = nodes.map(n => ({ ...n }));
  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        // Only check nodes that overlap vertically
        if (a.y + a.height + 8 <= b.y || b.y + b.height + 8 <= a.y) continue;

        const aCx = a.x + a.width / 2;
        const bCx = b.x + b.width / 2;
        const minDist = (a.width + b.width) / 2 + COLLISION_PAD_X;
        const dist = Math.abs(bCx - aCx);
        if (dist >= minDist) continue;

        const push = (minDist - dist) / 2;
        if (aCx <= bCx) {
          a.x -= push;
          b.x += push;
        } else {
          a.x += push;
          b.x -= push;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

export function buildLayout(
  rawSpec: FlowSpec,
  options: LayoutOptions = {}
): LayoutResult {
  const spec = rawSpec;
  const resolved = { ...DEFAULT_LAYOUT_OPTIONS, ...options };

  if (spec.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  /* ── Separate side nodes (note, strategy) from main flow nodes ── */
  const sideNodes: FlowNode[] = [];
  const mainNodes: FlowNode[] = [];
  const sideNodeIds = new Set<string>();

  for (const node of spec.nodes) {
    if (node.type === "note" || node.type === "strategy") {
      sideNodes.push(node);
      sideNodeIds.add(node.id);
    } else {
      mainNodes.push(node);
    }
  }

  const sideTargetMap = new Map<string, string>();
  const mainEdges: FlowEdge[] = [];

  for (const edge of spec.edges) {
    if (sideNodeIds.has(edge.from)) {
      sideTargetMap.set(edge.from, edge.to);
    } else {
      mainEdges.push(edge);
    }
  }

  /* ── Build adjacency ── */
  const nodesById = new Map(spec.nodes.map(n => [n.id, n]));
  const outgoingByNode = new Map<string, FlowEdge[]>();
  const incomingCount = new Map<string, number>();

  for (const node of mainNodes) {
    outgoingByNode.set(node.id, []);
    incomingCount.set(node.id, 0);
  }

  for (const edge of mainEdges) {
    outgoingByNode.get(edge.from)?.push(edge);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  /* ── Topological sort ── */
  const triggerNode = mainNodes.find(n => n.type === "trigger");
  const zeroInDegree = mainNodes
    .filter(n => (incomingCount.get(n.id) ?? 0) === 0)
    .sort((a, b) => {
      if (triggerNode && a.id === triggerNode.id) return -1;
      if (triggerNode && b.id === triggerNode.id) return 1;
      return a.id.localeCompare(b.id);
    });

  const queue = [...zeroInDegree];
  const topoOrder: FlowNode[] = [];
  const localIncoming = new Map(incomingCount);

  while (queue.length > 0) {
    queue.sort((a, b) => a.id.localeCompare(b.id));
    const node = queue.shift()!;
    topoOrder.push(node);

    const outgoing = outgoingByNode.get(node.id) ?? [];
    for (const edge of outgoing) {
      const dec = (localIncoming.get(edge.to) ?? 1) - 1;
      localIncoming.set(edge.to, dec);
      if (dec === 0) {
        const child = nodesById.get(edge.to);
        if (child) queue.push(child);
      }
    }
  }

  for (const node of mainNodes) {
    if (!topoOrder.some(n => n.id === node.id)) topoOrder.push(node);
  }

  /* ── Subtree-width-aware lane assignment ──
     1. Build a "tree" from the DAG: each node gets one primary parent.
     2. Bottom-up: compute how many lane-units each subtree needs.
     3. Top-down (topo order): allocate horizontal space proportional
        to subtree width. Merge nodes get averaged across parents. */

  // Step 1: Build tree structure (each node claimed by first parent in topo order)
  const treeChildren = new Map<string, string[]>();
  const treeParent = new Map<string, string>();
  for (const node of topoOrder) treeChildren.set(node.id, []);

  for (const node of topoOrder) {
    const outgoing = outgoingByNode.get(node.id) ?? [];
    const sorted = node.type === "split" && outgoing.length >= 2
      ? [...outgoing].sort((a, b) => branchIndex(node, a, outgoing) - branchIndex(node, b, outgoing))
      : outgoing;
    for (const edge of sorted) {
      if (sideNodeIds.has(edge.to) || treeParent.has(edge.to)) continue;
      if (!nodesById.has(edge.to)) continue;
      treeParent.set(edge.to, node.id);
      treeChildren.get(node.id)!.push(edge.to);
    }
  }

  // Step 2: Bottom-up subtree width (reverse topo = leaves first)
  const subtreeWidth = new Map<string, number>();
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const node = topoOrder[i];
    const children = treeChildren.get(node.id) ?? [];
    if (children.length === 0) {
      subtreeWidth.set(node.id, 1);
    } else if (node.type === "split" && children.length >= 2) {
      subtreeWidth.set(node.id, children.reduce((sum, cid) => sum + (subtreeWidth.get(cid) ?? 1), 0));
    } else {
      subtreeWidth.set(node.id, Math.max(...children.map(cid => subtreeWidth.get(cid) ?? 1)));
    }
  }

  // Step 3: Top-down lane assignment
  const laneById = new Map<string, number>();
  if (triggerNode) laneById.set(triggerNode.id, 0);

  // Build incoming-edges map for merge detection
  const parentEdgesMap = new Map<string, FlowEdge[]>();
  for (const edge of mainEdges) {
    const arr = parentEdgesMap.get(edge.to) ?? [];
    arr.push(edge);
    parentEdgesMap.set(edge.to, arr);
  }

  for (const node of topoOrder) {
    // Merge points: average all parent lanes
    const incomingEdges = (parentEdgesMap.get(node.id) ?? []).filter(e => !sideNodeIds.has(e.from));
    if (incomingEdges.length > 1) {
      const parentLanes = incomingEdges
        .map(e => laneById.get(e.from))
        .filter((l): l is number => l !== undefined);
      if (parentLanes.length > 0) {
        laneById.set(node.id, parentLanes.reduce((s, v) => s + v, 0) / parentLanes.length);
      }
    }

    if (!laneById.has(node.id)) laneById.set(node.id, 0);
    const myLane = laneById.get(node.id)!;
    const children = treeChildren.get(node.id) ?? [];

    if (node.type === "split" && children.length >= 2) {
      // Sort children by their branch label order
      const outgoing = outgoingByNode.get(node.id) ?? [];
      const sortedChildren = [...children].sort((a, b) => {
        const aEdge = outgoing.find(e => e.to === a);
        const bEdge = outgoing.find(e => e.to === b);
        if (!aEdge || !bEdge) return 0;
        return branchIndex(node, aEdge, outgoing) - branchIndex(node, bEdge, outgoing);
      });

      const widths = sortedChildren.map(cid => subtreeWidth.get(cid) ?? 1);
      const totalWidth = widths.reduce((s, w) => s + w, 0);
      let currentLeft = myLane - totalWidth / 2;

      for (let i = 0; i < sortedChildren.length; i++) {
        laneById.set(sortedChildren[i], currentLeft + widths[i] / 2);
        currentLeft += widths[i];
      }
    } else {
      for (const childId of children) {
        laneById.set(childId, myLane);
      }
    }
  }

  // Fill any missing lanes
  for (const node of topoOrder) {
    if (!laneById.has(node.id)) laneById.set(node.id, 0);
  }

  /* ── Y positioning ──
     Every node's Y = parentY + parentHeight + fixed gap.
     Siblings in different branches do NOT need to align horizontally —
     this keeps all arrows the same constant length. */
  const nodeYMap = new Map<string, number>();
  for (const node of topoOrder) {
    const incoming = parentEdgesMap.get(node.id) ?? [];
    if (incoming.length === 0) {
      nodeYMap.set(node.id, 0);
    } else {
      let maxY = 0;
      for (const edge of incoming) {
        const parent = nodesById.get(edge.from);
        if (!parent) continue;
        const pY = nodeYMap.get(edge.from) ?? 0;
        const pSize = getNodeSize(parent, resolved.nodeSizeOverrides);
        const gap = parent.type === "split" ? resolved.rowSpacing * 2.25 : resolved.rowSpacing;
        maxY = Math.max(maxY, pY + pSize.height + gap);
      }
      nodeYMap.set(node.id, maxY);
    }
  }

  /* ── Build positioned nodes ── */
  const positionedNodes: PositionedNode[] = [];
  for (const node of topoOrder) {
    const lane = laneById.get(node.id) ?? 0;
    const size = getNodeSize(node, resolved.nodeSizeOverrides);
    const cx = lane * resolved.laneSpacing;
    const baseY = nodeYMap.get(node.id) ?? 0;
    const y = baseY;

    positionedNodes.push({
      id: node.id, type: node.type,
      title: "title" in node ? node.title : node.type,
      width: size.width, height: size.height,
      x: cx - size.width / 2, y,
      depth: 0, lane
    });
  }

  /* ── Collision sweep (symmetric push) ── */
  const deCollided = resolveCollisions(positionedNodes);

  /* ── Side nodes ── */
  const positionedById = new Map(deCollided.map(n => [n.id, n]));
  const SIDE_LEFT_OFFSET = -380;
  const SIDE_RIGHT_GAP = 60;

  for (const sideNode of sideNodes) {
    const targetId = sideTargetMap.get(sideNode.id);
    const target = targetId ? positionedById.get(targetId) : undefined;
    const size = getNodeSize(sideNode, resolved.nodeSizeOverrides);

    if (target) {
      const placeRight = target.lane > 0;
      deCollided.push({
        id: sideNode.id, type: sideNode.type,
        title: "title" in sideNode ? sideNode.title : sideNode.type,
        width: size.width, height: size.height,
        x: placeRight ? target.x + target.width + SIDE_RIGHT_GAP : target.x + SIDE_LEFT_OFFSET,
        y: target.y,
        depth: target.depth,
        lane: placeRight ? target.lane + 1 : target.lane - 1
      });
    } else {
      const maxY = deCollided.length > 0 ? Math.max(...deCollided.map(n => n.y)) + resolved.rowSpacing : 0;
      deCollided.push({
        id: sideNode.id, type: sideNode.type,
        title: "title" in sideNode ? sideNode.title : sideNode.type,
        width: size.width, height: size.height,
        x: 0, y: maxY, depth: 999, lane: 0
      });
    }
  }

  /* ── Normalize to positive coordinates ── */
  const minX = Math.min(...deCollided.map(n => n.x));
  const minY = Math.min(...deCollided.map(n => n.y));

  const normalizedNodes = deCollided.map(node => {
    const def = {
      x: node.x - minX + resolved.paddingX,
      y: node.y - minY + resolved.paddingY
    };
    const override = resolved.positionOverrides?.[node.id];
    return { ...node, x: override?.x ?? def.x, y: override?.y ?? def.y };
  });

  const normalizedById = new Map(normalizedNodes.map(n => [n.id, n]));

  /* ── Route edges ── */
  const routedEdges: RoutedEdge[] = spec.edges.map(edge => {
    const fromNode = normalizedById.get(edge.from);
    const toNode = normalizedById.get(edge.to);
    if (!fromNode || !toNode) {
      return { id: edge.id, from: edge.from, to: edge.to, label: edge.label, points: [] };
    }

    if (sideNodeIds.has(edge.from)) {
      return {
        id: edge.id, from: edge.from, to: edge.to, label: edge.label,
        points: [
          { x: fromNode.x + fromNode.width, y: fromNode.y + fromNode.height / 2 },
          { x: toNode.x, y: toNode.y + toNode.height / 2 }
        ]
      };
    }

    const start = { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height };
    const end = { x: toNode.x + toNode.width / 2, y: toNode.y };

    if (Math.abs(start.x - end.x) < 1) {
      return { id: edge.id, from: edge.from, to: edge.to, label: edge.label, points: [start, end] };
    }

    /* Turn point: fixed 50px above target so that edges converging on the
       same node (split branches or merge inputs) share the same horizontal Y. */
    const turnDrop = 50;
    const turnY = end.y - turnDrop > start.y ? end.y - turnDrop : start.y + (end.y - start.y) / 2;
    return {
      id: edge.id, from: edge.from, to: edge.to, label: edge.label,
      points: [start, { x: start.x, y: turnY }, { x: end.x, y: turnY }, end]
    };
  });

  return { nodes: normalizedNodes, edges: routedEdges };
}
