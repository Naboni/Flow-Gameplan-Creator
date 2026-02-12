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
        <Handle type="source" position={Position.Right} className="flow-handle flow-handle--strategy" />
      </div>
    );
  }

  if (fn.type === "note") {
    return (
      <div className={`flow-note ${selected ? "flow-note--selected" : ""}`}>
        <div className="flow-note__title">{data.title}</div>
        <div className="flow-note__body">{fn.body}</div>
        <Handle type="source" position={Position.Right} className="flow-handle flow-handle--note" />
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
      <div className="flow-card__header">
        <div className={`flow-card__icon flow-card__icon--${typeKey}`}>{icon}</div>
        <div className="flow-card__title">{data.title}</div>
      </div>
      {subtitle && <div className="flow-card__subtitle">{subtitle}</div>}
      {fn.type === "message" && (
        <div className="flow-card__footer">
          <span className={`flow-badge flow-badge--${fn.channel}`}>{fn.channel.toUpperCase()}</span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  );
}
