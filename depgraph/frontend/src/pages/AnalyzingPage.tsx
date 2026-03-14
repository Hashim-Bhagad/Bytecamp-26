import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';

const LAYERS = ['AST', 'Graph', 'Boundary', 'LLM', 'Knowledge', 'Query'];

const AnalyzingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { analysisComplete, terminalLines, startAnalysisStream } = useApp();
  const [activeLayer, setActiveLayer] = useState(0);
  
  // Extract repo URL from state or default to current directory
  const repoUrl = location.state?.repoUrl || '.';

  useEffect(() => {
    // Start the real analysis stream if it's not already running/complete
    startAnalysisStream(repoUrl);
  }, [repoUrl, startAnalysisStream]);

  useEffect(() => {
    // Determine active layer based on terminal logs (heuristically)
    const lastLine = terminalLines.length > 0 ? terminalLines[terminalLines.length - 1].message.toLowerCase() : '';
    
    if (lastLine.includes('ast')) setActiveLayer(0);
    else if (lastLine.includes('structural') || lastLine.includes('graph')) setActiveLayer(1);
    else if (lastLine.includes('boundary')) setActiveLayer(2);
    else if (lastLine.includes('semantic') || lastLine.includes('llm')) setActiveLayer(3);
    else if (lastLine.includes('knowledge')) setActiveLayer(4);
    else if (lastLine.includes('query') || lastLine.includes('complete')) setActiveLayer(5);
  }, [terminalLines]);

  useEffect(() => {
    if (analysisComplete) {
      const t = setTimeout(() => navigate('/app'), 1000);
      return () => clearTimeout(t);
    }
  }, [analysisComplete, navigate]);

  // Calculate progress based on terminal lines (estimate)
  const progress = Math.min(terminalLines.length / 40, 0.95) + (analysisComplete ? 0.05 : 0);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8" style={{
      background: 'var(--void-hex)',
      backgroundImage: 'radial-gradient(circle, rgba(0,229,184,0.06) 1px, transparent 1px)',
      backgroundSize: '32px 32px',
    }}>
      {/* Pipeline */}
      <div className="flex items-center gap-2">
        {LAYERS.map((layer, i) => (
          <div key={layer} className="flex items-center gap-2">
            <motion.div
              className="w-20 h-12 flex items-center justify-center rounded-lg font-syne font-semibold text-[10px] tracking-wider"
              style={{
                background: i < activeLayer ? 'rgba(0,229,184,0.08)' : 'var(--surface-hex)',
                border: `1px solid ${i <= activeLayer ? 'var(--teal-hex)' : 'var(--border-2-hex)'}`,
                color: i <= activeLayer ? 'var(--teal-hex)' : 'var(--text-3-hex)',
                boxShadow: i === activeLayer ? '0 0 16px rgba(0,229,184,0.15)' : 'none',
              }}
              animate={i === activeLayer ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              {i < activeLayer ? '✓' : layer}
            </motion.div>
            {i < LAYERS.length - 1 && (
              <div className="flex gap-1">
                {[0, 1, 2].map(d => (
                  <motion.div
                    key={d}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: i < activeLayer ? 'var(--teal-hex)' : 'var(--border-2-hex)' }}
                    animate={i === activeLayer ? { x: [0, 8, 0], opacity: [0.3, 1, 0.3] } : {}}
                    transition={{ duration: 0.8, repeat: Infinity, delay: d * 0.2 }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Text */}
      <div className="text-center space-y-2 min-h-[4rem]">
        <div className="font-mono text-[13px]" style={{ color: 'var(--text-2-hex)' }}>
          {analysisComplete ? 'Analysis Finished' : 'Processing Repository...'}
        </div>
        <div className="font-mono text-[12px]" style={{ color: 'var(--teal-hex)' }}>
          {terminalLines.length > 0 ? `→ ${terminalLines[terminalLines.length - 1].message}` : 'Establishing connection...'}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-80 h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--border-1-hex)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--teal-hex)', width: `${progress * 100}%` }}
        />
      </div>

      {/* Repo */}
      <div className="font-mono text-[12px]" style={{ color: 'var(--text-3-hex)' }}>
        Analyzing: <span style={{ color: 'var(--teal-hex)' }}>{repoUrl}</span>
      </div>

      {/* Logs Preview */}
      <div className="w-full max-w-2xl h-32 overflow-y-auto p-4 rounded-md border font-mono text-[11px]" style={{
          background: 'rgba(0,0,0,0.3)',
          borderColor: 'var(--border-1-hex)',
          color: 'var(--text-4-hex)'
      }}>
          {terminalLines.slice(-5).map(line => (
              <div key={line.id}>[{new Date().toLocaleTimeString()}] {line.message}</div>
          ))}
      </div>
    </div>
  );
};

export default AnalyzingPage;
