import type { Edge, Node } from "reactflow";
import {
  expandPackageTemplate,
  parseFlowSpec,
  welcomeSeriesFixture,
  type FlowNode,
  type FlowSpec
} from "@flow/core";
import { buildLayout } from "@flow/layout";
import { EDGE_STYLE, rfContainerWidth } from "../constants";
import type { AppNodeData, NodeKind, TemplateChoice } from "../types/flow";

export function getSpecFromChoice(choice: TemplateChoice): FlowSpec {
  if (choice === "welcome-series" || choice === "custom") {
    return parseFlowSpec(welcomeSeriesFixture);
  }
  return expandPackageTemplate(choice).flows[0];
}

export function sanitizeId(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
}

export function nodeSubtitle(node: FlowNode): string {
  if (node.type === "message") return node.channel.toUpperCase();
  if (node.type === "wait") return `${node.duration.value} ${node.duration.unit}`;
  if (node.type === "split") return node.condition;
  if (node.type === "trigger") return node.event;
  if (node.type === "note") return node.body;
  if (node.type === "strategy") return node.primaryFocus;
  if (node.type === "merge") return "Merge point";
  return node.type;
}

export function downloadBlob(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function createFlowNode(kind: NodeKind): FlowNode {
  const id = sanitizeId(`${kind}_${Date.now()}`);
  if (kind === "trigger") return { id, type: "trigger", title: "Trigger", event: "Define your trigger" };
  if (kind === "email") return { id, type: "message", channel: "email", title: "Email" };
  if (kind === "sms") return { id, type: "message", channel: "sms", title: "SMS" };
  if (kind === "wait") return { id, type: "wait", duration: { value: 1, unit: "days" } };
  if (kind === "split") return { id, type: "split", title: "Conditional Split", condition: "Condition", labels: ["Yes", "No"] };
  if (kind === "profileFilter") return { id, type: "profileFilter", title: "Profile Filters", filters: ["Filter"] };
  if (kind === "note") return { id, type: "note", title: "OBJECTIVE/FOCUS:", body: "Describe the objective here..." };
  if (kind === "strategy") return { id, type: "strategy", title: "STRATEGY", primaryFocus: "Primary focus...", secondaryFocus: "Secondary focus..." };
  if (kind === "merge") return { id, type: "merge", title: "Merge" };
  return { id, type: "outcome", title: "Outcome", result: "Completed" };
}

export function toRfNode(flowNode: FlowNode, position: { x: number; y: number }): Node<AppNodeData> {
  return {
    id: flowNode.id,
    type: "flowNode",
    position,
    style: { width: rfContainerWidth(flowNode.type) },
    data: {
      title: "title" in flowNode ? flowNode.title : flowNode.type,
      subtitle: nodeSubtitle(flowNode),
      nodeType: flowNode.type,
      flowNode
    }
  };
}

export function specToRfNodes(spec: FlowSpec): Node<AppNodeData>[] {
  try {
    const layout = buildLayout(spec, { positionOverrides: spec.ui?.nodePositions ?? {} });
    return layout.nodes.map((ln) => {
      const raw = spec.nodes.find((n) => n.id === ln.id);
      const flowNode: FlowNode = raw ?? ({ id: ln.id, type: "outcome", title: ln.title, result: "" } as FlowNode);
      return toRfNode(flowNode, { x: ln.x, y: ln.y });
    });
  } catch (err) {
    console.error("buildLayout failed in specToRfNodes, using simple grid:", err);
    return spec.nodes.map((fn, i) => toRfNode(fn, { x: 300, y: 80 + i * 160 }));
  }
}

export function specToRfEdges(spec: FlowSpec, rfNodes?: Node<AppNodeData>[]): Edge[] {
  const sideNodeIds = new Set(
    spec.nodes.filter((n) => n.type === "note" || n.type === "strategy").map((n) => n.id)
  );
  const nodeById = new Map(spec.nodes.map((n) => [n.id, n]));

  const nodePositionMap = new Map<string, { x: number }>();
  if (rfNodes) {
    for (const n of rfNodes) nodePositionMap.set(n.id, n.position);
  }

  const BRANCH_COLORS = ["#2563eb", "#6b7280", "#7c3aed", "#d97706", "#059669", "#dc2626"];
  const splitLabelMap = new Map<string, number>();
  for (const n of spec.nodes) {
    if (n.type === "split") {
      const labels: string[] = Array.isArray(n.labels) ? n.labels : ["Yes", "No"];
      labels.forEach((l, i) => splitLabelMap.set(`${n.id}::${l.trim().toLowerCase()}`, i));
    }
  }

  return spec.edges.map((e) => {
    const normalizedLabel = typeof e.label === "string" ? e.label.trim().toLowerCase() : "";
    const targetNode = nodeById.get(e.to);
    const isEndTarget = targetNode?.type === "outcome";
    const edgeBase = isEndTarget
      ? { ...EDGE_STYLE, markerEnd: undefined as unknown as never }
      : EDGE_STYLE;

    let branchLabelStyle: Record<string, unknown> = {};
    const sourceNode = nodeById.get(e.from);
    if (sourceNode?.type === "split" && normalizedLabel) {
      const idx = splitLabelMap.get(`${e.from}::${normalizedLabel}`) ?? 0;
      const color = BRANCH_COLORS[idx % BRANCH_COLORS.length];
      branchLabelStyle = {
        labelStyle: { fill: "#ffffff", fontWeight: 600, fontSize: 10 },
        labelBgStyle: { fill: color, fillOpacity: 1 },
        labelBgPadding: [8, 3] as [number, number],
        labelBgBorderRadius: 10
      };
    }

    if (!sideNodeIds.has(e.from)) {
      return { id: e.id, source: e.from, target: e.to, label: e.label, ...edgeBase, ...branchLabelStyle };
    }

    const sourcePos = nodePositionMap.get(e.from);
    const targetPos = nodePositionMap.get(e.to);
    const isRightSide = sourcePos && targetPos ? sourcePos.x > targetPos.x : false;

    return {
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.label,
      sourceHandle: isRightSide ? "source-left" : "source-right",
      targetHandle: isRightSide ? "right" : "left",
      ...edgeBase,
      ...branchLabelStyle
    };
  });
}

export function editorToFlowSpec(rfNodes: Node<AppNodeData>[], rfEdges: Edge[]): FlowSpec {
  const channels = new Set<"email" | "sms">(["email"]);
  const flowNodes: FlowNode[] = rfNodes.map((n) => {
    const fn = n.data.flowNode;
    if (fn.type === "message") channels.add(fn.channel);
    return fn;
  });
  const flowEdges = rfEdges.map((e) => ({
    id: e.id, from: e.source, to: e.target,
    ...(typeof e.label === "string" && e.label ? { label: e.label } : {})
  }));
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of rfNodes) positions[n.id] = n.position;
  return {
    id: "editor_flow", name: "Custom Editor Flow", source: { mode: "manual" },
    channels: [...channels], defaults: { delay: { value: 2, unit: "days" } },
    nodes: flowNodes, edges: flowEdges, ui: { nodePositions: positions }
  } as FlowSpec;
}
