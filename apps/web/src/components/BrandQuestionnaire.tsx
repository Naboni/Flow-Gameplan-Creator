import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { BrandQuestionnaire as BrandQuestionnaireData } from "@/types/flow";
import { API_BASE } from "@/constants";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: BrandQuestionnaireData;
  onSave: (data: BrandQuestionnaireData) => void;
};

const FILLOUT_FORM_STORAGE = "fillout_form_id";

export function BrandQuestionnaire({ open, onOpenChange, data, onSave }: Props) {
  const [form, setForm] = useState<BrandQuestionnaireData>({ ...data });
  const [filloutOpen, setFilloutOpen] = useState(false);
  const [filloutFormId, setFilloutFormId] = useState(() => localStorage.getItem(FILLOUT_FORM_STORAGE) ?? "");
  const [filloutSearch, setFilloutSearch] = useState("");
  const [filloutLoading, setFilloutLoading] = useState(false);
  const [filloutStatus, setFilloutStatus] = useState<"idle" | "success" | "error">("idle");
  const [filloutError, setFilloutError] = useState("");

  const handleSave = () => {
    if (filloutFormId) localStorage.setItem(FILLOUT_FORM_STORAGE, filloutFormId);
    onSave(form);
    onOpenChange(false);
  };

  const handleFilloutFetch = async () => {
    if (!filloutFormId) return;
    setFilloutLoading(true);
    setFilloutStatus("idle");
    setFilloutError("");

    try {
      localStorage.setItem(FILLOUT_FORM_STORAGE, filloutFormId);

      const res = await fetch(`${API_BASE}/api/fillout-lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: filloutFormId,
          ...(filloutSearch.trim() ? { search: filloutSearch.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Fetch failed" }));
        throw new Error(err.error || "Failed to fetch from Fillout");
      }

      const result = await res.json() as { responses: Record<string, string> };
      setForm(prev => ({ ...prev, filloutResponses: result.responses }));
      setFilloutStatus("success");
    } catch (err) {
      setFilloutError(err instanceof Error ? err.message : "Unknown error");
      setFilloutStatus("error");
    } finally {
      setFilloutLoading(false);
    }
  };

  const answeredCount = [
    form.discountNotes?.trim(),
    form.specialInstructions?.trim(),
  ].filter(Boolean).length;

  const hasFillout = form.filloutResponses && Object.keys(form.filloutResponses).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Brand Details</DialogTitle>
          <DialogDescription>
            Discount info and special instructions for the AI. Everything else is inferred from the website.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto px-1 pb-2">
          <div>
            <Label htmlFor="discountNotes" className="text-sm font-semibold mb-2 block">
              Discount Details
            </Label>
            <Textarea
              id="discountNotes"
              placeholder={"Specify discounts per flow, e.g.:\n• Welcome flow: 10% off code WELCOME10\n• Abandoned cart: free shipping\n• Post-purchase: no discount"}
              rows={4}
              value={form.discountNotes ?? ""}
              onChange={(e) => setForm(prev => ({ ...prev, discountNotes: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="specialInstructions" className="text-sm font-semibold mb-2 block">
              Special Instructions <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="specialInstructions"
              placeholder="e.g. avoid aggressive urgency language, mention current BOGO sale, brand voice is warm and casual..."
              rows={3}
              value={form.specialInstructions ?? ""}
              onChange={(e) => setForm(prev => ({ ...prev, specialInstructions: e.target.value }))}
            />
          </div>

          {/* Fillout import section */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => setFilloutOpen(!filloutOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors rounded-lg"
            >
              <span className="flex items-center gap-2">
                Import from Fillout
                {hasFillout && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    {Object.keys(form.filloutResponses!).length} fields loaded
                  </span>
                )}
              </span>
              {filloutOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {filloutOpen && (
              <div className="px-4 pb-4 space-y-3 border-t">
                <p className="text-xs text-gray-500 pt-3">
                  Pull onboarding form data from Fillout. API key is configured on the server.
                </p>
                <div>
                  <Label className="text-xs mb-1 block">Form ID</Label>
                  <Input
                    placeholder="e.g. abc123def"
                    value={filloutFormId}
                    onChange={(e) => setFilloutFormId(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by name or email (optional)"
                    value={filloutSearch}
                    onChange={(e) => setFilloutSearch(e.target.value)}
                    className="text-sm flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") handleFilloutFetch(); }}
                  />
                  <Button
                    size="sm"
                    onClick={handleFilloutFetch}
                    disabled={filloutLoading || !filloutFormId}
                  >
                    {filloutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
                  </Button>
                </div>
                <p className="text-xs text-gray-400">
                  Leave search empty to fetch the latest submission.
                </p>
                {filloutStatus === "success" && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Loaded {Object.keys(form.filloutResponses ?? {}).length} fields from onboarding form
                  </p>
                )}
                {filloutStatus === "error" && (
                  <p className="text-xs text-red-600">{filloutError}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
            <Check className="w-4 h-4 mr-1" /> Save{answeredCount > 0 || hasFillout ? ` (${answeredCount}/2${hasFillout ? " + Fillout" : ""})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
