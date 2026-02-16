import { Handle, Position, type NodeProps } from "reactflow";
import { MoreHorizontal, Eye, Pencil, Trash2, ChevronDown } from "lucide-react";
import { NodeIcons } from "./NodeIcons";
import type { AppNodeData } from "../types/flow";
import type { MessageStatus } from "@flow/core";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

const STATUS_LABELS: Record<MessageStatus, string> = {
  draft: "Draft selected",
  manual: "Manual",
  live: "Live",
};

const STATUS_COLORS: Record<MessageStatus, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  manual: "bg-amber-50 text-amber-700 border-amber-200",
  live: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function EmailNodeMenu({ nodeId, callbacks }: { nodeId: string; callbacks: AppNodeData["callbacks"] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flow-msg__menu-btn"
          onClick={(e) => e.stopPropagation()}
          title="Actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="min-w-[140px]">
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); callbacks?.onEdit?.(nodeId); }}
          className="gap-2 cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); callbacks?.onPreview?.(nodeId); }}
          className="gap-2 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          Preview
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); callbacks?.onDelete?.(nodeId); }}
          className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusDropdown({
  nodeId,
  status,
  callbacks,
}: {
  nodeId: string;
  status: MessageStatus;
  callbacks: AppNodeData["callbacks"];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flow-msg__status-area" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className={`flow-msg__status-btn ${STATUS_COLORS[status]}`}>
            <span className="flow-msg__status-dot" />
            {STATUS_LABELS[status]}
            <ChevronDown className="w-3 h-3 ml-1 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="min-w-[140px]">
          {(["draft", "manual", "live"] as MessageStatus[]).map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => { callbacks?.onStatusChange?.(nodeId, s); setOpen(false); }}
              className={`gap-2 cursor-pointer ${s === status ? "font-semibold" : ""}`}
            >
              <span className={`w-2 h-2 rounded-full ${s === "draft" ? "bg-slate-400" : s === "manual" ? "bg-amber-500" : "bg-emerald-500"}`} />
              {STATUS_LABELS[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function FlowCanvasNode({ data, selected, id }: NodeProps<AppNodeData>) {
  const fn = data.flowNode;

  if (fn.type === "strategy") {
    const branch = fn.branchLabel ?? "yes";
    return (
      <div className={`flow-strategy flow-strategy--${branch} ${selected ? "flow-strategy--selected" : ""}`}>
        <div className={`flow-strategy__header flow-strategy__header--${branch}`}>
          <div className="flow-strategy__header-icon">{NodeIcons.strategy}</div>
          <span>{data.title}</span>
        </div>
        <div className="flow-strategy__body">
          <div className="flow-strategy__label">PRIMARY FOCUS</div>
          <p className="flow-strategy__text">{fn.primaryFocus}</p>
          <div className="flow-strategy__label flow-strategy__label--secondary">SECONDARY FOCUS</div>
          <p className="flow-strategy__text">{fn.secondaryFocus}</p>
        </div>
        <Handle type="source" position={Position.Left} id="source-left" className="flow-handle flow-handle--strategy" />
        <Handle type="source" position={Position.Right} id="source-right" className="flow-handle flow-handle--strategy" />
      </div>
    );
  }

  if (fn.type === "note") {
    return (
      <div className={`flow-note ${selected ? "flow-note--selected" : ""}`}>
        <div className="flow-note__title">{data.title}</div>
        <div className="flow-note__body">{fn.body}</div>
        <Handle type="source" position={Position.Left} id="source-left" className="flow-handle flow-handle--note" />
        <Handle type="source" position={Position.Right} id="source-right" className="flow-handle flow-handle--note" />
      </div>
    );
  }

  if (fn.type === "message") {
    const isEmail = fn.channel === "email";
    const channelClass = isEmail ? "email" : "sms";
    const status: MessageStatus = fn.status ?? "draft";
    const hasCallbacks = !!data.callbacks;

    return (
      <div className={`flow-msg flow-msg--${channelClass} ${fn.strategy ? "flow-msg--with-strategy" : ""} ${selected ? "flow-msg--selected" : ""}`}>
        <Handle type="target" position={Position.Top} className="flow-handle" />
        <Handle type="target" position={Position.Left} id="left" className="flow-handle" />
        <Handle type="target" position={Position.Right} id="right" className="flow-handle" />

        <div className="flow-msg__header">
          {isEmail && hasCallbacks && (
            <EmailNodeMenu nodeId={id} callbacks={data.callbacks} />
          )}
          <span className="flow-msg__header-text">{data.title}</span>
        </div>

        <div className="flow-msg__body">
          <div className="flow-msg__field">
            <span className="flow-msg__field-label">Message Type:</span>
            <span className="flow-msg__field-value">{isEmail ? "Email" : "SMS"}</span>
          </div>
          <div className="flow-msg__field">
            <span className="flow-msg__field-label">AB Test:</span>
            <span className="flow-msg__field-value">{fn.abTest?.description || "..."}</span>
          </div>
          <div className="flow-msg__field">
            <span className="flow-msg__field-label">Smart Sending:</span>
            <span className="flow-msg__field-value">{fn.smartSending ? "ON" : "OFF"}</span>
          </div>
          <div className="flow-msg__field">
            <span className="flow-msg__field-label">UTM Links:</span>
            <span className="flow-msg__field-value">{fn.utmLinks !== false ? "YES" : "NO"}</span>
          </div>
          <div className="flow-msg__field">
            <span className="flow-msg__field-label">Discount:</span>
            {fn.discountCode?.included ? (
              <span className="flow-msg__field-value">
                <span className="flow-msg__discount-check">{"✓ "}</span>
                {fn.discountCode.code && <span className="flow-msg__discount-code">{fn.discountCode.code}</span>}
                {fn.discountCode.description && (
                  <div className="flow-msg__discount-desc">*{fn.discountCode.description}</div>
                )}
              </span>
            ) : (
              <span className="flow-msg__field-value">No</span>
            )}
          </div>
          <div className="flow-msg__field">
            <span className="flow-msg__field-label">Filter conditions:</span>
            <span className="flow-msg__field-value">{fn.filterConditions || "NA"}</span>
          </div>
          <div className="flow-msg__field flow-msg__field--block">
            <span className="flow-msg__field-label">Implementation Notes: </span>
            <span className="flow-msg__field-value">{fn.implementationNotes || "..."}</span>
          </div>
        </div>

        {fn.strategy && (
          <>
            <div className="flow-msg__strategy-header">Strategy</div>
            <div className="flow-msg__strategy-body">
              <div className="flow-msg__focus-label">PRIMARY FOCUS</div>
              <p className="flow-msg__focus-text">{fn.strategy.primaryFocus}</p>
              <div className="flow-msg__focus-label">SECONDARY FOCUS</div>
              <p className="flow-msg__focus-text">{fn.strategy.secondaryFocus}</p>
            </div>
          </>
        )}

        {isEmail && hasCallbacks && (
          <div className="flow-msg__footer-bar">
            <StatusDropdown nodeId={id} status={status} callbacks={data.callbacks} />
          </div>
        )}

        <Handle type="source" position={Position.Bottom} className="flow-handle" />
      </div>
    );
  }

  if (fn.type === "wait") {
    return (
      <div className={`flow-card flow-card--wait ${selected ? "flow-card--selected" : ""}`}>
        <Handle type="target" position={Position.Top} className="flow-handle" />
        <div className="flow-card__header">
          <div className="flow-card__icon flow-card__icon--wait">{NodeIcons.wait}</div>
          <span className="flow-card__title">Wait {fn.duration.value} {fn.duration.unit}</span>
        </div>
        <Handle type="source" position={Position.Bottom} className="flow-handle" />
      </div>
    );
  }

  if (fn.type === "outcome") {
    return (
      <div className={`flow-end ${selected ? "flow-end--selected" : ""}`}>
        <Handle type="target" position={Position.Top} className="flow-handle flow-handle--end" />
        <span className="flow-end__label">End</span>
      </div>
    );
  }

  const typeKey = fn.type === "profileFilter" ? "filter" : fn.type;

  const icon = fn.type === "profileFilter" ? NodeIcons.filter
    : NodeIcons[fn.type as keyof typeof NodeIcons];

  let subtitle = "";
  if (fn.type === "trigger") subtitle = fn.event;
  else if (fn.type === "split") subtitle = fn.condition;
  else if (fn.type === "profileFilter") subtitle = fn.filters.join(", ");

  return (
    <div className={`flow-card flow-card--${typeKey} ${selected ? "flow-card--selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <Handle type="target" position={Position.Left} id="left" className="flow-handle" />
      <Handle type="target" position={Position.Right} id="right" className="flow-handle" />
      <div className="flow-card__header">
        <div className={`flow-card__icon flow-card__icon--${typeKey}`}>{icon}</div>
        <div className="flow-card__title">{data.title}</div>
      </div>
      {subtitle && <div className="flow-card__subtitle">{subtitle}</div>}
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  );
}
