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
 * Compute the lane offset for a split child. For N branches the
 * offsets are spread symmetrically: e.g. 2 → [-1, +1], 3 → [-1, 0, +1].
 */
function branchLaneOffset(splitNode: FlowNode, edge: FlowEdge, allSplitEdges: FlowEdge[]): number {
  const n = allSplitEdges.length;
  if (n < 2) return 0;
  const idx = branchIndex(splitNode, edge, allSplitEdges);
  if (n === 2) return idx === 0 ? -1 : 1;
  return idx - (n - 1) / 2;
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

  /* ── Lane assignment (accumulate candidates, then average) ──
     For each outgoing edge, we compute the "wanted lane" for the target:
       - If source is a split → parentLane + branchOffset
       - Otherwise           → parentLane (inherit)
     Nodes with multiple incoming edges (merge points) average all candidates
     so they return to the center of their converging branches. */
  const laneCandidates = new Map<string, number[]>();
  if (triggerNode) laneCandidates.set(triggerNode.id, [0]);

  for (const node of topoOrder) {
    const candidates = laneCandidates.get(node.id) ?? [0];
    const parentLane = candidates.reduce((s, v) => s + v, 0) / candidates.length;
    const outgoing = outgoingByNode.get(node.id) ?? [];

    for (const edge of outgoing) {
      if (!nodesById.has(edge.to) || sideNodeIds.has(edge.to)) continue;
      const offset = (node.type === "split" && outgoing.length >= 2)
        ? branchLaneOffset(node, edge, outgoing)
        : 0;
      const wanted = parentLane + offset;
      const existing = laneCandidates.get(edge.to) ?? [];
      existing.push(wanted);
      laneCandidates.set(edge.to, existing);
    }
  }

  const laneById = new Map<string, number>();
  for (const node of topoOrder) {
    const candidates = laneCandidates.get(node.id) ?? [0];
    laneById.set(node.id, candidates.reduce((s, v) => s + v, 0) / candidates.length);
  }

  /* ── Y positioning ── */
  const parentEdgesMap = new Map<string, FlowEdge[]>();
  for (const edge of mainEdges) {
    const arr = parentEdgesMap.get(edge.to) ?? [];
    arr.push(edge);
    parentEdgesMap.set(edge.to, arr);
  }

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
    const y = node.type === "outcome"
      ? baseY + Math.round(resolved.rowSpacing * 0.75)
      : node.type === "merge"
        ? baseY + Math.round(resolved.rowSpacing * 0.5)
        : baseY;

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

    const midY = start.y + (end.y - start.y) / 2;
    return {
      id: edge.id, from: edge.from, to: edge.to, label: edge.label,
      points: [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
    };
  });

  return { nodes: normalizedNodes, edges: routedEdges };
}
