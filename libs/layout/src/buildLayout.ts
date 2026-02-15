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
  laneSpacing: 200,
  sameLaneOffset: 340,
  paddingX: 120,
  paddingY: 80
};

const NODE_SIZE_MAP: Record<FlowNode["type"], { width: number; height: number }> = {
  trigger: { width: 280, height: 94 },
  profileFilter: { width: 280, height: 100 },
  split: { width: 280, height: 100 },
  wait: { width: 280, height: 48 },
  message: { width: 280, height: 185 },
  outcome: { width: 72, height: 22 },
  note: { width: 320, height: 160 },
  strategy: { width: 320, height: 200 }
};

function labelSortScore(label?: string): number {
  const normalized = label?.trim().toLowerCase();
  if (normalized === "yes") {
    return 0;
  }
  if (normalized === "no") {
    return 1;
  }
  return 2;
}

function branchLaneOffset(parentNode: FlowNode, edge: FlowEdge): number {
  if (parentNode.type !== "split") {
    return 0;
  }
  const normalized = edge.label?.trim().toLowerCase();
  if (normalized === "yes") {
    return -1;
  }
  if (normalized === "no") {
    return 1;
  }
  return 0;
}

function nodeSortPriority(nodeType: FlowNode["type"]): number {
  const order: FlowNode["type"][] = [
    "trigger",
    "profileFilter",
    "split",
    "message",
    "wait",
    "outcome"
  ];
  return order.indexOf(nodeType);
}

export function buildLayout(
  rawSpec: FlowSpec,
  options: LayoutOptions = {}
): LayoutResult {
  /* Accept raw spec without validation so the builder can pass
     incomplete / in-progress flows that would fail strict schema checks. */
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

  // Build side-node→target map: for each side node, find the node it connects TO
  const sideTargetMap = new Map<string, string>();
  const mainEdges: FlowEdge[] = [];

  for (const edge of spec.edges) {
    if (sideNodeIds.has(edge.from)) {
      sideTargetMap.set(edge.from, edge.to);
    } else {
      mainEdges.push(edge);
    }
  }

  /* ── Build adjacency only from main (non-note) edges ── */
  const nodesById = new Map(spec.nodes.map((node) => [node.id, node]));
  const outgoingByNode = new Map<string, FlowEdge[]>();
  const incomingCount = new Map<string, number>();

  for (const node of mainNodes) {
    outgoingByNode.set(node.id, []);
    incomingCount.set(node.id, 0);
  }

  for (const edge of mainEdges) {
    const outgoing = outgoingByNode.get(edge.from);
    if (outgoing) {
      outgoing.push(edge);
    }
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  /* ── Topological sort (main nodes only) ── */
  const triggerNode = mainNodes.find((node) => node.type === "trigger");
  const zeroInDegree = mainNodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .sort((a, b) => {
      if (triggerNode && a.id === triggerNode.id) {
        return -1;
      }
      if (triggerNode && b.id === triggerNode.id) {
        return 1;
      }
      return a.id.localeCompare(b.id);
    });

  const queue = [...zeroInDegree];
  const topoOrder: FlowNode[] = [];
  const localIncoming = new Map(incomingCount);

  while (queue.length > 0) {
    queue.sort((a, b) => a.id.localeCompare(b.id));
    const node = queue.shift();
    if (!node) {
      break;
    }
    topoOrder.push(node);

    const outgoing = [...(outgoingByNode.get(node.id) ?? [])].sort((a, b) => {
      const labelDelta = labelSortScore(a.label) - labelSortScore(b.label);
      if (labelDelta !== 0) {
        return labelDelta;
      }
      if (a.to !== b.to) {
        return a.to.localeCompare(b.to);
      }
      return a.id.localeCompare(b.id);
    });

    for (const edge of outgoing) {
      const newIncoming = (localIncoming.get(edge.to) ?? 1) - 1;
      localIncoming.set(edge.to, newIncoming);
      if (newIncoming === 0) {
        const child = nodesById.get(edge.to);
        if (child) {
          queue.push(child);
        }
      }
    }
  }

  for (const node of mainNodes) {
    if (!topoOrder.some((n) => n.id === node.id)) {
      topoOrder.push(node);
    }
  }

  /* ── Depth & lane assignment (main nodes only) ── */
  const depthById = new Map<string, number>();
  const laneCandidatesById = new Map<string, number[]>();

  if (triggerNode) {
    depthById.set(triggerNode.id, 0);
    laneCandidatesById.set(triggerNode.id, [0]);
  }

  for (const node of topoOrder) {
    const parentDepth = depthById.get(node.id) ?? 0;
    const parentLaneCandidates = laneCandidatesById.get(node.id) ?? [0];
    const parentLaneAverage =
      parentLaneCandidates.reduce((sum, value) => sum + value, 0) / parentLaneCandidates.length;
    const outgoing = [...(outgoingByNode.get(node.id) ?? [])].sort((a, b) => {
      const labelDelta = labelSortScore(a.label) - labelSortScore(b.label);
      if (labelDelta !== 0) {
        return labelDelta;
      }
      return a.to.localeCompare(b.to);
    });

    for (const edge of outgoing) {
      const childNode = nodesById.get(edge.to);
      if (!childNode) {
        continue;
      }
      const nextDepth = parentDepth + 1;
      const previousDepth = depthById.get(childNode.id);
      if (previousDepth === undefined || nextDepth > previousDepth) {
        depthById.set(childNode.id, nextDepth);
      }
      const offset = branchLaneOffset(node, edge);
      const candidateLane = parentLaneAverage + offset;
      const existing = laneCandidatesById.get(childNode.id) ?? [];
      existing.push(candidateLane);
      laneCandidatesById.set(childNode.id, existing);
    }
  }

  const fallbackDepth = topoOrder.length;
  for (const [index, node] of topoOrder.entries()) {
    if (!depthById.has(node.id)) {
      depthById.set(node.id, fallbackDepth + index);
    }
    if (!laneCandidatesById.has(node.id)) {
      laneCandidatesById.set(node.id, [0]);
    }
  }

  const laneById = new Map<string, number>();
  for (const [nodeId, candidates] of laneCandidatesById.entries()) {
    const average = candidates.reduce((sum, value) => sum + value, 0) / candidates.length;
    laneById.set(nodeId, Math.round(average));
  }

  /* ── Position main nodes ── */
  const nodesByDepth = new Map<number, FlowNode[]>();
  for (const node of mainNodes) {
    const depth = depthById.get(node.id) ?? 0;
    const existing = nodesByDepth.get(depth) ?? [];
    existing.push(node);
    nodesByDepth.set(depth, existing);
  }

  const depthEntries = [...nodesByDepth.entries()].sort((a, b) => a[0] - b[0]);
  const depthY = new Map<number, number>();
  let currentY = 0;
  for (const [depth, depthNodes] of depthEntries) {
    depthY.set(depth, currentY);
    let maxHeightForDepth = 0;
    for (const node of depthNodes) {
      const size = resolved.nodeSizeOverrides?.[node.type] ?? NODE_SIZE_MAP[node.type];
      if (size.height > maxHeightForDepth) {
        maxHeightForDepth = size.height;
      }
    }
    // Extra vertical space after split rows for Klaviyo-style long drop before branching
    const hasSplit = depthNodes.some((n) => n.type === "split");
    const gap = hasSplit ? resolved.rowSpacing * 2.25 : resolved.rowSpacing;
    currentY += maxHeightForDepth + gap;
  }

  const positionedNodes: PositionedNode[] = [];
  for (const [depth, depthNodes] of depthEntries) {
    const laneStackCount = new Map<number, number>();
    const sortedNodes = [...depthNodes].sort((a, b) => {
      const laneDiff = (laneById.get(a.id) ?? 0) - (laneById.get(b.id) ?? 0);
      if (laneDiff !== 0) {
        return laneDiff;
      }
      const typeDiff = nodeSortPriority(a.type) - nodeSortPriority(b.type);
      if (typeDiff !== 0) {
        return typeDiff;
      }
      return a.id.localeCompare(b.id);
    });

    for (const node of sortedNodes) {
      const lane = laneById.get(node.id) ?? 0;
      const laneIndex = laneStackCount.get(lane) ?? 0;
      laneStackCount.set(lane, laneIndex + 1);

      const size = resolved.nodeSizeOverrides?.[node.type] ?? NODE_SIZE_MAP[node.type];
      // Center-align nodes in their lane so handles (at center) line up vertically
      const laneCenter = lane * resolved.laneSpacing + laneIndex * resolved.sameLaneOffset;
      const rawX = laneCenter - size.width / 2;
      const baseY = depthY.get(depth) ?? 0;
      // Klaviyo-like terminal gap: make incoming edge to End visibly longer.
      const rawY = node.type === "outcome"
        ? baseY + Math.round(resolved.rowSpacing * 0.75)
        : baseY;

      positionedNodes.push({
        id: node.id,
        type: node.type,
        title: "title" in node ? node.title : node.type,
        width: size.width,
        height: size.height,
        x: rawX,
        y: rawY,
        depth,
        lane
      });
    }
  }

  /* ── Position side nodes (note/strategy): place beside their target ── */
  const positionedById = new Map(positionedNodes.map((n) => [n.id, n]));
  const SIDE_LEFT_OFFSET = -380;
  const SIDE_RIGHT_GAP = 60;

  for (const sideNode of sideNodes) {
    const targetId = sideTargetMap.get(sideNode.id);
    const targetPositioned = targetId ? positionedById.get(targetId) : undefined;
    const size = resolved.nodeSizeOverrides?.[sideNode.type] ?? NODE_SIZE_MAP[sideNode.type];

    if (targetPositioned) {
      // Place side nodes on the OUTSIDE of their branch
      const placeRight = targetPositioned.lane > 0;

      const xPos = placeRight
        ? targetPositioned.x + targetPositioned.width + SIDE_RIGHT_GAP
        : targetPositioned.x + SIDE_LEFT_OFFSET;

      positionedNodes.push({
        id: sideNode.id,
        type: sideNode.type,
        title: "title" in sideNode ? sideNode.title : sideNode.type,
        width: size.width,
        height: size.height,
        x: xPos,
        y: targetPositioned.y,
        depth: targetPositioned.depth,
        lane: placeRight ? targetPositioned.lane + 1 : targetPositioned.lane - 1
      });
    } else {
      // Disconnected side node: place below the last positioned node
      const maxY = positionedNodes.length > 0
        ? Math.max(...positionedNodes.map((n) => n.y)) + resolved.rowSpacing
        : 0;
      positionedNodes.push({
        id: sideNode.id,
        type: sideNode.type,
        title: "title" in sideNode ? sideNode.title : sideNode.type,
        width: size.width,
        height: size.height,
        x: 0,
        y: maxY,
        depth: 999,
        lane: 0
      });
    }
  }

  /* ── Normalize positions ── */
  const minX = Math.min(...positionedNodes.map((node) => node.x));
  const minY = Math.min(...positionedNodes.map((node) => node.y));

  const normalizedNodes = positionedNodes.map((node) => {
    const defaultPosition = {
      x: node.x - minX + resolved.paddingX,
      y: node.y - minY + resolved.paddingY
    };
    const override = resolved.positionOverrides?.[node.id];
    return {
      ...node,
      x: override?.x ?? defaultPosition.x,
      y: override?.y ?? defaultPosition.y
    };
  });

  const normalizedById = new Map(normalizedNodes.map((node) => [node.id, node]));

  /* ── Route edges ── */
  const routedEdges: RoutedEdge[] = spec.edges.map((edge) => {
    const fromNode = normalizedById.get(edge.from);
    const toNode = normalizedById.get(edge.to);
    if (!fromNode || !toNode) {
      return {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        points: []
      };
    }

    // Side-node edges: horizontal from right side to left side of target
    const isNoteEdge = sideNodeIds.has(edge.from);
    if (isNoteEdge) {
      const start: LayoutPoint = {
        x: fromNode.x + fromNode.width,
        y: fromNode.y + fromNode.height / 2
      };
      const end: LayoutPoint = {
        x: toNode.x,
        y: toNode.y + toNode.height / 2
      };
      return {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        points: [start, end]
      };
    }

    // Normal edges: top-to-bottom
    const start: LayoutPoint = {
      x: fromNode.x + fromNode.width / 2,
      y: fromNode.y + fromNode.height
    };
    const end: LayoutPoint = {
      x: toNode.x + toNode.width / 2,
      y: toNode.y
    };

    if (Math.abs(start.x - end.x) < 1) {
      return {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        points: [start, end]
      };
    }

    const middleY = start.y + (end.y - start.y) / 2;
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      points: [
        start,
        { x: start.x, y: middleY },
        { x: end.x, y: middleY },
        end
      ]
    };
  });

  return {
    nodes: normalizedNodes,
    edges: routedEdges
  };
}
