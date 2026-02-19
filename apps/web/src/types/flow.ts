import type { FlowNode, FlowSpec, MessageStatus } from "@flow/core";

export type AppTab = "generate" | "viewer" | "editor" | "library";
export type TemplateChoice = "welcome-series" | "core-foundation" | "growth-engine" | "full-system" | "custom";
export type PlanKey = "core-foundation" | "growth-engine" | "full-system" | "custom";
export type NodeKind = "trigger" | "email" | "sms" | "wait" | "split" | "outcome" | "profileFilter" | "note" | "strategy" | "merge";

export type NodeCallbacks = {
  onPreview?: (nodeId: string) => void;
  onEdit?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onStatusChange?: (nodeId: string, status: MessageStatus) => void;
};

export type AppNodeData = {
  title: string;
  subtitle: string;
  nodeType: FlowNode["type"];
  flowNode: FlowNode;
  callbacks?: NodeCallbacks;
};

export type BrandQuestionnaire = {
  discountNotes?: string;
  specialInstructions?: string;
  filloutResponses?: Record<string, string>;
};

export type BrandProfile = {
  brandName: string;
  industry: string;
  targetAudience: string;
  brandVoice: string;
  keyProducts: string[];
  uniqueSellingPoints: string[];
  discountStrategy: string;
  summary: string;
  priceRange: string;
  averageOrderValue: string;
  businessStage: string;
  emailListSize: string;
  discountApproach: string;
  keyDifferentiators: string[];
  brandTone: string;
  competitors: string;
  specialInstructions: string;
  brandLogoUrl?: string;
  brandColor?: string;
};

export type GeneratedResult = {
  planKey: string;
  planName: string;
  brandName: string;
  brandLogoUrl?: string;
  brandColor?: string;
  flows: FlowSpec[];
};
