import { CheckCircle2, ClipboardList, Download, Pencil, RotateCcw } from "lucide-react";
import type { FlowSpec } from "@flow/core";
import type { GeneratedResult, PlanKey } from "../types/flow";
import { PLAN_OPTIONS } from "../constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface GenerateSidebarProps {
  // ── generation state ─────────────────────────────────────────────────────

  /** Current stage of the generation pipeline. */
  genStep: "form" | "analyzing" | "generating" | "done";
  /** Completed generation result, or `null` when not yet run. */
  genResult: GeneratedResult | null;
  /** `true` while a generation API call is in flight. */
  genBusy: boolean;
  /** Validation or API error message shown below the generate button. */
  genError: string;

  // ── form field values ────────────────────────────────────────────────────

  /** Currently selected generation plan key. */
  genPlan: PlanKey;
  /** Called when the user picks a different plan from the selector. */
  onPlanChange: (plan: PlanKey) => void;
  /** Client website URL entered by the user. */
  genUrl: string;
  /** Called on every change to the URL input. */
  onUrlChange: (url: string) => void;
  /** Brand / client name entered by the user. */
  genBrand: string;
  /** Called on every change to the brand-name input. */
  onBrandChange: (brand: string) => void;

  // ── custom-plan flow spec ────────────────────────────────────────────────

  /** The raw free-text flow description (used only when `genPlan === "custom"`). */
  customFlowText: string;
  /**
   * Opens the {@link FlowSpecModal} so the user can edit `customFlowText`.
   * The button label summarises the current text (e.g. "3 flow(s) described").
   */
  onOpenFlowSpec: () => void;

  // ── brand questionnaire ──────────────────────────────────────────────────

  /** How many of the 2 optional questionnaire fields have been filled in (0–2). */
  questionnaireAnsweredCount: number;
  /** `true` when Fillout survey responses have been imported. */
  hasFilloutData: boolean;
  /** Opens the {@link BrandQuestionnaire} modal. */
  onOpenQuestionnaire: () => void;

  // ── results view ─────────────────────────────────────────────────────────

  /** Index of the currently displayed generated flow. */
  activeFlowIndex: number;
  /** Called when the user clicks a flow in the results list. */
  onFlowIndexChange: (idx: number) => void;
  /** Loads the given spec into the Editor tab and switches to it. */
  onOpenInEditor: (spec: FlowSpec) => void;
  /** Downloads all generated flows as a single JSON file. */
  onExportAll: () => void;
  /** Clears the current result and returns to the form view. */
  onReset: () => void;

  // ── primary action ───────────────────────────────────────────────────────

  /** Validates form inputs and starts a generation run. */
  onGenerate: () => void;
}

export function GenerateSidebar({
  genStep,
  genResult,
  genBusy,
  genError,
  genPlan,
  onPlanChange,
  genUrl,
  onUrlChange,
  genBrand,
  onBrandChange,
  customFlowText,
  onOpenFlowSpec,
  questionnaireAnsweredCount,
  hasFilloutData,
  onOpenQuestionnaire,
  activeFlowIndex,
  onFlowIndexChange,
  onOpenInEditor,
  onExportAll,
  onReset,
  onGenerate,
}: GenerateSidebarProps) {
  /* ── Results view ─────────────────────────────────────────────────────── */
  if (genStep === "done" && genResult) {
    return (
      <div className="flex flex-col gap-4">
        {/* Generated flow list */}
        <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-2">
          <div className="px-1">
            <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider">
              Generated Flows
            </p>
            <p className="text-[13px] font-medium text-sidebar-muted mt-0.5">
              {genResult.brandName} · {genResult.flows.length} flows
            </p>
          </div>
          <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
            {genResult.flows.map((flow, idx) => (
              <button
                key={flow.id}
                type="button"
                className={`text-left px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                  idx === activeFlowIndex
                    ? "bg-sidebar-item-active-bg text-primary font-semibold shadow-sm border border-sidebar-item-active-border"
                    : "text-sidebar-foreground hover:bg-sidebar-item-hover font-medium border border-transparent"
                }`}
                onClick={() => onFlowIndexChange(idx)}
              >
                <span className="block truncate">{flow.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider px-1">
            Actions
          </p>
          <Button size="sm" onClick={() => onOpenInEditor(genResult.flows[activeFlowIndex])}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Edit in Editor
          </Button>
          <Button variant="outline" size="sm" onClick={onExportAll}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export All (JSON)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onReset}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            New Generation
          </Button>
        </div>
      </div>
    );
  }

  /* ── Form view ────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-4">
      {/* Plan & flow spec card */}
      <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider">
          Configuration
        </p>

        {/* Plan selector */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gen-plan" className="text-[13px] font-medium text-sidebar-foreground">
            Plan
          </Label>
          <select
            id="gen-plan"
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={genPlan}
            onChange={(e) => onPlanChange(e.target.value as PlanKey)}
            disabled={genBusy}
          >
            {PLAN_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-sidebar-muted">
            {PLAN_OPTIONS.find((p) => p.value === genPlan)?.desc}
          </p>
        </div>

        {/* Custom flow spec button (only for "custom" plan) */}
        {genPlan === "custom" && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] font-medium text-sidebar-foreground">
              Flow Specification
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenFlowSpec}
              disabled={genBusy}
              className="justify-start"
            >
              <ClipboardList className="h-4 w-4 mr-2 shrink-0" />
              {customFlowText.trim()
                ? `${(
                    customFlowText.match(/^\s*\d+[\.\)]/gm) ||
                    customFlowText.trim().split("\n").filter(Boolean)
                  ).length} flow(s) described`
                : "Describe flows"}
            </Button>
            <p className="text-xs text-sidebar-muted">
              Describe your flows in natural language.
            </p>
          </div>
        )}
      </div>

      {/* Brand details card */}
      <div className="rounded-xl border border-sidebar-border bg-sidebar-card p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold text-sidebar-section-header uppercase tracking-wider">
          Brand
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gen-url" className="text-[13px] font-medium text-sidebar-foreground">
            Client website URL
          </Label>
          <Input
            id="gen-url"
            type="url"
            placeholder="https://example.com"
            value={genUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            disabled={genBusy}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gen-brand" className="text-[13px] font-medium text-sidebar-foreground">
            Brand name
          </Label>
          <Input
            id="gen-brand"
            type="text"
            placeholder="Brand Name"
            value={genBrand}
            onChange={(e) => onBrandChange(e.target.value)}
            disabled={genBusy}
          />
        </div>

        {/* Questionnaire / brand details */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px] font-medium text-sidebar-foreground">
            Brand Details
          </Label>
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={onOpenQuestionnaire}
            disabled={genBusy}
          >
            {questionnaireAnsweredCount > 0 || hasFilloutData ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1.5 text-green-600" />
                <span className="text-green-700">
                  {questionnaireAnsweredCount}/2{hasFilloutData ? " + Fillout" : ""}
                </span>
              </>
            ) : (
              <>
                <ClipboardList className="w-4 h-4 mr-1.5" />
                Brand details
              </>
            )}
          </Button>
          <p className="text-xs text-sidebar-muted">
            Discount info & special instructions for the AI.
          </p>
        </div>
      </div>

      {/* Generate button */}
      <Button className="w-full" onClick={onGenerate} disabled={genBusy}>
        {genBusy ? (
          genStep === "analyzing" ? "Analyzing brand..." : "Generating flows..."
        ) : (
          <>Generate Gameplan</>
        )}
      </Button>

      {/* Inline error */}
      {genError && (
        <p className="text-[13px] font-medium text-destructive">{genError}</p>
      )}
    </div>
  );
}
