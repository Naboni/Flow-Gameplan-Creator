import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface FlowSpecModalProps {
  /** Controls whether the dialog is visible. */
  open: boolean;
  /** Called when the dialog requests a visibility change (Escape, outside click, etc.). */
  onOpenChange: (open: boolean) => void;
  /** The current value of the flow-description textarea. */
  value: string;
  /** Called on every keystroke in the textarea with the updated text. */
  onChange: (value: string) => void;
  /** When `true`, the textarea is disabled (e.g. while generation is running). */
  disabled?: boolean;
  /** Whether the collapsible help panel is currently expanded. */
  infoOpen: boolean;
  /** Toggles the expanded/collapsed state of the help panel. */
  onInfoToggle: () => void;
}

export function FlowSpecModal({
  open,
  onOpenChange,
  value,
  onChange,
  disabled,
  infoOpen,
  onInfoToggle,
}: FlowSpecModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Describe your flows
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={onInfoToggle}
              title="How to describe your flows"
            >
              <Info className="h-4 w-4" />
            </button>
          </DialogTitle>
          <DialogDescription>
            Number each flow (1, 2, 3…). Each number starts a new flow chart.
          </DialogDescription>
        </DialogHeader>

        {infoOpen && (
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">How to describe your flows</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <b>Flow name & channel:</b> e.g. "Email Welcome", "SMS Welcome",
                "Checkout Abandonment"
              </li>
              <li>
                <b>Email/SMS counts:</b> e.g. "4 emails, 2 SMS"
              </li>
              <li>
                <b>Conditional splits:</b> e.g. "Split by purchase history" or
                "Conditional split by engagement"
              </li>
              <li>
                <b>Per-segment breakdown:</b> e.g. "3 emails for purchasers, 2 for
                non-purchasers"
              </li>
              <li>
                <b>Mirror another flow:</b> e.g. "mirrors Checkout Abandonment"
              </li>
            </ul>
            <p className="text-xs">
              You can write as much detail as you want per flow. The next flow starts
              at the next number.
            </p>
          </div>
        )}

        <div className="py-2">
          <textarea
            id="flow-spec-modal"
            className="flex min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            placeholder={
              "1) Email Welcome: 4 emails, split by purchase history\n" +
              "2) SMS Welcome: 3 SMS\n" +
              "3) Checkout Abandonment: 6 emails, 4 SMS\n" +
              "4) Post-Purchase: 3 emails, 2 SMS\n..."
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
