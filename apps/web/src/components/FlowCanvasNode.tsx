import { Handle, Position, type NodeProps } from "reactflow";
import { NodeIcons } from "./NodeIcons";
import type { AppNodeData } from "../types/flow";

export function FlowCanvasNode({ data, selected }: NodeProps<AppNodeData>) {
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
    return (
      <div className={`flow-msg flow-msg--${channelClass} ${fn.strategy ? "flow-msg--with-strategy" : ""} ${selected ? "flow-msg--selected" : ""}`}>
        <Handle type="target" position={Position.Top} className="flow-handle" />
        <Handle type="target" position={Position.Left} id="left" className="flow-handle" />
        <Handle type="target" position={Position.Right} id="right" className="flow-handle" />

        <div className="flow-msg__header">{data.title}</div>

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
