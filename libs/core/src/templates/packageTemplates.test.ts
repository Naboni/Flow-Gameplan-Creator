import { describe, expect, it } from "vitest";
import { parseFlowSpecSafe } from "../schema/flowSpec.js";
import { expandPackageTemplate } from "./packageTemplates.js";

function findFlow(template: ReturnType<typeof expandPackageTemplate>, id: string) {
  const flow = template.flows.find((f) => f.id === id);
  expect(flow).toBeDefined();
  return flow!;
}

describe("package template expansion", () => {
  it("expands core-foundation with mirror relationship", () => {
    const expanded = expandPackageTemplate("core-foundation");
    expect(expanded.flows.length).toBe(6);
    expect(expanded.mirrors).toContainEqual({
      flowId: "core_cart_abandonment",
      mirrorsFlowId: "core_checkout_abandonment"
    });

    for (const flow of expanded.flows) {
      expect(parseFlowSpecSafe(flow).success).toBe(true);
    }
  });

  it("expands growth-engine with split-heavy flows", () => {
    const expanded = expandPackageTemplate("growth-engine");
    expect(expanded.flows.length).toBe(8);
    expect(expanded.mirrors).toContainEqual({
      flowId: "growth_cart_abandonment",
      mirrorsFlowId: "growth_checkout_abandonment"
    });

    const checkout = findFlow(expanded, "growth_checkout_abandonment");
    const splitNode = checkout.nodes.find((node) => node.type === "split");
    expect(splitNode).toBeDefined();
    const splitOutEdges = checkout.edges.filter((edge) => edge.from === splitNode?.id);
    const edgeLabels = splitOutEdges.map((edge) => edge.label);
    expect(edgeLabels).toContain("Yes");
    expect(edgeLabels).toContain("No");
  });

  it("expands full-system and keeps flows schema-valid", () => {
    const expanded = expandPackageTemplate("full-system");
    expect(expanded.flows.length).toBe(9);
    expect(expanded.mirrors).toContainEqual({
      flowId: "full_cart_abandonment",
      mirrorsFlowId: "full_checkout_abandonment"
    });
    for (const flow of expanded.flows) {
      expect(parseFlowSpecSafe(flow).success).toBe(true);
    }
  });

  it("supports delay override for all generated waits", () => {
    const expanded = expandPackageTemplate("core-foundation", {
      defaultDelay: { value: 2, unit: "days" }
    });
    const flow = findFlow(expanded, "core_email_welcome");
    const waitNodes = flow.nodes.filter((node) => node.type === "wait");
    expect(waitNodes.length).toBeGreaterThan(0);
    for (const waitNode of waitNodes) {
      expect(waitNode.duration.value).toBe(2);
      expect(waitNode.duration.unit).toBe("days");
    }
  });
});
