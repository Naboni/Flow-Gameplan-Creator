import type { FlowNode, FlowSpec } from "@flow/core";

export type AppTab = "generate" | "viewer" | "editor" | "library";
export type TemplateChoice = "welcome-series" | "core-foundation" | "growth-engine" | "full-system" | "custom";
export type PlanKey = "core-foundation" | "growth-engine" | "full-system" | "custom";
export type NodeKind = "trigger" | "email" | "sms" | "wait" | "split" | "outcome" | "profileFilter" | "note" | "strategy";

export type AppNodeData = {
  title: string;
  subtitle: string;
  nodeType: FlowNode["type"];
  flowNode: FlowNode;
};

export type BrandQuestionnaire = {
  businessType?: string;
  businessStage?: string;
  emailListSize?: string;
  priceRange?: string;
  averageOrderValue?: string;
  discountApproach?: string;
  keyDifferentiators?: string[];
  brandTone?: string;
  competitors?: string;
  specialInstructions?: string;
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
};

export type GeneratedResult = {
  planKey: string;
  planName: string;
  brandName: string;
  flows: FlowSpec[];
};
