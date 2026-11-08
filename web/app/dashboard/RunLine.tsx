"use client";

import React, { memo, useMemo } from "react";
import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import type { DashboardCopy } from "./copy";
import type { ExecutionView } from "./use-execution";

type StationState = "done" | "current" | "gate" | "error" | "pending";

interface StationData extends Record<string, unknown> {
  label: string;
  time: string | null;
  detail: string | null;
  state: StationState;
}

const STATION_SPACING = 210;
const GATE_INDEX = 3;

function firstTime(view: ExecutionView, kinds: string[]): string | null {
  const event = view.events.find((e) => kinds.includes(e.kind));
  return event ? event.at.slice(11, 19) : null;
}

function buildStations(view: ExecutionView, copy: DashboardCopy): StationData[] {
  const s = view.status;
  const failed = s === "failed" || s === "needs_manual_action";
  const approvedFinal = view.finalDecision?.decision === "approve";
  const refusedFinal = view.finalDecision?.decision === "refuse";
  const onPortal = view.events.some((e) => e.kind === "observation" || e.kind === "agent");

  // Index of the furthest station the run has reached.
  const reached =
    s === "supplier_confirmed" ? 5 : approvedFinal || s === "submitted" ? 4 : s === "awaiting_final_approval" ? 3 : onPortal ? 2 : s === "prepared" ? 1 : 2;

  const stateFor = (index: number): StationState => {
    if (index === GATE_INDEX && s === "awaiting_final_approval") return "gate";
    if (index === GATE_INDEX && refusedFinal) return "error";
    if (index === 5) return "pending";
    if (index < reached) return "done";
    if (index === reached) {
      if (failed || s === "stopped_by_user") return "error";
      return s === "supplier_confirmed" && index === 4 ? "done" : "current";
    }
    return "pending";
  };

  const proof = view.supplierState?.confirmation_number ?? view.confirmationNumber;
  const details: (string | null)[] = [
    view.actionHash ? `#${view.actionHash.slice(0, 8)}` : null,
    view.playbook ? (view.playbook.source === "research" ? "Linkup" : "Kerdaxis") : null,
    view.steps ? `${view.steps} steps` : null,
    view.pendingApproval?.button_label ?? null,
    proof,
    null,
  ];
  const times: (string | null)[] = [
    firstTime(view, ["approval"]),
    firstTime(view, ["system"]),
    firstTime(view, ["observation", "agent"]),
    view.finalDecision ? view.finalDecision.at.slice(11, 19) : null,
    firstTime(view, ["verification"]),
    null,
  ];

  return copy.stations.map((label, index) => ({
    label,
    time: times[index],
    detail: index === 5 ? copy.stationWaiting : details[index],
    state: stateFor(index),
  }));
}

const Station = memo(function Station({ data }: NodeProps<Node<StationData>>) {
  return (
    <div className={`rl-station rl-${data.state}`}>
      <Handle type="target" position={Position.Left} className="rl-handle" isConnectable={false} />
      <span className="rl-dot" aria-hidden="true" />
      <span className="rl-label">{data.label}</span>
      <span className="rl-time">{data.time ?? "--:--:--"}</span>
      {data.detail && <span className="rl-detail">{data.detail}</span>}
      <Handle type="source" position={Position.Right} className="rl-handle" isConnectable={false} />
    </div>
  );
});

const NODE_TYPES = { station: Station };

export function RunLine({ view, copy }: { view: ExecutionView; copy: DashboardCopy }): React.ReactElement {
  const stations = useMemo(() => buildStations(view, copy), [view, copy]);

  const nodes = useMemo<Node<StationData>[]>(
    () =>
      stations.map((data, index) => ({
        id: `s${index}`,
        type: "station",
        position: { x: index * STATION_SPACING, y: 0 },
        data,
        draggable: false,
        selectable: false,
      })),
    [stations],
  );

  const edges = useMemo<Edge[]>(
    () =>
      stations.slice(1).map((next, index) => {
        const travelled = next.state === "done" || next.state === "gate" || next.state === "current";
        return {
          id: `e${index}`,
          source: `s${index}`,
          target: `s${index + 1}`,
          type: "straight",
          animated: next.state === "current",
          className: travelled ? "rl-edge rl-edge-on" : "rl-edge",
        };
      }),
    [stations],
  );

  return (
    <div className="rl-wrap" role="img" aria-label={stations.map((s) => `${s.label}: ${s.state}`).join(", ")}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
      />
    </div>
  );
}
