import { describe, expect, it } from "vitest";
import { welcomeSeriesFixture } from "../fixtures/welcomeSeries.js";
import { addEdge, addNode, removeEdge, removeNode, updateEdgeLabel, updateNodeTitle } from "./editorOps.js";

describe("editorOps", () => {
  it("updates node title safely", () => {
    const updated = updateNodeTitle(welcomeSeriesFixture, "email_1", "Email 1 - Updated");
    const node = updated.nodes.find((entry) => entry.id === "email_1");
    expect(node && "title" in node ? node.title : "").toBe("Email 1 - Updated");
  });

  it("adds and removes edge while preserving validity", () => {
    const withEdge = addEdge(welcomeSeriesFixture, {
      from: "email_4",
      to: "email_5",
      label: "follow-up",
      id: "edge_extra"
    });
    expect(withEdge.edges.some((edge) => edge.id === "edge_extra")).toBe(true);

    const removed = removeEdge(withEdge, "edge_extra");
    expect(removed.edges.some((edge) => edge.id === "edge_extra")).toBe(false);
  });

  it("adds and removes message node with connected edge", () => {
    const withNode = addNode(welcomeSeriesFixture, {
      id: "email_extra",
      type: "message",
      channel: "email",
      title: "Email Extra"
    });
    expect(withNode.nodes.some((node) => node.id === "email_extra")).toBe(true);

    const withConnection = addEdge(withNode, {
      id: "edge_extra_2",
      from: "email_5",
      to: "email_extra"
    });
    expect(withConnection.edges.some((edge) => edge.id === "edge_extra_2")).toBe(true);

    const removed = removeNode(withConnection, "email_extra");
    expect(removed.nodes.some((node) => node.id === "email_extra")).toBe(false);
    expect(removed.edges.some((edge) => edge.id === "edge_extra_2")).toBe(false);
  });

  it("updates edge label", () => {
    const updated = updateEdgeLabel(welcomeSeriesFixture, "e2", "next");
    const edge = updated.edges.find((entry) => entry.id === "e2");
    expect(edge?.label).toBe("next");
  });
});
