import { useMemo, useState } from "react";
import {
  expandPackageTemplate,
  parseFlowSpec,
  welcomeSeriesFixture,
  type FlowSpec
} from "@flow/core";
import { buildLayout } from "@flow/layout";

type TemplateChoice = "welcome-series" | "core-foundation" | "growth-engine" | "full-system";

const CHOICES: Array<{ label: string; value: TemplateChoice }> = [
  { label: "Welcome Series (test case)", value: "welcome-series" },
  { label: "Core Foundation", value: "core-foundation" },
  { label: "Growth Engine", value: "growth-engine" },
  { label: "Full System", value: "full-system" }
];

function getSpecFromChoice(choice: TemplateChoice): FlowSpec {
  if (choice === "welcome-series") {
    return parseFlowSpec(welcomeSeriesFixture);
  }
  const expanded = expandPackageTemplate(choice);
  return expanded.flows[0];
}

function getNodeTypeClass(type: string): string {
  if (type === "trigger") {
    return "node-trigger";
  }
  if (type === "split") {
    return "node-split";
  }
  if (type === "wait") {
    return "node-wait";
  }
  if (type === "outcome") {
    return "node-outcome";
  }
  return "node-message";
}

export default function App() {
  const [choice, setChoice] = useState<TemplateChoice>("welcome-series");
  const [zoom, setZoom] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const spec = useMemo(() => getSpecFromChoice(choice), [choice]);
  const layout = useMemo(() => buildLayout(spec), [spec]);
  const nodesById = useMemo(() => new Map(spec.nodes.map((node) => [node.id, node])), [spec.nodes]);
  const selectedNode = selectedNodeId ? nodesById.get(selectedNodeId) : null;

  const bounds = useMemo(() => {
    const maxX = Math.max(...layout.nodes.map((node) => node.x + node.width), 0);
    const maxY = Math.max(...layout.nodes.map((node) => node.y + node.height), 0);
    return { width: maxX + 200, height: maxY + 200 };
  }, [layout.nodes]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="title-block">
          <h1>Flow Gameplan Creator</h1>
          <p>Visual, clickable preview with deterministic layout.</p>
        </div>
        <div className="controls">
          <label>
            Flow preset
            <select value={choice} onChange={(event) => setChoice(event.target.value as TemplateChoice)}>
              {CHOICES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zoom
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.1}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
        </div>
      </header>

      <main className="content-grid">
        <section className="canvas-panel">
          <div className="canvas-scroll">
            <div
              className="canvas-stage"
              style={{
                width: bounds.width,
                height: bounds.height,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0"
              }}
            >
              <svg className="edge-layer" width={bounds.width} height={bounds.height}>
                {layout.edges.map((edge) => (
                  <g key={edge.id}>
                    <polyline
                      points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")}
                      fill="none"
                      stroke="#7a8094"
                      strokeWidth={2}
                      markerEnd="url(#arrow)"
                    />
                    {edge.label ? (
                      <text
                        x={edge.points[Math.floor(edge.points.length / 2)]?.x ?? 0}
                        y={(edge.points[Math.floor(edge.points.length / 2)]?.y ?? 0) - 8}
                        className="edge-label"
                      >
                        {edge.label}
                      </text>
                    ) : null}
                  </g>
                ))}
                <defs>
                  <marker
                    id="arrow"
                    markerWidth="10"
                    markerHeight="7"
                    refX="10"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7a8094" />
                  </marker>
                </defs>
              </svg>

              {layout.nodes.map((node) => {
                const sourceNode = nodesById.get(node.id);
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`flow-node ${getNodeTypeClass(node.type)} ${
                      selectedNodeId === node.id ? "selected" : ""
                    }`}
                    style={{
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      minHeight: node.height
                    }}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <strong>{node.title}</strong>
                    <span className="node-meta">{node.type}</span>
                    {sourceNode && "channel" in sourceNode ? (
                      <span className="node-sub">{sourceNode.channel.toUpperCase()}</span>
                    ) : null}
                    {sourceNode && sourceNode.type === "wait" ? (
                      <span className="node-sub">
                        Wait {sourceNode.duration.value} {sourceNode.duration.unit}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="details-panel">
          <h2>Node details</h2>
          {!selectedNode ? (
            <p>Click any node to inspect details.</p>
          ) : (
            <div className="details-content">
              <p>
                <b>ID:</b> {selectedNode.id}
              </p>
              <p>
                <b>Type:</b> {selectedNode.type}
              </p>
              {"title" in selectedNode ? (
                <p>
                  <b>Title:</b> {selectedNode.title}
                </p>
              ) : null}
              {"event" in selectedNode ? (
                <p>
                  <b>Trigger:</b> {selectedNode.event}
                </p>
              ) : null}
              {"condition" in selectedNode ? (
                <p>
                  <b>Condition:</b> {selectedNode.condition}
                </p>
              ) : null}
              {"channel" in selectedNode ? (
                <p>
                  <b>Channel:</b> {selectedNode.channel}
                </p>
              ) : null}
              {"duration" in selectedNode ? (
                <p>
                  <b>Delay:</b> {selectedNode.duration.value} {selectedNode.duration.unit}
                </p>
              ) : null}
              {"objectiveFocus" in selectedNode && selectedNode.objectiveFocus ? (
                <div>
                  <p>
                    <b>OBJECTIVE/FOCUS:</b> {selectedNode.objectiveFocus.title}
                  </p>
                  <ul>
                    {selectedNode.objectiveFocus.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
