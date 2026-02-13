import type { FlowSpec } from "@flow/core";
import { buildLayout } from "@flow/layout";

type MiroShapeResponse = {
  id: string;
};

type MiroApiError = {
  status: number;
  body: string;
};

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

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const value = Number(retryAfter);
    if (Number.isFinite(value) && value >= 0) {
      return value * 1000;
    }
  }
  const backoff = 250 * 2 ** attempt;
  return Math.min(backoff, 5000);
}

async function requestWithRetry<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  maxRetries: number
): Promise<T> {
  let attempt = 0;
  while (true) {
    const response = await fetchImpl(url, init);
    if (response.ok) {
      return (await response.json()) as T;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      const body = await response.text();
      console.error(`Miro API error (${response.status}):`, body);
      const error: MiroApiError = { status: response.status, body };
      throw error;
    }
    console.warn(`Miro API returned ${response.status}, retrying (attempt ${attempt + 1}/${maxRetries})...`);
    const delayMs = getRetryDelayMs(response, attempt);
    await sleep(delayMs);
    attempt += 1;
  }
}

function shapeStyleForNodeType(nodeType: string, specNode?: FlowSpec["nodes"][number]) {
  switch (nodeType) {
    case "trigger":
      return { shape: "round_rectangle", fillColor: "#EFF6FF", borderColor: "#3B82F6", textAlign: "center" as const };
    case "split":
      return { shape: "round_rectangle", fillColor: "#FAF5FF", borderColor: "#8B5CF6", textAlign: "center" as const };
    case "wait":
      return { shape: "round_rectangle", fillColor: "#F3F4F6", borderColor: "#9CA3AF", textAlign: "center" as const };
    case "outcome":
      return { shape: "round_rectangle", fillColor: "#ECFDF5", borderColor: "#10B981", textAlign: "center" as const };
    case "profileFilter":
      return { shape: "round_rectangle", fillColor: "#FFFBEB", borderColor: "#F59E0B", textAlign: "center" as const };
    case "note":
      return { shape: "rectangle", fillColor: "#FFF8F0", borderColor: "#F59E0B", textAlign: "left" as const };
    case "strategy": {
      const branch = specNode && "branchLabel" in specNode ? specNode.branchLabel : "yes";
      if (branch === "no") {
        return { shape: "rectangle", fillColor: "#EFF6FF", borderColor: "#3B82F6", textAlign: "left" as const };
      }
      return { shape: "rectangle", fillColor: "#FFF7ED", borderColor: "#F97316", textAlign: "left" as const };
    }
    case "message": {
      const channel = specNode && "channel" in specNode ? specNode.channel : "email";
      if (channel === "sms") {
        return { shape: "round_rectangle", fillColor: "#FFFFFF", borderColor: "#EF4444", textAlign: "left" as const };
      }
      return { shape: "round_rectangle", fillColor: "#FFFFFF", borderColor: "#22C55E", textAlign: "left" as const };
    }
    default:
      return { shape: "round_rectangle", fillColor: "#FFFFFF", borderColor: "#CBD5E1", textAlign: "center" as const };
  }
}

function nodeContent(specNode: FlowSpec["nodes"][number]): string {
  const title = "title" in specNode ? specNode.title : specNode.type;

  if (specNode.type === "wait") {
    return `<p><strong>Wait ${specNode.duration.value} ${specNode.duration.unit}</strong></p>`;
  }

  if (specNode.type === "message") {
    let sections = `<p><strong>${escapeHtml(title)}</strong></p>`;
    if (specNode.discountCode) {
      const icon = specNode.discountCode.included ? "[YES]" : "[NO]";
      const text = specNode.discountCode.included
        ? (specNode.discountCode.description || specNode.discountCode.code || "discount code")
        : "no discount code";
      sections += `<p>${icon} ${escapeHtml(text)}</p>`;
    }
    if (specNode.abTest) {
      sections += `<p><strong>A/B Test:</strong> ${escapeHtml(specNode.abTest.description)}</p>`;
    }
    if (specNode.messagingFocus) {
      sections += `<p><strong>Messaging:</strong> ${escapeHtml(specNode.messagingFocus)}</p>`;
    }
    return sections;
  }

  if (specNode.type === "split") {
    return `<p><strong>${escapeHtml(title)}</strong><br/>${escapeHtml(specNode.condition)}</p>`;
  }

  if (specNode.type === "trigger") {
    return `<p><strong>${escapeHtml(title)}</strong><br/>${escapeHtml(specNode.event)}</p>`;
  }

  if (specNode.type === "profileFilter") {
    return `<p><strong>${escapeHtml(title)}</strong><br/>${specNode.filters.map(escapeHtml).join(", ")}</p>`;
  }

  if (specNode.type === "note") {
    return `<p><strong>${escapeHtml(title)}</strong><br/>${escapeHtml(specNode.body)}</p>`;
  }

  if (specNode.type === "strategy") {
    const primary = escapeHtml(specNode.primaryFocus);
    const secondary = escapeHtml(specNode.secondaryFocus);
    return `<p><strong>STRATEGY</strong></p><p><strong>PRIMARY FOCUS</strong><br/>${primary}</p><p><strong>SECONDARY FOCUS</strong><br/>${secondary}</p>`;
  }

  if (specNode.type === "outcome") {
    return `<p><strong>${escapeHtml(title)}</strong><br/>${escapeHtml(specNode.result)}</p>`;
  }

  return `<p><strong>${escapeHtml(title)}</strong></p>`;
}

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
  const layout = buildLayout(flowSpec, { positionOverrides });
  const nodeById = new Map(flowSpec.nodes.map((node) => [node.id, node]));
  const itemMap: Record<string, string> = {};

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  const sideNodeTypes = new Set(["note", "strategy"]);

  for (const positioned of layout.nodes) {
    const specNode = nodeById.get(positioned.id);
    if (!specNode) {
      continue;
    }
    const style = shapeStyleForNodeType(positioned.type, specNode);
    const payload = {
      data: {
        content: nodeContent(specNode),
        shape: style.shape
      },
      style: {
        fillColor: style.fillColor,
        borderColor: style.borderColor,
        textAlign: style.textAlign,
        textAlignVertical: "top" as const
      },
      position: {
        x: originX + positioned.x + positioned.width / 2,
        y: originY + positioned.y + positioned.height / 2
      },
      geometry: {
        width: positioned.width,
        height: positioned.height
      }
    };

    const created = await requestWithRetry<MiroShapeResponse>(
      fetchImpl,
      `${BASE_URL}/boards/${boardId}/shapes`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      },
      maxRetries
    );
    itemMap[positioned.id] = created.id;
  }

  const positionMap = new Map(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y, width: n.width }]));

  for (const edge of flowSpec.edges) {
    const startItem = itemMap[edge.from];
    const endItem = itemMap[edge.to];
    if (!startItem || !endItem) {
      continue;
    }

    const fromNode = nodeById.get(edge.from);
    const isSideEdge = fromNode ? sideNodeTypes.has(fromNode.type) : false;

    let startSnap = "bottom";
    let endSnap = "top";

    if (isSideEdge) {
      const sourcePos = positionMap.get(edge.from);
      const targetPos = positionMap.get(edge.to);
      if (sourcePos && targetPos) {
        const sourceCenterX = sourcePos.x + sourcePos.width / 2;
        const targetCenterX = targetPos.x + targetPos.width / 2;
        const isRightSide = sourceCenterX > targetCenterX;
        startSnap = isRightSide ? "left" : "right";
        endSnap = isRightSide ? "right" : "left";
      } else {
        startSnap = "right";
        endSnap = "left";
      }
    }

    const payload = {
      startItem: { id: startItem, snapTo: startSnap },
      endItem: { id: endItem, snapTo: endSnap },
      style: {
        strokeColor: isSideEdge ? "#F59E0B" : "#94A3B8",
        strokeWidth: isSideEdge ? 1.5 : 2,
        strokeStyle: isSideEdge ? "dashed" : "normal"
      },
      captions: edge.label
        ? [
            {
              content: edge.label,
              position: "50%"
            }
          ]
        : undefined
    };

    await requestWithRetry(
      fetchImpl,
      `${BASE_URL}/boards/${boardId}/connectors`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      },
      maxRetries
    );
  }

  return {
    shapeCount: Object.keys(itemMap).length,
    connectorCount: flowSpec.edges.length,
    itemMap
  };
}
