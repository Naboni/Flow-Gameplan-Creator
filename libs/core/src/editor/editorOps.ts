import type { FlowEdge, FlowNode, FlowSpec } from "../schema/flowSpec.js";
import { parseFlowSpecSafe } from "../schema/flowSpec.js";

function cloneSpec(spec: FlowSpec): FlowSpec {
  return JSON.parse(JSON.stringify(spec)) as FlowSpec;
}

function nextId(prefix: string, existing: string[]): string {
  let index = 1;
  while (existing.includes(`${prefix}_${index}`)) {
    index += 1;
  }
  return `${prefix}_${index}`;
}

function validateOrThrow(spec: FlowSpec): FlowSpec {
  const parsed = parseFlowSpecSafe(spec);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(details);
  }
  return parsed.data;
}

export function addNode(spec: FlowSpec, node: FlowNode): FlowSpec {
  const draft = cloneSpec(spec);
  draft.nodes.push(node);
  return validateOrThrow(draft);
}

export function removeNode(spec: FlowSpec, nodeId: string): FlowSpec {
  const draft = cloneSpec(spec);
  draft.nodes = draft.nodes.filter((node) => node.id !== nodeId);
  draft.edges = draft.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  if (draft.ui?.nodePositions) {
    delete draft.ui.nodePositions[nodeId];
  }
  return validateOrThrow(draft);
}

export function addEdge(spec: FlowSpec, edge: Omit<FlowEdge, "id"> & { id?: string }): FlowSpec {
  const draft = cloneSpec(spec);
  const id = edge.id ?? nextId("edge", draft.edges.map((current) => current.id));
  draft.edges.push({ id, from: edge.from, to: edge.to, label: edge.label });
  return validateOrThrow(draft);
}

export function removeEdge(spec: FlowSpec, edgeId: string): FlowSpec {
  const draft = cloneSpec(spec);
  draft.edges = draft.edges.filter((edge) => edge.id !== edgeId);
  return validateOrThrow(draft);
}

export function updateEdgeLabel(spec: FlowSpec, edgeId: string, label: string): FlowSpec {
  const draft = cloneSpec(spec);
  draft.edges = draft.edges.map((edge) =>
    edge.id === edgeId ? { ...edge, label: label.trim() || undefined } : edge
  );
  return validateOrThrow(draft);
}

export function updateNodeTitle(spec: FlowSpec, nodeId: string, title: string): FlowSpec {
  const draft = cloneSpec(spec);
  draft.nodes = draft.nodes.map((node) =>
    node.id === nodeId && "title" in node ? { ...node, title } : node
  );
  return validateOrThrow(draft);
}
