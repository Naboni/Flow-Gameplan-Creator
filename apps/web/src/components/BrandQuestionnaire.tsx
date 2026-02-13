import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Check, Square, CheckSquare } from "lucide-react";
import type { BrandQuestionnaire as BrandQuestionnaireData } from "@/types/flow";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: BrandQuestionnaireData;
  onSave: (data: BrandQuestionnaireData) => void;
};

const BUSINESS_TYPES = [
  "Skincare / Beauty",
  "Health / Supplements",
  "Fashion / Apparel",
  "Food & Beverage",
  "Home & Living",
  "Fitness / Sports",
  "Pets",
  "Tech / Electronics",
  "Jewelry / Accessories",
  "Kids / Baby",
  "Other",
];

const BUSINESS_STAGES = ["New (under 1 year)", "Growing (1–3 years)", "Established (3+ years)"];
const LIST_SIZES = ["Just starting", "Under 5K", "5K–25K", "25K–100K", "100K+"];

const DISCOUNT_APPROACHES = ["Never discount", "Rare discounts (holidays only)", "Regular discounts", "Aggressive (always running offers)"];

const DIFFERENTIATORS: Record<string, string[]> = {
  default: [
    "Quality / Premium materials",
    "Price / Value",
    "Sustainability / Eco",
    "Fast shipping",
    "Unique / Handmade",
    "Science-backed",
    "Community / Lifestyle",
    "Satisfaction guarantee",
  ],
  "Health / Supplements": [
    "Science-backed / Clinically tested",
    "All-natural / Organic ingredients",
    "Subscription convenience",
    "Fast results",
    "Third-party tested",
    "Unique formulation",
    "Community / Lifestyle",
    "Money-back guarantee",
  ],
  "Fashion / Apparel": [
    "Sustainable / Ethical production",
    "Premium materials / Craftsmanship",
    "Size inclusivity",
    "Trendy / Fashion-forward",
    "Price / Value",
    "Made locally",
    "Community / Lifestyle",
    "Easy returns",
  ],
  "Food & Beverage": [
    "Organic / All-natural",
    "Unique flavors / Recipes",
    "Dietary-specific (vegan, keto, etc.)",
    "Locally sourced",
    "Subscription convenience",
    "Price / Value",
    "Family-owned",
    "Satisfaction guarantee",
  ],
};

const BRAND_TONES = [
  "Friendly & casual",
  "Professional & trustworthy",
  "Bold & energetic",
  "Luxury & refined",
  "Playful & quirky",
  "Educational & authoritative",
];

function RadioGroup({ options, value, onChange, suffix }: { options: string[]; value?: string; onChange: (v: string) => void; suffix?: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      {options.map((opt) => (
        <div
          key={opt}
          role="radio"
          aria-checked={value === opt}
          tabIndex={0}
          onClick={() => onChange(opt)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(opt); } }}
          className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors text-sm select-none ${
            value === opt ? "border-blue-500 bg-blue-50 text-blue-900" : "border-gray-200 hover:border-gray-300 bg-white"
          }`}
        >
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
            value === opt ? "border-blue-500" : "border-gray-300"
          }`}>
            {value === opt && <div className="w-2 h-2 rounded-full bg-blue-500" />}
          </div>
          {opt}
        </div>
      ))}
      {suffix}
    </div>
  );
}

function CheckboxGroup({ options, value, onChange, max }: { options: string[]; value: string[]; onChange: (v: string[]) => void; max: number }) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else if (value.length < max) {
      onChange([...value, opt]);
    }
  };

  return (
    <div className="grid gap-2">
      {options.map((opt) => {
        const checked = value.includes(opt);
        const isDisabled = !checked && value.length >= max;
        return (
          <div
            key={opt}
            role="checkbox"
            aria-checked={checked}
            tabIndex={0}
            onClick={() => { if (!isDisabled || checked) toggle(opt); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!isDisabled || checked) toggle(opt); } }}
            className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 cursor-pointer transition-colors text-sm select-none ${
              checked ? "border-blue-500 bg-blue-50 text-blue-900" : isDisabled ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            {checked
              ? <CheckSquare className="w-4 h-4 text-blue-500 shrink-0" />
              : <Square className={`w-4 h-4 shrink-0 ${isDisabled ? "text-gray-300" : "text-gray-400"}`} />
            }
            {opt}
          </div>
        );
      })}
    </div>
  );
}

function getOptionsForType(map: Record<string, string[]>, businessType?: string): string[] {
  if (businessType && map[businessType]) return map[businessType];
  return map.default;
}

export function BrandQuestionnaire({ open, onOpenChange, data, onSave }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BrandQuestionnaireData>({ ...data });
  const [customBusinessType, setCustomBusinessType] = useState(
    data.businessType && !BUSINESS_TYPES.includes(data.businessType) ? data.businessType : ""
  );

  const update = <K extends keyof BrandQuestionnaireData>(key: K, val: BrandQuestionnaireData[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleBusinessTypeChange = (val: string) => {
    if (val === "Other") {
      update("businessType", customBusinessType || "Other");
    } else {
      update("businessType", val);
      setCustomBusinessType("");
    }
  };

  const handleCustomTypeInput = (val: string) => {
    setCustomBusinessType(val);
    update("businessType", val || "Other");
  };

  const selectedTypeIsOther = form.businessType === "Other" || (form.businessType !== undefined && !BUSINESS_TYPES.includes(form.businessType));
  const effectiveBusinessType = selectedTypeIsOther ? undefined : form.businessType;

  const handleSave = () => {
    onSave(form);
    onOpenChange(false);
  };

  const steps = [
    {
      title: "About the Business",
      description: "What kind of business is this?",
      content: (
        <div className="space-y-5 max-h-[55vh] overflow-y-auto pr-1 pb-2">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Business Type / Niche</Label>
            <RadioGroup
              options={BUSINESS_TYPES}
              value={selectedTypeIsOther ? "Other" : form.businessType}
              onChange={handleBusinessTypeChange}
              suffix={
                selectedTypeIsOther && (
                  <Input
                    autoFocus
                    placeholder="e.g. Outdoor gear, Pet food, SaaS..."
                    value={customBusinessType}
                    onChange={(e) => handleCustomTypeInput(e.target.value)}
                    className="mt-1"
                  />
                )
              }
            />
          </div>
          <div>
            <Label className="text-sm font-semibold mb-2 block">Business Stage</Label>
            <RadioGroup options={BUSINESS_STAGES} value={form.businessStage} onChange={(v) => update("businessStage", v)} />
          </div>
          <div>
            <Label className="text-sm font-semibold mb-2 block">Email List Size</Label>
            <RadioGroup options={LIST_SIZES} value={form.emailListSize} onChange={(v) => update("emailListSize", v)} />
          </div>
        </div>
      ),
    },
    {
      title: "Brand Identity",
      description: "How does the brand position itself?",
      content: (
        <div className="space-y-5 max-h-[55vh] overflow-y-auto pr-1 pb-2">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Discount Approach</Label>
            <RadioGroup options={DISCOUNT_APPROACHES} value={form.discountApproach} onChange={(v) => update("discountApproach", v)} />
          </div>
          <div>
            <Label className="text-sm font-semibold mb-2 block">
              Key Differentiators <span className="text-gray-400 font-normal">(pick up to 3)</span>
            </Label>
            <CheckboxGroup
              options={getOptionsForType(DIFFERENTIATORS, effectiveBusinessType)}
              value={form.keyDifferentiators || []}
              onChange={(v) => update("keyDifferentiators", v)}
              max={3}
            />
          </div>
          <div>
            <Label className="text-sm font-semibold mb-2 block">Brand Tone</Label>
            <RadioGroup options={BRAND_TONES} value={form.brandTone} onChange={(v) => update("brandTone", v)} />
          </div>
        </div>
      ),
    },
    {
      title: "Additional Context",
      description: "Optional details to fine-tune the flows",
      content: (
        <div className="space-y-5 pb-2">
          <div>
            <Label htmlFor="competitors" className="text-sm font-semibold mb-2 block">
              Top Competitors <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="competitors"
              placeholder="e.g. Glossier, The Ordinary, Drunk Elephant"
              value={form.competitors || ""}
              onChange={(e) => update("competitors", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="instructions" className="text-sm font-semibold mb-2 block">
              Special Instructions <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="instructions"
              placeholder="e.g. mention our current BOGO sale, avoid aggressive urgency language, use discount code WELCOME10..."
              rows={4}
              value={form.specialInstructions || ""}
              onChange={(e) => update("specialInstructions", e.target.value)}
            />
          </div>
        </div>
      ),
    },
  ];

  const answeredCount = [
    form.businessType,
    form.businessStage,
    form.emailListSize,
    form.discountApproach,
    form.keyDifferentiators?.length ? "yes" : undefined,
    form.brandTone,
  ].filter(Boolean).length;

  const currentStep = steps[step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{currentStep.title}</DialogTitle>
          <DialogDescription>{currentStep.description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-blue-500" : "bg-gray-200"
              }`}
            />
          ))}
          <span className="text-xs text-gray-400 ml-1">{step + 1}/{steps.length}</span>
        </div>

        {currentStep.content}

        <DialogFooter className="gap-2 sm:gap-0">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          <div className="flex-1" />
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
              <Check className="w-4 h-4 mr-1" /> Save ({answeredCount}/6 answered)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
