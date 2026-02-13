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

  const typeKey = fn.type === "message" ? fn.channel
    : fn.type === "profileFilter" ? "filter"
    : fn.type;

  const icon = fn.type === "message"
    ? (fn.channel === "sms" ? NodeIcons.sms : NodeIcons.email)
    : fn.type === "profileFilter" ? NodeIcons.filter
    : NodeIcons[fn.type as keyof typeof NodeIcons];

  let subtitle = "";
  if (fn.type === "trigger") subtitle = fn.event;
  else if (fn.type === "message") subtitle = fn.copyHint || "";
  else if (fn.type === "split") subtitle = fn.condition;
  else if (fn.type === "outcome") subtitle = fn.result;
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
      {fn.type === "message" && (
        <div className="flow-card__sections">
          {/* discount code row */}
          <div className={`flow-card__row ${fn.discountCode?.included ? "flow-card__row--yes" : "flow-card__row--no"}`}>
            <span className="flow-card__row-icon">{fn.discountCode?.included ? "✓" : "✗"}</span>
            <span className="flow-card__row-text">
              {fn.discountCode?.included
                ? fn.discountCode.description || fn.discountCode.code || "discount code"
                : "no discount code"}
            </span>
          </div>
          {/* A/B test row */}
          {fn.abTest && (
            <div className="flow-card__row flow-card__row--neutral">
              <span className="flow-card__row-label">A/B Test:</span>
              <span className="flow-card__row-text">{fn.abTest.description}</span>
            </div>
          )}
          {/* messaging focus row */}
          {fn.messagingFocus && (
            <div className="flow-card__row flow-card__row--neutral">
              <span className="flow-card__row-label">Messaging:</span>
              <span className="flow-card__row-text">{fn.messagingFocus}</span>
            </div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  );
}
