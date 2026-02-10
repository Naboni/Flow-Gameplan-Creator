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
      const error: MiroApiError = { status: response.status, body };
      throw error;
    }
    const delayMs = getRetryDelayMs(response, attempt);
    await sleep(delayMs);
    attempt += 1;
  }
}

function shapeStyleForNodeType(nodeType: string) {
  switch (nodeType) {
    case "trigger":
      return { shape: "round_rectangle", fillColor: "#EEF3FF", borderColor: "#9BB0FF" };
    case "split":
      return { shape: "rectangle", fillColor: "#F5EEFF", borderColor: "#B693E6" };
    case "wait":
      return { shape: "rectangle", fillColor: "#F4F6FA", borderColor: "#C5CDDD" };
    case "outcome":
      return { shape: "rectangle", fillColor: "#EAF9EE", borderColor: "#8FC89A" };
    default:
      return { shape: "rectangle", fillColor: "#FFFFFF", borderColor: "#B7C3E7" };
  }
}

function nodeContent(specNode: FlowSpec["nodes"][number]): string {
  const title = "title" in specNode ? specNode.title : specNode.type;
  if (specNode.type === "wait") {
    return `<p><strong>Wait</strong><br/>${specNode.duration.value} ${specNode.duration.unit}</p>`;
  }
  if (specNode.type === "message") {
    return `<p><strong>${escapeHtml(title)}</strong><br/>${specNode.channel.toUpperCase()}</p>`;
  }
  if (specNode.type === "split") {
    return `<p><strong>${escapeHtml(title)}</strong><br/>${escapeHtml(specNode.condition)}</p>`;
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

  for (const positioned of layout.nodes) {
    const specNode = nodeById.get(positioned.id);
    if (!specNode) {
      continue;
    }
    const style = shapeStyleForNodeType(positioned.type);
    const payload = {
      data: {
        content: nodeContent(specNode),
        shape: style.shape
      },
      style: {
        fillColor: style.fillColor,
        borderColor: style.borderColor
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

  for (const edge of flowSpec.edges) {
    const startItem = itemMap[edge.from];
    const endItem = itemMap[edge.to];
    if (!startItem || !endItem) {
      continue;
    }

    const payload = {
      startItem: { id: startItem, snapTo: "bottom" },
      endItem: { id: endItem, snapTo: "top" },
      style: {
        strokeColor: "#707784",
        strokeWidth: 2
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
