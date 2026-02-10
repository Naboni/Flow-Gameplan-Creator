import { describe, expect, it } from "vitest";
import { welcomeSeriesFixture } from "@flow/core";
import { buildLayout } from "./buildLayout.js";

function rectanglesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("buildLayout", () => {
  it("is deterministic for the same input", () => {
    const first = buildLayout(welcomeSeriesFixture);
    const second = buildLayout(welcomeSeriesFixture);
    expect(first).toEqual(second);
  });

  it("places split yes branch to the left and no branch to the right", () => {
    const layout = buildLayout(welcomeSeriesFixture);
    const splitNode = layout.nodes.find((node) => node.id === "split_engaged");
    expect(splitNode).toBeDefined();

    const yesEdge = layout.edges.find((edge) => edge.from === "split_engaged" && edge.label === "Yes");
    const noEdge = layout.edges.find((edge) => edge.from === "split_engaged" && edge.label === "No");
    expect(yesEdge).toBeDefined();
    expect(noEdge).toBeDefined();

    const yesNode = layout.nodes.find((node) => node.id === yesEdge?.to);
    const noNode = layout.nodes.find((node) => node.id === noEdge?.to);
    expect(yesNode).toBeDefined();
    expect(noNode).toBeDefined();

    expect(yesNode!.x).toBeLessThan(splitNode!.x);
    expect(noNode!.x).toBeGreaterThan(splitNode!.x);
  });

  it("does not overlap node bounding boxes", () => {
    const layout = buildLayout(welcomeSeriesFixture);
    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        expect(rectanglesOverlap(a, b)).toBe(false);
      }
    }
  });

  it("respects explicit position overrides", () => {
    const layout = buildLayout(welcomeSeriesFixture, {
      positionOverrides: {
        email_1: { x: 40, y: 60 }
      }
    });
    const node = layout.nodes.find((entry) => entry.id === "email_1");
    expect(node?.x).toBe(40);
    expect(node?.y).toBe(60);
  });
});
