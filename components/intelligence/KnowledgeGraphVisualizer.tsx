"use client";

import React, { useState, useMemo } from "react";
import type { KnowledgeGraph, ReactFlowNode, NodeType } from "@/types";

interface Props {
  graph: KnowledgeGraph | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function KnowledgeGraphVisualizer({ graph, isLoading = false, onRefresh }: Props) {
  const [selectedNode, setSelectedNode] = useState<ReactFlowNode | null>(null);
  const [zoom, setZoom] = useState<number>(1);

  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];

  // Compute bounding box for auto-scaling
  const { minX, minY, maxX, maxY, width, height } = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 600, maxY: 400, width: 600, height: 400 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((n) => {
      const x = n.position?.x ?? 50;
      const y = n.position?.y ?? 50;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });

    const pad = 120;
    const w = Math.max(650, maxX - minX + pad * 2);
    const h = Math.max(450, maxY - minY + pad * 2);
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad, width: w, height: h };
  }, [nodes]);

  const getNodeColor = (type: NodeType) => {
    switch (type) {
      case "consensus":
        return {
          bg: "bg-emerald-950/70 border-emerald-500/50 text-emerald-300",
          badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          glow: "shadow-emerald-900/30",
        };
      case "debate":
        return {
          bg: "bg-amber-950/70 border-amber-500/50 text-amber-300",
          badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
          glow: "shadow-amber-900/30",
        };
      case "blocker":
        return {
          bg: "bg-rose-950/70 border-rose-500/50 text-rose-300",
          badge: "bg-rose-500/20 text-rose-400 border-rose-500/30",
          glow: "shadow-rose-900/30",
        };
      case "decision":
        return {
          bg: "bg-purple-950/70 border-purple-500/50 text-purple-300",
          badge: "bg-purple-500/20 text-purple-400 border-purple-500/30",
          glow: "shadow-purple-900/30",
        };
      case "action_item":
        return {
          bg: "bg-teal-950/70 border-teal-500/50 text-teal-300",
          badge: "bg-teal-500/20 text-teal-400 border-teal-500/30",
          glow: "shadow-teal-900/30",
        };
      default:
        return {
          bg: "bg-slate-900/80 border-slate-600/50 text-slate-300",
          badge: "bg-slate-700/40 text-slate-300 border-slate-600/40",
          glow: "shadow-slate-900/30",
        };
    }
  };

  const getEdgeStyle = (type?: string) => {
    switch (type) {
      case "supports":
        return { stroke: "#10b981", strokeDasharray: "none", strokeWidth: 2 };
      case "disputes":
        return { stroke: "#f43f5e", strokeDasharray: "4 3", strokeWidth: 2 };
      case "depends_on":
        return { stroke: "#94a3b8", strokeDasharray: "2 2", strokeWidth: 1.5 };
      case "resolves":
        return { stroke: "#a855f7", strokeDasharray: "none", strokeWidth: 2.5 };
      default:
        return { stroke: "#64748b", strokeDasharray: "none", strokeWidth: 1.5 };
    }
  };

  // Node position map for rendering edges
  const nodeMap = useMemo(() => {
    const map = new Map<string, ReactFlowNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  if (isLoading && nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
        <svg className="w-6 h-6 animate-spin text-violet-400 mb-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-xs">Generating Knowledge Graph...</span>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400 text-center">
        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 text-xl mb-3">
          🕸️
        </div>
        <p className="text-sm font-medium text-slate-300">No Knowledge Graph yet</p>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          As participants contribute ideas and debate, the AI automatically constructs an entity graph with consensus and conflict edges.
        </p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="mt-4 px-3 py-1.5 rounded-lg border border-white/10 bg-[#161d2e] text-xs text-slate-300 hover:bg-[#1a2236] transition-colors"
          >
            Check for Graph
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-[#0a0d18] rounded-xl border border-white/5">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0e1424]/90 border-b border-white/5 z-10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-xs font-semibold text-white">Live Semantic Graph</span>
          <span className="text-[10px] text-slate-500">({nodes.length} nodes, {edges.length} edges)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
            className="w-6 h-6 rounded bg-[#161d2e] border border-white/10 text-slate-300 hover:text-white text-xs flex items-center justify-center"
            title="Zoom out"
          >
            -
          </button>
          <span className="text-[10px] text-slate-400 w-8 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
            className="w-6 h-6 rounded bg-[#161d2e] border border-white/10 text-slate-300 hover:text-white text-xs flex items-center justify-center"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom(1)}
            className="px-2 py-0.5 rounded bg-[#161d2e] border border-white/10 text-slate-300 hover:text-white text-[10px]"
            title="Reset zoom"
          >
            Reset
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1 rounded bg-[#161d2e] border border-white/10 text-slate-300 hover:text-white text-xs"
              title="Refresh graph"
            >
              🔄
            </button>
          )}
        </div>
      </div>

      {/* Graph Canvas Container */}
      <div className="flex-1 overflow-auto relative p-6">
        <div
          className="relative transition-transform duration-200 origin-top-left"
          style={{
            width: `${width}px`,
            height: `${height}px`,
            transform: `scale(${zoom})`,
          }}
        >
          {/* SVG Canvas for Edges */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <defs>
              <marker id="arrow-supports" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
              </marker>
              <marker id="arrow-disputes" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
              </marker>
              <marker id="arrow-resolves" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
              </marker>
              <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
              </marker>
            </defs>

            {edges.map((edge) => {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (!src || !tgt) return null;

              const srcX = (src.position?.x ?? 50) - minX + 110;
              const srcY = (src.position?.y ?? 50) - minY + 40;
              const tgtX = (tgt.position?.x ?? 50) - minX + 110;
              const tgtY = (tgt.position?.y ?? 50) - minY + 40;

              const style = getEdgeStyle(edge.type);
              const markerId =
                edge.type === "supports"
                  ? "arrow-supports"
                  : edge.type === "disputes"
                  ? "arrow-disputes"
                  : edge.type === "resolves"
                  ? "arrow-resolves"
                  : "arrow-default";

              const midX = (srcX + tgtX) / 2;
              const midY = (srcY + tgtY) / 2 - 15;

              return (
                <g key={edge.id}>
                  <path
                    d={`M ${srcX} ${srcY} Q ${midX} ${midY} ${tgtX} ${tgtY}`}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    strokeDasharray={style.strokeDasharray}
                    markerEnd={`url(#${markerId})`}
                    opacity={0.8}
                  />
                  {edge.label && (
                    <text
                      x={midX}
                      y={midY}
                      fill="#94a3b8"
                      fontSize="9"
                      textAnchor="middle"
                      className="select-none font-mono"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Render Nodes */}
          {nodes.map((node) => {
            const posX = (node.position?.x ?? 50) - minX;
            const posY = (node.position?.y ?? 50) - minY;
            const theme = getNodeColor(node.data?.node_type || "topic");
            const isSelected = selectedNode?.id === node.id;
            const stance = node.data?.stance;

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode(node)}
                style={{
                  position: "absolute",
                  left: `${posX}px`,
                  top: `${posY}px`,
                  width: "220px",
                }}
                className={`rounded-xl border p-3 cursor-pointer shadow-lg transition-all duration-150 backdrop-blur-md z-10 ${
                  theme.bg
                } ${theme.glow} ${
                  isSelected ? "ring-2 ring-violet-400 scale-105 z-20" : "hover:scale-[1.02]"
                }`}
              >
                {/* Node Type Badge */}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span
                    className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${theme.badge}`}
                  >
                    {node.data?.node_type || "Topic"}
                  </span>
                  {node.data?.status && (
                    <span className="text-[9px] text-slate-400 font-medium capitalize">
                      {node.data.status}
                    </span>
                  )}
                </div>

                {/* Node Label / Text */}
                <p className="text-xs font-medium text-slate-100 line-clamp-3 leading-snug">
                  {node.data?.label || node.id}
                </p>

                {/* Stance Indicator Bar */}
                {stance && (
                  <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-semibold">+{stance.agree_count || 0}</span>
                      <span className="text-rose-400 font-semibold">-{stance.disagree_count || 0}</span>
                    </div>
                    {node.data?.confidence !== undefined && (
                      <span className="text-slate-400">
                        {Math.round(node.data.confidence * 100)}% conf
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Node Drawer */}
      {selectedNode && (
        <div className="border-t border-white/10 bg-[#0c1220] p-4 flex flex-col gap-2 z-20 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">Node Details</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 font-mono">
                {selectedNode.data?.node_type}
              </span>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-white/5"
            >
              ✕ Close
            </button>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">{selectedNode.data?.label}</p>
          {selectedNode.data?.supporting_contribution_ids &&
            selectedNode.data.supporting_contribution_ids.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span>Supporting evidence:</span>
                <span className="text-violet-300 font-mono">
                  {selectedNode.data.supporting_contribution_ids.join(", ")}
                </span>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
