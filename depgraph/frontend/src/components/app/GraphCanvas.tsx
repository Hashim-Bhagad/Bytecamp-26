import React, { useMemo, useState } from 'react';
import dagre from '@dagrejs/dagre';
import { useApp } from '@/context/AppContext';
import { GraphNode } from '@/api/client';

const CANVAS_W = 3000;
const CANVAS_H = 3000;

const NODE_W = 180;
const NODE_H = 110;

const LANG_COLORS: Record<string, string> = {
  sql: '#d97706',
  python: '#7c3aed',
  typescript: '#2563eb',
  react: '#059669',
};

const LANG_LABELS: Record<string, string> = {
  sql: 'DATABASE',
  python: 'BACKEND',
  typescript: 'FRONTEND',
  react: 'UI',
};

function getEdgePath(fromPos: {x:number, y:number}, toPos: {x:number, y:number}): string {
  if (!fromPos || !toPos) return '';
  const x1 = fromPos.x + NODE_W / 2;
  const y1 = fromPos.y + NODE_H;
  const x2 = toPos.x + NODE_W / 2;
  const y2 = toPos.y;
  
  // A simple cubic bezier curve going downwards
  const yOffset = Math.abs(y2 - y1) * 0.5;
  return `M ${x1} ${y1} C ${x1} ${y1 + yOffset}, ${x2} ${y2 - yOffset}, ${x2} ${y2}`;
}

interface NodeCardProps {
  node: GraphNode;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
  severityScore?: number;
  severityTier?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

function NodeCard({ node, selected, dimmed, onClick, severityTier }: NodeCardProps) {
  const color = LANG_COLORS[node.language] || '#4a6888';
  const label = LANG_LABELS[node.language] || node.language.toUpperCase();
  const isBreaking = severityTier === 'CRITICAL' || severityTier === 'HIGH';

  return (
    <div
      onClick={onClick}
      style={{
        width: `${NODE_W}px`,
        height: `${NODE_H}px`,
        background: '#0c1520',
        border: `1px solid ${selected ? '#00e5b8' : isBreaking ? 'rgba(255,87,51,0.3)' : '#1e3048'}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: '10px',
        padding: '10px 12px',
        cursor: 'pointer',
        boxShadow: selected
          ? '0 0 0 1px #00e5b8, 0 0 20px rgba(0,229,184,0.15)'
          : isBreaking
          ? '0 0 12px rgba(255,87,51,0.1)'
          : 'none',
        opacity: dimmed ? 0.3 : 1,
        transition: 'all 0.2s ease',
        userSelect: 'none',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{
          fontFamily: 'Fragment Mono, monospace',
          fontSize: '9px',
          color,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          background: `${color}18`,
          border: `1px solid ${color}35`,
          padding: '1px 5px',
          borderRadius: '3px',
        }}>
          {label}
        </span>
        {severityTier && severityTier !== 'LOW' && (
          <span style={{
            fontFamily: 'Fragment Mono, monospace',
            fontSize: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: severityTier === 'CRITICAL' ? '#ff5733' : '#f87171',
            background: severityTier === 'CRITICAL' ? 'rgba(255,87,51,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${severityTier === 'CRITICAL' ? 'rgba(255,87,51,0.3)' : 'rgba(239,68,68,0.2)'}`,
            padding: '1px 5px',
            borderRadius: '3px',
            animation: severityTier === 'CRITICAL' ? 'pulse-glow 2s ease-in-out infinite' : 'none',
          }}>
            {severityTier}
          </span>
        )}
      </div>

      {/* Name */}
      <div style={{
        fontFamily: 'Fragment Mono, monospace',
        fontSize: '13px',
        fontWeight: '500',
        color: '#e8f0fa',
        marginBottom: '4px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {node.name}
      </div>
      
      {/* Type & File */}
      <div style={{
          fontFamily: 'Fragment Mono, monospace',
          fontSize: '9px',
          color: '#8da4bd',
          marginBottom: '4px',
        }}>
          [{node.type}] {node.file.split('/').pop()}
      </div>

      {/* Preview/Summary */}
      <div style={{
        fontFamily: 'Fragment Mono, monospace',
        fontSize: '10px',
        color: '#4a6888',
        lineHeight: '1.4',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {node.summary || '...'}
      </div>
    </div>
  );
}

const GraphCanvas = () => {
  const { 
    selectedNode, 
    selectNode, 
    graphData, 
  } = useApp();

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const { layoutNodes, layoutEdges, width, height } = useMemo(() => {
    if (!graphData || !graphData.nodes.length) {
      return { layoutNodes: [], layoutEdges: [], width: CANVAS_W, height: CANVAS_H };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 100, marginx: 100, marginy: 100 });
    g.setDefaultEdgeLabel(() => ({}));

    // Filter nodes/edges based on active filters
    // Currently, our graph might be small enough to just render everything, 
    // but applying filters to the Dagre layout ensures a clean graph.
    
    // For simplicity, let's just lay them all out first.
    graphData.nodes.forEach(node => {
      g.setNode(node.id, { width: NODE_W, height: NODE_H });
    });

    graphData.edges.forEach(edge => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    const layoutNodes = graphData.nodes.map(node => {
      const pos = g.node(node.id);
      return {
        ...node,
        x: pos.x - NODE_W / 2,
        y: pos.y - NODE_H / 2
      };
    });

    const layoutEdges = graphData.edges.map(edge => {
      const source = g.node(edge.source);
      const target = g.node(edge.target);
      return {
        ...edge,
        sourcePos: { x: source.x - NODE_W / 2, y: source.y - NODE_H / 2 },
        targetPos: { x: target.x - NODE_W / 2, y: target.y - NODE_H / 2 }
      };
    });

    return { layoutNodes, layoutEdges, width: g.graph().width || CANVAS_W, height: g.graph().height || CANVAS_H };
  }, [graphData]);

  // Determine which nodes are connected to selected
  const isConnected = (nodeId: string) => {
    if (!selectedNode || !graphData) return true;
    if (nodeId === selectedNode) return true;
    return graphData.edges.some(e =>
      (e.source === selectedNode && e.target === nodeId) ||
      (e.target === selectedNode && e.source === nodeId)
    );
  };

  const isEdgeConnected = (source: string, target: string) => {
    if (!selectedNode) return true;
    return source === selectedNode || target === selectedNode;
  };

  if (!graphData || !graphData.nodes.length) {
    return <div className="graph-canvas flex-1 flex items-center justify-center text-slate-500 font-mono">No graph data available. Run analysis first.</div>;
  }

  return (
    <div
      className="graph-canvas flex-1 relative overflow-hidden"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Canvas controls */}
      <div
        className="absolute top-4 left-4 z-20 flex gap-1 p-1.5 rounded-[10px]"
        style={{
          background: 'rgba(7,13,22,0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-2-hex)',
        }}
      >
        {['＋', '−', '⤢', '⛶'].map(icon => (
          <button
            key={icon}
            className="w-8 h-8 flex items-center justify-center rounded-md text-[14px] cursor-pointer hover:bg-[var(--raised-hex)]"
            style={{ color: 'var(--text-2-hex)' }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Draggable SVG Canvas */}
      <div 
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          width: width,
          height: height,
          position: 'absolute',
          transformOrigin: '0 0'
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        >
          <defs>
            <marker id="arrow-critical" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#ff5733" />
            </marker>
            <marker id="arrow-normal" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#2a4060" />
            </marker>
            <marker id="arrow-high" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#f87171" />
            </marker>
            <filter id="glow-critical">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {layoutEdges.map((edge) => {
            const connected = isEdgeConnected(edge.source, edge.target);
            const breakRisk = edge.data?.break_risk || '';
            const isCritical = breakRisk === 'high';
            const isHigh = breakRisk === 'high';
            const showBroken = isCritical || isHigh;
            const edgeInferredBy = edge.data?.inferred_by || '';
            
            let color = '#2a4060';
            if (isCritical) color = '#ff5733';
            else if (isHigh) color = '#f87171';

            return (
              <path
                key={`${edge.source}-${edge.target}`}
                d={getEdgePath(edge.sourcePos, edge.targetPos)}
                stroke={color}
                strokeWidth={showBroken ? 1.5 : 1}
                fill="none"
                className={isCritical ? 'edge-critical' : undefined}
                filter={isCritical ? 'url(#glow-critical)' : undefined}
                strokeDasharray={
                  showBroken ? '10 5' :
                  edgeInferredBy === 'naming' ? '6 3' :
                  edgeInferredBy === 'llm' ? '2 4' : undefined
                }
                opacity={connected ? (showBroken ? 1 : 0.6) : 0.15}
                markerEnd={`url(#arrow-${isCritical ? 'critical' : isHigh ? 'high' : 'normal'})`}
              />
            );
          })}

          {/* Nodes */}
          {layoutNodes.map((node) => {
            const incomingBreak = layoutEdges.find(e => e.target === node.id && (e.data?.break_risk === 'high'));
            const tier = incomingBreak ? 'HIGH' : 'LOW';

            return (
              <foreignObject
                key={node.id}
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H + 20}
                style={{ overflow: 'visible' }}
              >
                <NodeCard
                  node={node}
                  selected={selectedNode === node.id}
                  dimmed={!isConnected(node.id)}
                  onClick={() => selectNode(node.id)}
                  severityTier={tier as any}
                />
              </foreignObject>
            );
          })}
        </svg>
      </div>

      {/* Edge type legend */}
      <div
        className="absolute bottom-4 left-4 z-20 p-4 rounded-[10px] w-[200px]"
        style={{
          background: 'rgba(7,13,22,0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-2-hex)',
        }}
      >
        <div className="font-syne font-semibold text-[10px] tracking-[0.12em] mb-3" style={{ color: 'var(--text-3-hex)' }}>EDGE TYPES</div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <svg width="36" height="2"><line x1="0" y1="1" x2="36" y2="1" stroke="var(--text-2-hex)" strokeWidth="1.5" /></svg>
            <span className="font-mono text-[12px]" style={{ color: 'var(--text-2-hex)' }}>AST Proven</span>
          </div>
          <div className="flex items-center gap-3">
            <svg width="36" height="2"><line x1="0" y1="1" x2="36" y2="1" stroke="var(--text-2-hex)" strokeWidth="1.5" strokeDasharray="6 3" /></svg>
            <span className="font-mono text-[12px]" style={{ color: 'var(--text-2-hex)' }}>Naming Matched</span>
          </div>
          <div className="flex items-center gap-3">
            <svg width="36" height="2"><line x1="0" y1="1" x2="36" y2="1" stroke="var(--text-2-hex)" strokeWidth="1.5" strokeDasharray="2 4" /></svg>
            <span className="font-mono text-[12px]" style={{ color: 'var(--text-2-hex)' }}>LLM Inferred</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GraphCanvas;
