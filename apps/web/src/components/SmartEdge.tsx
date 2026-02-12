import { BaseEdge, getSmoothStepPath, Position, type EdgeProps } from "reactflow";

function buildVerticalPath(sx: number, sy: number, tx: number, ty: number, r = 8): [string, number, number] {
  const midY = (sy + ty) / 2;
  const labelX = (sx + tx) / 2;
  const labelY = midY;

  if (Math.abs(sx - tx) < 1) {
    return [`M ${sx} ${sy} L ${tx} ${ty}`, labelX, labelY];
  }

  const dx = tx - sx;
  const sign = dx > 0 ? 1 : -1;
  const cr = Math.min(r, Math.abs(dx) / 2, Math.abs(midY - sy), Math.abs(ty - midY));

  const path =
    `M ${sx} ${sy} ` +
    `L ${sx} ${midY - cr} ` +
    `Q ${sx} ${midY} ${sx + sign * cr} ${midY} ` +
    `L ${tx - sign * cr} ${midY} ` +
    `Q ${tx} ${midY} ${tx} ${midY + cr} ` +
    `L ${tx} ${ty}`;

  return [path, labelX, labelY];
}

export function SmartEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;

  const isVerticalFlow = sourcePosition === Position.Bottom && targetPosition === Position.Top;
  const isSameLane = Math.abs(sourceX - targetX) < 5;

  let path: string, labelX: number, labelY: number;
  if (isVerticalFlow && isSameLane) {
    [path, labelX, labelY] = buildVerticalPath(sourceX, sourceY, targetX, targetY, 8);
  } else {
    [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
  }

  return (
    <BaseEdge
      path={path}
      labelX={labelX}
      labelY={labelY}
      markerEnd={props.markerEnd}
      style={props.style}
      label={props.label}
      labelStyle={props.labelStyle}
      labelShowBg={props.labelShowBg}
      labelBgStyle={props.labelBgStyle}
      labelBgPadding={props.labelBgPadding}
      labelBgBorderRadius={props.labelBgBorderRadius}
    />
  );
}
