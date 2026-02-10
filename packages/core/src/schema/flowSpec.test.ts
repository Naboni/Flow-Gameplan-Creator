import { describe, expect, it } from "vitest";
import { welcomeSeriesFixture } from "../fixtures/welcomeSeries.js";
import {
  formatDelay,
  parseFlowSpecSafe
} from "./flowSpec.js";

describe("flowSpec schema", () => {
  it("accepts the welcome series fixture", () => {
    const result = parseFlowSpecSafe(welcomeSeriesFixture);
    expect(result.success).toBe(true);
  });

  it("rejects split nodes without both yes/no edges", () => {
    const invalid = {
      ...welcomeSeriesFixture,
      edges: welcomeSeriesFixture.edges.filter((edge) => edge.id !== "e6_no")
    };

    const result = parseFlowSpecSafe(invalid);
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    const messages = result.error.issues.map((issue) => issue.message);
    expect(messages.some((m) => m.includes("must have both Yes and No"))).toBe(true);
  });

  it("rejects channel mismatch in message nodes", () => {
    const invalid = {
      ...welcomeSeriesFixture,
      channels: ["sms"] as const
    };
    const result = parseFlowSpecSafe(invalid);
    expect(result.success).toBe(false);
  });
});

describe("formatDelay", () => {
  it("formats delay values consistently", () => {
    expect(formatDelay(1, "hours")).toBe("1 hour");
    expect(formatDelay(2, "days")).toBe("2 days");
    expect(formatDelay(30, "minutes")).toBe("30 minutes");
  });
});
