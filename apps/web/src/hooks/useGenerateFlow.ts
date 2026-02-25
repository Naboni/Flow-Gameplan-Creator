import { useCallback, useMemo, useRef, useState } from "react";
import { parseFlowSpecSafe, validateFlowGraph, type FlowSpec } from "@flow/core";
import type { AppNodeData, AppTab, BrandProfile, BrandQuestionnaire as BrandQuestionnaireData, GeneratedResult, PlanKey } from "../types/flow";
import { type ChatMessage } from "../components/ChatPanel";
import { API_BASE } from "../constants";
import { normalizeFlowSpecCandidate } from "../utils/flowNormalize";
import { toast } from "sonner";
import type { Node } from "reactflow";

// Manages all Generate-tab state plus the two API calls (handleGenerate, handleChatSend).
// correctedGenCacheRef is exported so useFlowCanvas can access it.
export function useGenerateFlow(tab: AppTab) {
  const [genPlan, setGenPlan] = useState<PlanKey>("custom");
  const [genUrl, setGenUrl] = useState("");
  const [genBrand, setGenBrand] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [questionnaireData, setQuestionnaireData] = useState<BrandQuestionnaireData>({});
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [genStep, setGenStep] = useState<"form" | "analyzing" | "generating" | "done">("form");
  const [genResult, setGenResult] = useState<GeneratedResult | null>(null);
  const [genError, setGenError] = useState("");
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);
  const [customFlowText, setCustomFlowText] = useState("");
  const [flowSpecModalOpen, setFlowSpecModalOpen] = useState(false);
  const [flowSpecInfoOpen, setFlowSpecInfoOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Cache of auto-positioned nodes per flow index — prevents layout recomputation
  // when switching between already-viewed flows.
  const correctedGenCacheRef = useRef<Map<number, Node<AppNodeData>[]>>(new Map());

  const questionnaireAnsweredCount = [
    questionnaireData.discountNotes?.trim(),
    questionnaireData.specialInstructions?.trim(),
  ].filter(Boolean).length;

  const hasFilloutData =
    questionnaireData.filloutResponses != null &&
    Object.keys(questionnaireData.filloutResponses).length > 0;

  const activeGenFlow = useMemo(() => {
    if (tab === "generate" && genResult && genResult.flows.length > 0) {
      return genResult.flows[activeFlowIndex] ?? genResult.flows[0];
    }
    return null;
  }, [tab, genResult, activeFlowIndex]);

  // Two-step generation: analyze brand → generate flows.
  async function handleGenerate() {
    if (!genUrl.trim() || !genBrand.trim()) {
      setGenError("Please enter a website URL and brand name.");
      return;
    }
    if (genPlan === "custom" && !customFlowText.trim()) {
      setGenError("Please describe your flows.");
      return;
    }
    setGenBusy(true);
    setGenError("");
    setGenStep("analyzing");

    try {
      const hasQuestionnaire = questionnaireAnsweredCount > 0 || hasFilloutData;
      const analyzeRes = await fetch(`${API_BASE}/api/analyze-brand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: genUrl.trim(),
          brandName: genBrand.trim(),
          ...(hasQuestionnaire ? { questionnaire: questionnaireData } : {}),
        }),
      });
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({ error: "Brand analysis failed" }));
        throw new Error(err.error || "Brand analysis failed");
      }
      const { profile } = (await analyzeRes.json()) as { profile: BrandProfile };

      setGenStep("generating");
      const genBody =
        genPlan === "custom"
          ? { customFlowText: customFlowText.trim(), brandProfile: profile }
          : { planKey: genPlan, brandProfile: profile };

      const generateRes = await fetch(`${API_BASE}/api/generate-flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(genBody),
      });
      if (!generateRes.ok) {
        const err = await generateRes.json().catch(() => ({ error: "Flow generation failed" }));
        throw new Error(err.error || "Flow generation failed");
      }
      const result = (await generateRes.json()) as GeneratedResult;
      result.brandLogoUrl = profile.brandLogoUrl;
      result.brandColor = profile.brandColor;

      if (!result.flows || result.flows.length === 0) throw new Error("No flows were generated.");
      for (const flow of result.flows) {
        if (!Array.isArray(flow.nodes)) flow.nodes = [];
        if (!Array.isArray(flow.edges)) flow.edges = [];
      }

      correctedGenCacheRef.current.clear();
      setGenResult(result);
      setActiveFlowIndex(0);
      setGenStep("done");
    } catch (error) {
      setGenError(error instanceof Error ? error.message : "Something went wrong.");
      setGenStep("form");
    } finally {
      setGenBusy(false);
    }
  }

  // Sends a chat message to the AI and optionally applies the returned flow spec.
  async function handleChatSend(message: string) {
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: chatMessages.slice(-6),
          brandProfile: genBrand ? { brandName: genBrand } : undefined,
          currentFlowSpec: activeGenFlow ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Chat request failed" }));
        throw new Error(err.error || "Chat request failed");
      }
      const data = (await res.json()) as { reply: string; flowSpec?: unknown; action: string };
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);

      if (data.flowSpec) {
        const normalized = normalizeFlowSpecCandidate(data.flowSpec);
        const graphResult = validateFlowGraph(normalized);
        if (!graphResult.valid) {
          const issues = graphResult.errors.map((e) => e.message).join("; ");
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Structural issues: ${issues}. Say "fix" to try again.` },
          ]);
          return;
        }
        const parsed = parseFlowSpecSafe(normalized);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const path = issue?.path?.length ? ` at ${issue.path.join(".")}` : "";
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Validation failed${path}: ${issue?.message ?? "Invalid spec"}. Say "regenerate" to try again.` },
          ]);
          return;
        }
        correctedGenCacheRef.current.clear();
        setGenResult({
          planKey: "chat", planName: "AI Chat Flow",
          brandName: genBrand || "Custom",
          brandLogoUrl: genResult?.brandLogoUrl,
          brandColor: genResult?.brandColor,
          flows: [parsed.data],
        });
        setActiveFlowIndex(0);
        setGenStep("done");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Something went wrong.";
      setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  // Clears the generation result and returns to the form view.
  const resetGeneration = useCallback(() => {
    correctedGenCacheRef.current.clear();
    setGenStep("form");
    setGenResult(null);
  }, []);

  return {
    genPlan, setGenPlan,
    genUrl, setGenUrl,
    genBrand, setGenBrand,
    genBusy,
    questionnaireData, setQuestionnaireData,
    questionnaireOpen, setQuestionnaireOpen,
    genStep, setGenStep,
    genResult, setGenResult,
    genError,
    activeFlowIndex, setActiveFlowIndex,
    customFlowText, setCustomFlowText,
    flowSpecModalOpen, setFlowSpecModalOpen,
    flowSpecInfoOpen, setFlowSpecInfoOpen,
    chatMessages, setChatMessages,
    chatLoading,
    questionnaireAnsweredCount,
    hasFilloutData,
    activeGenFlow,
    correctedGenCacheRef,
    handleGenerate,
    handleChatSend,
    resetGeneration,
  } as const;
}
