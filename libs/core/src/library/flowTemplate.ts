export type FlowType =
  | "email-welcome"
  | "sms-welcome"
  | "checkout-abandonment"
  | "cart-abandonment"
  | "browse-abandonment"
  | "site-abandonment"
  | "post-purchase"
  | "winback"
  | "sunset"
  | "custom";

export const FLOW_TYPE_LABELS: Record<FlowType, string> = {
  "email-welcome": "Email Welcome",
  "sms-welcome": "SMS Welcome",
  "checkout-abandonment": "Checkout Abandonment",
  "cart-abandonment": "Cart Abandonment",
  "browse-abandonment": "Browse Abandonment",
  "site-abandonment": "Site Abandonment",
  "post-purchase": "Post-Purchase",
  "winback": "Winback",
  "sunset": "Sunset",
  "custom": "Custom",
};

export type FlowTemplate = {
  id: string;
  flowType: FlowType;
  name: string;
  description: string;
  triggerEvent: string;
  emailCount: number;
  smsCount: number;
  hasSplit: boolean;
  splitCondition?: string;
  splitSegments?: {
    yes: { email: number; sms: number };
    no: { email: number; sms: number };
  };
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};
