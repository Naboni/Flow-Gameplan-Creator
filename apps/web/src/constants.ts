import { MarkerType } from "reactflow";
import type { FlowNode } from "@flow/core";
import type { TemplateChoice, PlanKey } from "./types/flow";

export const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/+$/, "");

export const EDGE_STYLE = {
  type: "smartEdge" as const,
  markerEnd: { type: MarkerType.ArrowClosed, color: "#9ea0a3", width: 12, height: 12 },
  style: { stroke: "#9ea0a3", strokeWidth: 1 },
  labelStyle: { fill: "#475569", fontWeight: 600, fontSize: 11 },
  labelShowBg: true,
  labelBgStyle: { fill: "#ffffff", fillOpacity: 1 },
  labelBgPadding: [6, 4] as [number, number],
  labelBgBorderRadius: 4
} as const;

export const VIEWER_CHOICES: Array<{ label: string; value: TemplateChoice }> = [
  { label: "Welcome Series", value: "welcome-series" },
  { label: "Core Foundation", value: "core-foundation" },
  { label: "Growth Engine", value: "growth-engine" },
  { label: "Full System", value: "full-system" },
  { label: "Custom", value: "custom" }
];

export const PLAN_OPTIONS: Array<{ label: string; value: PlanKey; desc: string }> = [
  { label: "Core Foundation", value: "core-foundation", desc: "6 flows — brands under $1M/yr" },
  { label: "Growth Engine", value: "growth-engine", desc: "8 flows — scaling to $1-2M/yr" },
  { label: "Full System", value: "full-system", desc: "9 flows — scaling to $2-20M/yr" },
  { label: "Custom", value: "custom", desc: "Describe your flows in natural language" }
];

const NODE_CONTAINER_WIDTH: Partial<Record<FlowNode["type"], number>> = {
  outcome: 72,
  merge: 72,
  note: 320,
  strategy: 320,
};
const DEFAULT_CONTAINER_WIDTH = 280;

export function rfContainerWidth(nodeType: string): number {
  return NODE_CONTAINER_WIDTH[nodeType as FlowNode["type"]] ?? DEFAULT_CONTAINER_WIDTH;
}
