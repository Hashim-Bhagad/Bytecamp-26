import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { apiClient, GraphData, ImpactResult } from '@/api/client';

export interface TerminalLine {
  id: string;
  type: 'info' | 'error' | 'success' | 'warning' | 'normal';
  timestamp?: string;
  message: string;
}

interface AppState {
  selectedNode: string | null;
  activeTab: 'impact' | 'chat' | 'migrate';
  analysisRunning: boolean;
  analysisComplete: boolean;
  filterBreakingOnly: boolean;
  filterHideLowConf: boolean;
  terminalLines: TerminalLine[];
  terminalCollapsed: boolean;
  graphData: GraphData | null;
  graphLoading: boolean;
  graphError: string | null;
  impactData: ImpactResult | null;
  impactLoading: boolean;
  selectedDiffFile: string | null;
}

interface AppContextType extends AppState {
  setSelectedNode: (node: string | null) => void;
  setActiveTab: (tab: 'impact' | 'chat' | 'migrate') => void;
  setAnalysisRunning: (v: boolean) => void;
  setAnalysisComplete: (v: boolean) => void;
  setFilterBreakingOnly: (v: boolean) => void;
  setFilterHideLowConf: (v: boolean) => void;
  setTerminalCollapsed: (v: boolean) => void;
  addTerminalLine: (line: TerminalLine) => void;
  selectNode: (nodeId: string | null) => void;
  loadGraphData: () => Promise<void>;
  startAnalysisStream: (repoUrl: string) => Promise<void>;
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  loadImpactData: (nodeId: string) => Promise<void>;
  setSelectedDiffFile: (file: string | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'impact' | 'chat' | 'migrate'>('chat');
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [filterBreakingOnly, setFilterBreakingOnly] = useState(false);
  const [filterHideLowConf, setFilterHideLowConf] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const [repoUrl, setRepoUrl] = useState<string>('');
  
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const [impactData, setImpactData] = useState<any | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const addTerminalLine = useCallback((line: TerminalLine) => {
    setTerminalLines(prev => [...prev, line]);
  }, []);

  const loadGraphData = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const data = await apiClient.getGraph();
      setGraphData(data);
    } catch (err: any) {
      setGraphError(err.message || 'Failed to load graph');
    } finally {
      setGraphLoading(false);
    }
  }, []);

  const loadImpactData = useCallback(async (nodeId: string) => {
    setImpactLoading(true);
    try {
      const data = await apiClient.getImpact(nodeId);
      setImpactData(data);
      if (data.chain && data.chain.length > 0) {
        setSelectedDiffFile(data.chain[0].node.id);
      }
    } catch (err: any) {
      console.error('Failed to load impact data:', err);
      // Toast error is handled by apiClient interceptor
    } finally {
      setImpactLoading(false);
    }
  }, []);

  const startAnalysisStream = useCallback(async (repoUrl: string) => {
    setAnalysisRunning(true);
    setAnalysisComplete(false);
    setTerminalLines([]);
    setRepoUrl(repoUrl);

    if (wsRef.current) wsRef.current.close();
    
    const ws = new WebSocket(`ws://localhost:8000/ws/progress`);
    wsRef.current = ws;

    ws.onopen = () => {
      addTerminalLine({ id: Date.now().toString(), type: 'info', timestamp: new Date().toLocaleTimeString(), message: 'WebSocket Connected. Starting analysis...' });
      apiClient.analyzeRepo(repoUrl).catch(e => {
        addTerminalLine({ id: Date.now().toString(), type: 'error', timestamp: new Date().toLocaleTimeString(), message: `Failed to trigger analysis: ${e.message}` });
        setAnalysisRunning(false);
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Ignore heartbeat pings from the server
        if (data.type === 'ping') return;
        if (data.type === 'progress') {
           addTerminalLine({ 
             id: Date.now().toString() + Math.random(), 
             type: data.is_error ? 'error' : 'normal', 
             timestamp: new Date().toLocaleTimeString(), 
             message: data.message 
           });
           if (data.progress >= 1.0) {
             setAnalysisRunning(false);
             setAnalysisComplete(true);
             ws.close();
             loadGraphData();
           }
        }
      } catch (e) {
        addTerminalLine({ id: Date.now().toString(), type: 'normal', message: event.data });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket Error', error);
      addTerminalLine({ 
        id: Date.now().toString(), 
        type: 'error', 
        timestamp: new Date().toLocaleTimeString(), 
        message: '⚠ WebSocket connection error. Analysis may still be running on the server.' 
      });
    };

    ws.onclose = (event) => {
      // If we closed cleanly (code 1000) or we called ws.close() ourselves, do nothing
      if (event.wasClean) return;
      // Unexpected drop — the server may have restarted or timed out
      setAnalysisRunning(false);
      addTerminalLine({ 
        id: Date.now().toString(), 
        type: 'error', 
        timestamp: new Date().toLocaleTimeString(), 
        message: `✖ WebSocket disconnected unexpectedly (code ${event.code}). The backend may have restarted — try running the analysis again.` 
      });
    };

  }, [addTerminalLine, loadGraphData]);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNode(nodeId);
    if (nodeId) {
      addTerminalLine({ id: `sel-${Date.now()}`, type: 'info', timestamp: new Date().toLocaleTimeString(), message: `→ Selected node: ${nodeId}` });
      loadImpactData(nodeId);
      setActiveTab('impact');
    }
  }, [addTerminalLine, loadImpactData]);

  useEffect(() => {
    loadGraphData().then(() => {
      setAnalysisComplete(true);
    });
  }, [loadGraphData]);

  return (
    <AppContext.Provider value={{
      selectedNode, setSelectedNode, activeTab, setActiveTab,
      analysisRunning, setAnalysisRunning, analysisComplete, setAnalysisComplete,
      filterBreakingOnly, setFilterBreakingOnly, filterHideLowConf, setFilterHideLowConf,
      terminalLines,
      terminalCollapsed, setTerminalCollapsed, addTerminalLine, selectNode,
      graphData, graphLoading, graphError, loadGraphData, startAnalysisStream,
      repoUrl, setRepoUrl, impactData, impactLoading, loadImpactData,
      selectedDiffFile, setSelectedDiffFile
    }}>
      {children}
    </AppContext.Provider>
  );
};
