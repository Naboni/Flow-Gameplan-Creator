import { describe, expect, it, vi } from "vitest";
import { welcomeSeriesFixture } from "@flow/core";
import { exportFlowToMiro } from "./miroExporter.js";

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("exportFlowToMiro", () => {
  it("creates shapes then connectors and returns mapping", async () => {
    let shapeIndex = 0;
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/shapes")) {
        shapeIndex += 1;
        return okResponse({ id: `shape_${shapeIndex}` });
      }
      return okResponse({ id: `connector_${shapeIndex}` });
    });

    const result = await exportFlowToMiro({
      boardId: "board_1",
      accessToken: "token_1",
      flowSpec: welcomeSeriesFixture,
      fetchImpl: fetchMock
    });

    const shapeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/shapes")
    );
    const connectorCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/connectors")
    );

    expect(shapeCalls.length).toBe(welcomeSeriesFixture.nodes.length);
    expect(connectorCalls.length).toBe(welcomeSeriesFixture.edges.length);
    expect(result.shapeCount).toBe(welcomeSeriesFixture.nodes.length);
    expect(result.connectorCount).toBe(welcomeSeriesFixture.edges.length);
    expect(result.itemMap.trigger_signup).toBeDefined();
  });

  it("retries on rate limit responses", async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/shapes") && attempt === 0) {
        attempt += 1;
        return new Response("rate limited", { status: 429 });
      }
      return okResponse({ id: `item_${attempt++}` });
    });

    const trigger = welcomeSeriesFixture.nodes.find((n) => n.id === "trigger_signup")!;
    const email1 = welcomeSeriesFixture.nodes.find((n) => n.id === "email_1")!;
    const edge1 = welcomeSeriesFixture.edges.find((e) => e.from === "trigger_signup" && e.to === "email_1")!;
    const tinyFlow = {
      ...welcomeSeriesFixture,
      nodes: [trigger, email1],
      edges: [edge1]
    };

    const result = await exportFlowToMiro({
      boardId: "board_retry",
      accessToken: "token_retry",
      flowSpec: tinyFlow,
      fetchImpl: fetchMock,
      maxRetries: 2
    });

    expect(result.shapeCount).toBe(2);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(3);
  });
});
