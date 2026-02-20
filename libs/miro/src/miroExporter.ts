import type { FlowSpec } from "@flow/core";
import { buildLayout, type PositionedNode } from "@flow/layout";

type MiroShapeResponse = { id: string };
type MiroApiError = { status: number; body: string };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ExportFlowToMiroOptions = {
  boardId: string;
  accessToken: string;
  flowSpec: FlowSpec;
  originX?: number;
  originY?: number;
  positionOverrides?: Record<string, { x: number; y: number }>;
  fetchImpl?: FetchLike;
  maxRetries?: number;
};

export type ExportFlowToMiroResult = {
  shapeCount: number;
  connectorCount: number;
  itemMap: Record<string, string>;
};

const BASE_URL = "https://api.miro.com/v2";
const MIRO_GAP = 50;
const MIRO_SPLIT_GAP = 110;
const MIRO_END_EXTRA = 30;

/* ── helpers ── */

function esc(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(response: Response, attempt: number): number {
  const ra = response.headers.get("retry-after");
  if (ra) {
    const v = Number(ra);
    if (Number.isFinite(v) && v >= 0) return v * 1000;
  }
  return Math.min(250 * 2 ** attempt, 5000);
}

async function requestWithRetry<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  maxRetries: number
): Promise<T> {
  let attempt = 0;
  while (true) {
    const res = await fetchImpl(url, init);
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      const body = await res.text();
      console.error(`Miro API error (${res.status}):`, body);
      throw { status: res.status, body } satisfies MiroApiError;
    }
    console.warn(`Miro ${res.status}, retry ${attempt + 1}/${maxRetries}`);
    await sleep(retryDelay(res, attempt));
    attempt++;
  }
}

/* ── Miro shape height estimation ── */

function estimateMiroHeight(
  specNode: FlowSpec["nodes"][number],
  width: number
): number {
  const FONT = 12;
  const LINE_H = 24;          // Miro renders lines taller than raw font size
  const PARA_GAP = 6;         // extra gap between paragraphs in Miro
  const PAD = 44;             // top + bottom padding inside the shape
  const charsPerLine = Math.floor((width - 36) / (FONT * 0.58));

  function textLines(text: string): number {
    return Math.max(1, Math.ceil(text.length / charsPerLine));
  }

  function pHeight(text: string): number {
    return textLines(text) * LINE_H + PARA_GAP;
  }

  if (specNode.type === "wait") return 52;
  if (specNode.type === "outcome") return 40;
  if (specNode.type === "merge") return 40;

  if (specNode.type === "trigger") {
    return PAD + pHeight(specNode.title ?? "Trigger") + pHeight(specNode.event);
  }

  if (specNode.type === "split") {
    return PAD + pHeight(specNode.title ?? "Split") + pHeight(specNode.condition);
  }

  if (specNode.type === "profileFilter") {
    return PAD + pHeight(specNode.title ?? "Filter") + pHeight(specNode.filters.join(", "));
  }

  if (specNode.type === "note") {
    return PAD + pHeight(specNode.title ?? "Note") + pHeight(specNode.body);
  }

  if (specNode.type === "strategy") {
    return PAD
      + pHeight("STRATEGY")
      + pHeight("PRIMARY FOCUS") + pHeight(specNode.primaryFocus)
      + pHeight("SECONDARY FOCUS") + pHeight(specNode.secondaryFocus);
  }

  if (specNode.type === "message") {
    const titlePrefix = specNode.channel === "email" ? "Email: " : "SMS: ";
    let h = PAD;
    h += pHeight(titlePrefix + (specNode.title ?? "Message"));  // title with prefix
    h += LINE_H;                                 // blank line after title
    h += pHeight("Message Type:  Email");
    h += pHeight("AB Test:  ...");
    h += pHeight("Smart Sending:  OFF");
    h += pHeight("UTM Links:  YES");

    if (specNode.discountCode?.included) {
      const desc = specNode.discountCode.description || "";
      h += pHeight(`Discount:  [YES] - ${desc}`);
    } else {
      h += pHeight("Discount:  No");
    }

    h += pHeight(`Filter conditions:  ${specNode.filterConditions || "NA"}`);
    h += pHeight(`Implementation Notes:  ${specNode.implementationNotes || "..."}`);

    if (specNode.strategy) {
      h += LINE_H;                                // blank separator
      h += pHeight("STRATEGY");
      h += pHeight("PRIMARY FOCUS");
      h += pHeight(specNode.strategy.primaryFocus);
      h += pHeight("SECONDARY FOCUS");
      h += pHeight(specNode.strategy.secondaryFocus);
    }
    return h;
  }

  return 80;
}

/* ── recompute Y positions using estimated heights ── */

function recomputeMiroY(
  nodes: PositionedNode[],
  edges: FlowSpec["edges"],
  specNodes: FlowSpec["nodes"],
  miroHeights: Map<string, number>
): Map<string, number> {
  const sideTypes = new Set(["note", "strategy"]);
  const sideIds = new Set(nodes.filter((n) => sideTypes.has(n.type)).map((n) => n.id));

  const mainEdges = edges.filter((e) => !sideIds.has(e.from));
  const sideEdges = edges.filter((e) => sideIds.has(e.from));

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
    if (!parents.has(e.to) || !children.has(e.from)) continue;
    parents.get(e.to)!.push(e.from);
    children.get(e.from)!.push(e.to);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) if (deg === 0) queue.push(id);

  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const child of children.get(id) ?? []) {
      const d = (inDeg.get(child) ?? 1) - 1;
      inDeg.set(child, d);
      if (d === 0) queue.push(child);
    }
  }
  for (const n of nodes) if (!sideIds.has(n.id) && !topo.includes(n.id)) topo.push(n.id);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const specMap = new Map(specNodes.map((n) => [n.id, n]));

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
      newY.set(id, node.y);
      continue;
    }

    let maxY = 0;
    for (const pid of pList) {
      const pNode = nodeMap.get(pid);
      if (!pNode) continue;
      const pY = newY.get(pid) ?? pNode.y;
      const pH = miroHeights.get(pid) ?? pNode.height;
      const pSpec = specMap.get(pid);
      const gap = pSpec?.type === "split" ? MIRO_SPLIT_GAP : MIRO_GAP;
      const candidate = pY + pH + gap;
      if (candidate > maxY) maxY = candidate;
    }

    if (node.type === "outcome") maxY += MIRO_END_EXTRA;
    if (node.type === "merge") maxY += MIRO_END_EXTRA;
    newY.set(id, maxY);
  }

  for (const e of sideEdges) {
    const targetY = newY.get(e.to);
    if (targetY !== undefined) newY.set(e.from, targetY);
  }

  return newY;
}

/* ── styling per node type ── */

type MiroStyle = {
  shape: string;
  fillColor: string;
  borderColor: string;
  borderWidth: string;
  textAlign: "left" | "center" | "right";
  textAlignVertical: "top" | "middle" | "bottom";
  fontSize: string;
  fontFamily: string;
};

function shapeStyle(nodeType: string, specNode?: FlowSpec["nodes"][number]): MiroStyle {
  const base = {
    borderWidth: "2.0",
    fontSize: "14",
    fontFamily: "open_sans" as const,
  };

  switch (nodeType) {
    case "trigger":
      return { ...base, shape: "round_rectangle", fillColor: "#EFF6FF", borderColor: "#3B82F6", textAlign: "center", textAlignVertical: "top" };
    case "split":
      return { ...base, shape: "round_rectangle", fillColor: "#FAF5FF", borderColor: "#8B5CF6", textAlign: "center", textAlignVertical: "top" };
    case "wait":
      return { ...base, shape: "round_rectangle", fillColor: "#F3F4F6", borderColor: "#9CA3AF", textAlign: "center", textAlignVertical: "middle" };
    case "outcome":
      return { ...base, shape: "round_rectangle", fillColor: "#ECFDF5", borderColor: "#10B981", textAlign: "center", textAlignVertical: "middle", fontSize: "12" };
    case "merge":
      return { ...base, shape: "round_rectangle", fillColor: "#F5F3FF", borderColor: "#8B5CF6", textAlign: "center", textAlignVertical: "middle", fontSize: "12" };
    case "profileFilter":
      return { ...base, shape: "round_rectangle", fillColor: "#FFFBEB", borderColor: "#F59E0B", textAlign: "center", textAlignVertical: "top" };
    case "note":
      return { ...base, shape: "rectangle", fillColor: "#FFF8F0", borderColor: "#F59E0B", textAlign: "left", textAlignVertical: "top", fontSize: "12" };
    case "strategy": {
      const branch = specNode && "branchLabel" in specNode ? specNode.branchLabel : "yes";
      const isNo = branch === "no";
      return { ...base, shape: "rectangle", fillColor: isNo ? "#EFF6FF" : "#FFF7ED", borderColor: isNo ? "#3B82F6" : "#F97316", textAlign: "left", textAlignVertical: "top", fontSize: "12" };
    }
    case "message": {
      const channel = specNode && "channel" in specNode ? specNode.channel : "email";
      const isSms = channel === "sms";
      return {
        ...base,
        shape: "rectangle",
        fillColor: "#FFFFFF",
        borderColor: isSms ? "#4CAF50" : "#6495ED",
        borderWidth: "2.0",
        textAlign: "left",
        textAlignVertical: "top",
        fontSize: "12",
      };
    }
    default:
      return { ...base, shape: "round_rectangle", fillColor: "#FFFFFF", borderColor: "#CBD5E1", textAlign: "center", textAlignVertical: "top" };
  }
}

/* ── node content (HTML for Miro shapes) ── */

function nodeContent(specNode: FlowSpec["nodes"][number]): string {
  const title = "title" in specNode ? specNode.title : specNode.type;

  if (specNode.type === "wait") {
    const { value, unit } = specNode.duration;
    const noun = Math.abs(value) === 1 ? unit.replace(/s$/, "") : unit;
    return `<p><strong>Wait ${value} ${noun}</strong></p>`;
  }

  if (specNode.type === "outcome") {
    return `<p><strong>End</strong></p>`;
  }

  if (specNode.type === "merge") {
    return `<p><strong>Merge</strong></p>`;
  }

  if (specNode.type === "message") {
    const isEmail = specNode.channel === "email";
    const prefix = isEmail ? "Email: " : "SMS: ";
    const lines: string[] = [];

    lines.push(`<p><strong>${prefix}${esc(title)}</strong></p>`);
    lines.push("");

    // Fields
    lines.push(`<p><strong>Message Type:</strong>  ${isEmail ? "Email" : "SMS"}</p>`);
    lines.push(`<p><strong>AB Test:</strong>  ${specNode.abTest ? esc(specNode.abTest.description) : "..."}</p>`);
    lines.push(`<p><strong>Smart Sending:</strong>  ${specNode.smartSending ? "ON" : "OFF"}</p>`);
    lines.push(`<p><strong>UTM Links:</strong>  ${specNode.utmLinks !== false ? "YES" : "NO"}</p>`);

    if (specNode.discountCode?.included) {
      const desc = specNode.discountCode.description ? ` - ${esc(specNode.discountCode.description)}` : "";
      lines.push(`<p><strong>Discount:</strong>  [YES]${desc}</p>`);
    } else {
      lines.push(`<p><strong>Discount:</strong>  No</p>`);
    }

    lines.push(`<p><strong>Filter conditions:</strong>  ${esc(specNode.filterConditions || "NA")}</p>`);
    lines.push(`<p><strong>Implementation Notes:</strong>  ${esc(specNode.implementationNotes || "...")}</p>`);

    if (specNode.strategy) {
      lines.push("");
      lines.push(`<p><strong>STRATEGY</strong></p>`);
      lines.push(`<p><strong>PRIMARY FOCUS</strong></p>`);
      lines.push(`<p>${esc(specNode.strategy.primaryFocus)}</p>`);
      lines.push(`<p><strong>SECONDARY FOCUS</strong></p>`);
      lines.push(`<p>${esc(specNode.strategy.secondaryFocus)}</p>`);
    }

    return lines.join("\n");
  }

  if (specNode.type === "split") {
    return `<p><strong>${esc(title)}</strong></p>\n<p>${esc(specNode.condition)}</p>`;
  }

  if (specNode.type === "trigger") {
    return `<p><strong>${esc(title)}</strong></p>\n<p>${esc(specNode.event)}</p>`;
  }

  if (specNode.type === "profileFilter") {
    return `<p><strong>${esc(title)}</strong></p>\n<p>${specNode.filters.map(esc).join(", ")}</p>`;
  }

  if (specNode.type === "note") {
    return `<p><strong>${esc(title)}</strong></p>\n<p>${esc(specNode.body)}</p>`;
  }

  if (specNode.type === "strategy") {
    return [
      `<p><strong>STRATEGY</strong></p>`,
      `<p><strong>PRIMARY FOCUS</strong></p>`,
      `<p>${esc(specNode.primaryFocus)}</p>`,
      `<p><strong>SECONDARY FOCUS</strong></p>`,
      `<p>${esc(specNode.secondaryFocus)}</p>`,
    ].join("\n");
  }

  return `<p><strong>${esc(title)}</strong></p>`;
}

/* ── main export function ── */

export async function exportFlowToMiro({
  boardId,
  accessToken,
  flowSpec,
  originX = 0,
  originY = 0,
  positionOverrides,
  fetchImpl = fetch,
  maxRetries = 3
}: ExportFlowToMiroOptions): Promise<ExportFlowToMiroResult> {
  /* Run layout engine for lane (X) assignments.
     We'll recompute Y ourselves using content-based heights. */
  const layout = buildLayout(flowSpec, {
    positionOverrides,
    nodeSizeOverrides: { note: { width: 320, height: 110 } }
  });

  const nodeById = new Map(flowSpec.nodes.map((n) => [n.id, n]));

  /* Compute dynamic sizes per node based on content.
     Wait + message cards share the same width (320) so vertical arrows align. */
  const MIRO_CARD_WIDTH = 320;
  const miroHeights = new Map<string, number>();
  const miroWidths = new Map<string, number>();
  for (const ln of layout.nodes) {
    const specNode = nodeById.get(ln.id);
    const wideTypes = new Set(["message", "wait"]);
    const w = specNode && wideTypes.has(specNode.type) ? Math.max(ln.width, MIRO_CARD_WIDTH) : ln.width;
    const h = specNode ? estimateMiroHeight(specNode, w) : ln.height;
    miroHeights.set(ln.id, h);
    miroWidths.set(ln.id, w);
  }

  /* Recompute Y positions using those heights + fixed gaps */
  const newY = recomputeMiroY(layout.nodes, flowSpec.edges, flowSpec.nodes, miroHeights);

  const itemMap: Record<string, string> = {};
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  const sideNodeTypes = new Set(["note", "strategy"]);

  /* ── Create shapes ── */
  for (const positioned of layout.nodes) {
    const specNode = nodeById.get(positioned.id);
    if (!specNode) continue;

    const st = shapeStyle(positioned.type, specNode);
    const w = miroWidths.get(positioned.id) ?? positioned.width;
    const h = miroHeights.get(positioned.id) ?? positioned.height;
    const y = newY.get(positioned.id) ?? positioned.y;

    /* Use the lane center from the layout engine (original width) so every
       shape on the same lane shares the exact same center-X, ensuring
       straight vertical connectors regardless of overridden widths. */
    const laneCenter = positioned.x + positioned.width / 2;

    const payload = {
      data: {
        content: nodeContent(specNode),
        shape: st.shape
      },
      style: {
        fillColor: st.fillColor,
        borderColor: st.borderColor,
        borderWidth: st.borderWidth,
        textAlign: st.textAlign,
        textAlignVertical: st.textAlignVertical,
        fontSize: st.fontSize,
        fontFamily: st.fontFamily,
        color: "#1a1a1a",
      },
      position: {
        x: originX + laneCenter,
        y: originY + y + h / 2
      },
      geometry: { width: w, height: h }
    };

    const created = await requestWithRetry<MiroShapeResponse>(
      fetchImpl,
      `${BASE_URL}/boards/${boardId}/shapes`,
      { method: "POST", headers, body: JSON.stringify(payload) },
      maxRetries
    );
    itemMap[positioned.id] = created.id;
  }

  /* ── Create connectors ── */
  const positionMap = new Map(
    layout.nodes.map((n) => [n.id, { x: n.x, width: miroWidths.get(n.id) ?? n.width }])
  );

  for (const edge of flowSpec.edges) {
    const startItem = itemMap[edge.from];
    const endItem = itemMap[edge.to];
    if (!startItem || !endItem) continue;

    const fromNode = nodeById.get(edge.from);
    const isSideEdge = fromNode ? sideNodeTypes.has(fromNode.type) : false;
    const isSplitEdge = fromNode?.type === "split";

    let startSnap = "bottom";
    let endSnap = "top";

    if (isSideEdge) {
      const src = positionMap.get(edge.from);
      const tgt = positionMap.get(edge.to);
      if (src && tgt) {
        const sCx = src.x + src.width / 2;
        const tCx = tgt.x + tgt.width / 2;
        startSnap = sCx > tCx ? "left" : "right";
        endSnap = sCx > tCx ? "right" : "left";
      } else {
        startSnap = "right";
        endSnap = "left";
      }
    }

    /* Split edges: elbowed (down → horizontal → down into child).
       All other edges: straight vertical lines. */
    const connShape = isSplitEdge ? "elbowed" : "straight";

    const payload = {
      startItem: { id: startItem, snapTo: startSnap },
      endItem: { id: endItem, snapTo: endSnap },
      shape: connShape,
      style: {
        strokeColor: isSideEdge ? "#F59E0B" : "#94A3B8",
        strokeWidth: isSideEdge ? 1 : 1.5,
        strokeStyle: isSideEdge ? "dashed" : "normal",
        endStrokeCap: "stealth" as const,
        startStrokeCap: "none" as const,
      },
      captions: edge.label ? [{ content: edge.label, position: "50%" }] : undefined
    };

    await requestWithRetry(
      fetchImpl,
      `${BASE_URL}/boards/${boardId}/connectors`,
      { method: "POST", headers, body: JSON.stringify(payload) },
      maxRetries
    );
  }

  return {
    shapeCount: Object.keys(itemMap).length,
    connectorCount: flowSpec.edges.length,
    itemMap
  };
}
