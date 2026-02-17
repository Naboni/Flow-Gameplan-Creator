export type GraphErrorCode =
  | "NO_TRIGGER"
  | "MULTIPLE_TRIGGERS"
  | "UNREACHABLE_NODE"
  | "DEAD_END"
  | "NO_TERMINAL_PATH"
  | "SPLIT_MISSING_LABEL"
  | "SPLIT_EXTRA_EDGE"
  | "SPLIT_SHARED_TARGET"
  | "DUPLICATE_EDGE"
  | "DANGLING_EDGE";

export type GraphError = {
  code: GraphErrorCode;
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
};

export type GraphValidationResult = {
  valid: boolean;
  errors: GraphError[];
};

type RawNode = { id: string; type: string; labels?: unknown; [k: string]: unknown };
type RawEdge = { id: string; from: string; to: string; label?: string };

function toNodes(input: unknown): RawNode[] {
  if (!input || typeof input !== "object") return [];
  const spec = input as Record<string, unknown>;
  const arr = Array.isArray(spec.nodes) ? spec.nodes : [];
  return arr.filter((n): n is RawNode => !!n && typeof n === "object" && "id" in n && "type" in n);
}

function toEdges(input: unknown): RawEdge[] {
  if (!input || typeof input !== "object") return [];
  const spec = input as Record<string, unknown>;
  const arr = Array.isArray(spec.edges) ? spec.edges : [];
  return arr.filter((e): e is RawEdge => !!e && typeof e === "object" && "id" in e && "from" in e && "to" in e);
}

function getSplitLabels(node: RawNode): string[] {
  const raw = node.labels;
  if (Array.isArray(raw)) return raw.filter((l): l is string => typeof l === "string" && l.trim().length > 0);
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const yes = typeof obj.yes === "string" ? obj.yes : "Yes";
    const no = typeof obj.no === "string" ? obj.no : "No";
    return [yes, no];
  }
  return ["Yes", "No"];
}

/**
 * Validate the structural integrity of a FlowSpec as a directed graph.
 * This checks semantic correctness beyond what Zod schema validation covers:
 * connectivity, reachability, split consistency, and path termination.
 */
export function validateFlowGraph(spec: unknown): GraphValidationResult {
  const errors: GraphError[] = [];
  const nodes = toNodes(spec);
  const edges = toEdges(spec);

  if (nodes.length === 0) return { valid: true, errors: [] };

  const nodeIds = new Set(nodes.map(n => n.id));
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // --- Trigger check ---
  const triggers = nodes.filter(n => n.type === "trigger");
  if (triggers.length === 0) {
    errors.push({ code: "NO_TRIGGER", message: "Flow must contain exactly one trigger node." });
  } else if (triggers.length > 1) {
    errors.push({ code: "MULTIPLE_TRIGGERS", message: `Flow has ${triggers.length} trigger nodes; expected exactly 1.`, nodeIds: triggers.map(t => t.id) });
  }

  // --- Dangling edges ---
  for (const edge of edges) {
    const missing: string[] = [];
    if (!nodeIds.has(edge.from)) missing.push(edge.from);
    if (!nodeIds.has(edge.to)) missing.push(edge.to);
    if (missing.length > 0) {
      errors.push({ code: "DANGLING_EDGE", message: `Edge ${edge.id} references missing node(s): ${missing.join(", ")}.`, edgeIds: [edge.id], nodeIds: missing });
    }
  }

  // --- Build adjacency ---
  const outgoing = new Map<string, RawEdge[]>();
  const incoming = new Map<string, RawEdge[]>();
  for (const n of nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }
  for (const e of edges) {
    if (nodeIds.has(e.from)) outgoing.get(e.from)!.push(e);
    if (nodeIds.has(e.to)) incoming.get(e.to)!.push(e);
  }

  // --- Reachability (BFS from trigger) ---
  const triggerId = triggers[0]?.id;
  const reachable = new Set<string>();
  if (triggerId) {
    const queue = [triggerId];
    reachable.add(triggerId);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const edge of outgoing.get(cur) ?? []) {
        if (!reachable.has(edge.to) && nodeIds.has(edge.to)) {
          reachable.add(edge.to);
          queue.push(edge.to);
        }
      }
    }

    const unreachable = nodes.filter(n => !reachable.has(n.id) && n.type !== "note" && n.type !== "strategy");
    for (const orphan of unreachable) {
      errors.push({ code: "UNREACHABLE_NODE", message: `Node "${orphan.id}" (${orphan.type}) is not reachable from the trigger.`, nodeIds: [orphan.id] });
    }
  }

  // --- Dead ends: non-outcome, non-merge nodes must have outgoing edges ---
  const terminalTypes = new Set(["outcome", "note", "strategy"]);
  for (const node of nodes) {
    if (terminalTypes.has(node.type)) continue;
    const out = outgoing.get(node.id) ?? [];
    if (out.length === 0) {
      errors.push({ code: "DEAD_END", message: `Node "${node.id}" (${node.type}) has no outgoing edges — it is a dead end.`, nodeIds: [node.id] });
    }
  }

  // --- Path termination: every path from trigger must reach an outcome ---
  if (triggerId && reachable.size > 0) {
    const canReachOutcome = new Set<string>();
    const outcomeIds = nodes.filter(n => n.type === "outcome").map(n => n.id);
    for (const oid of outcomeIds) canReachOutcome.add(oid);

    // Reverse BFS from outcome nodes
    const rQueue = [...outcomeIds];
    while (rQueue.length > 0) {
      const cur = rQueue.shift()!;
      for (const edge of incoming.get(cur) ?? []) {
        if (!canReachOutcome.has(edge.from)) {
          canReachOutcome.add(edge.from);
          rQueue.push(edge.from);
        }
      }
    }

    const strandedReachable = nodes.filter(n =>
      reachable.has(n.id) && !canReachOutcome.has(n.id) && !terminalTypes.has(n.type) && n.type !== "merge"
    );
    if (strandedReachable.length > 0) {
      errors.push({
        code: "NO_TERMINAL_PATH",
        message: `Node(s) ${strandedReachable.map(n => `"${n.id}"`).join(", ")} are reachable but no path from them leads to an outcome/end node.`,
        nodeIds: strandedReachable.map(n => n.id)
      });
    }
  }

  // --- Split completeness ---
  for (const node of nodes) {
    if (node.type !== "split") continue;
    const labels = getSplitLabels(node);
    const out = outgoing.get(node.id) ?? [];
    const edgeLabels = out.map(e => (e.label ?? "").trim().toLowerCase());

    for (const required of labels) {
      if (!edgeLabels.includes(required.trim().toLowerCase())) {
        errors.push({
          code: "SPLIT_MISSING_LABEL",
          message: `Split "${node.id}" is missing an outgoing edge with label "${required}".`,
          nodeIds: [node.id]
        });
      }
    }

    const expectedCount = labels.length;
    if (out.length > expectedCount) {
      errors.push({
        code: "SPLIT_EXTRA_EDGE",
        message: `Split "${node.id}" has ${out.length} outgoing edges but only ${expectedCount} labels.`,
        nodeIds: [node.id],
        edgeIds: out.map(e => e.id)
      });
    }
  }

  // --- Split isolation: branches must not share the same direct target ---
  for (const node of nodes) {
    if (node.type !== "split") continue;
    const out = outgoing.get(node.id) ?? [];
    const targets = out.map(e => e.to);
    const seen = new Set<string>();
    for (let i = 0; i < targets.length; i++) {
      if (seen.has(targets[i])) {
        errors.push({
          code: "SPLIT_SHARED_TARGET",
          message: `Split "${node.id}" has multiple branches pointing to the same node "${targets[i]}". Each branch must lead to its own distinct node.`,
          nodeIds: [node.id, targets[i]]
        });
        break;
      }
      seen.add(targets[i]);
    }
  }

  // --- Duplicate edges ---
  const edgeKeys = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}|${(edge.label ?? "").toLowerCase().trim()}`;
    if (edgeKeys.has(key)) {
      errors.push({ code: "DUPLICATE_EDGE", message: `Duplicate edge from "${edge.from}" to "${edge.to}" with label "${edge.label ?? ""}".`, edgeIds: [edge.id] });
    }
    edgeKeys.add(key);
  }

  return { valid: errors.length === 0, errors };
}
