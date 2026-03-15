import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import apiClient from '@/api/client';

interface UserStatus {
  has_graph: boolean;
  repo_path: string;
  node_count: number;
  edge_count: number;
  repo_name: string;
}

const SetupPage = () => {
  const { username } = useAuth();
  const { startAnalysisStream, analysisRunning, analysisComplete, terminalLines } = useApp();
  const navigate = useNavigate();

  const [status, setStatus] = useState<UserStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [repoUrl, setRepoUrl] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    apiClient.getUserStatus()
      .then(s => { setStatus(s); setStatusLoading(false); })
      .catch(() => setStatusLoading(false));
  }, []);

  // Auto-navigate to /app when analysis finishes
  useEffect(() => {
    if (started && analysisComplete) {
      navigate('/app');
    }
  }, [started, analysisComplete, navigate]);

  const handleAnalyze = () => {
    if (!repoUrl.trim()) return;
    setStarted(true);
    startAnalysisStream(repoUrl.trim());
  };

  const lastLog = terminalLines[terminalLines.length - 1];

  // ── Analysis in progress screen ──
  if (started || analysisRunning) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8"
        style={{ background: 'var(--void-hex)' }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0,229,184,0.04) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-lg w-full px-6">
          {/* Animated logo */}
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl"
            style={{ background: 'var(--teal-hex)', color: 'var(--void-hex)' }}
          >
            DG
          </motion.div>

          <div className="text-center">
            <div className="font-syne font-bold text-2xl mb-2" style={{ color: 'var(--text-1-hex)' }}>
              Analyzing Repository
            </div>
            <p className="font-mono text-xs" style={{ color: 'var(--text-4-hex)' }}>
              Building your cross-language dependency graph
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map(i => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ background: 'var(--teal-hex)' }}
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>

          {/* Pipeline stages */}
          <div className="w-full space-y-1">
            {[
              { label: 'AST Parsing', desc: 'SQL · Python · TypeScript' },
              { label: 'Structural Edges', desc: 'ORM · Imports · Interfaces' },
              { label: 'LLM Boundary Resolution', desc: 'Semantic cross-language links' },
              { label: 'Knowledge Graph', desc: 'NetworkX + severity scoring' },
            ].map((stage, i) => (
              <motion.div
                key={stage.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
                style={{ background: 'var(--surface-hex)', border: '1px solid var(--border-1-hex)' }}
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--teal-hex)' }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                />
                <div>
                  <div className="font-syne font-semibold text-xs" style={{ color: 'var(--text-2-hex)' }}>
                    {stage.label}
                  </div>
                  <div className="font-mono text-[10px]" style={{ color: 'var(--text-4-hex)' }}>
                    {stage.desc}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Latest log line */}
          <AnimatePresence mode="wait">
            {lastLog && (
              <motion.div
                key={lastLog.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="w-full px-4 py-2.5 rounded-lg font-mono text-xs"
                style={{
                  background: 'var(--raised-hex)',
                  border: '1px solid var(--border-1-hex)',
                  color: lastLog.type === 'error' ? '#ff5733' : 'var(--teal-hex)',
                }}
              >
                <span style={{ color: 'var(--text-4-hex)', marginRight: 8 }}>›</span>
                {lastLog.message}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── Setup screen ──
  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--void-hex)' }}>
        <span className="font-mono text-xs" style={{ color: 'var(--text-4-hex)' }}>Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--void-hex)' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,229,184,0.05) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg relative z-10"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm"
              style={{ background: 'var(--teal-hex)', color: 'var(--void-hex)' }}>
              DG
            </div>
            <span className="font-syne font-bold text-xl" style={{ color: 'var(--text-1-hex)' }}>
              DepGraph.ai
            </span>
          </div>
          <p className="font-mono text-xs" style={{ color: 'var(--text-3-hex)' }}>
            Welcome, <span style={{ color: 'var(--teal-hex)' }}>{username}</span>
          </p>
        </div>

        {/* Existing analysis card */}
        {status?.has_graph && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl p-5 border mb-4"
            style={{ background: 'var(--surface-hex)', borderColor: 'rgba(0,229,184,0.25)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base"
                  style={{ background: 'rgba(0,229,184,0.08)', border: '1px solid rgba(0,229,184,0.2)' }}>
                  📊
                </div>
                <div>
                  <div className="font-syne font-semibold text-sm" style={{ color: 'var(--text-1-hex)' }}>
                    {status.repo_name || 'Previous Analysis'}
                  </div>
                  <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-4-hex)' }}>
                    {status.node_count.toLocaleString()} nodes · {status.edge_count.toLocaleString()} edges
                  </div>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/app')}
                className="px-4 py-2 rounded-lg font-syne font-semibold text-xs cursor-pointer"
                style={{ background: 'var(--teal-hex)', color: 'var(--void-hex)' }}
              >
                Resume →
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* New repo card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border"
          style={{ background: 'var(--surface-hex)', borderColor: 'var(--border-2-hex)' }}
        >
          {/* Card header */}
          <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--border-1-hex)' }}>
            <h2 className="font-syne font-semibold text-base mb-1" style={{ color: 'var(--text-1-hex)' }}>
              {status?.has_graph ? 'Analyze a new repository' : 'Connect your repository'}
            </h2>
            <p className="font-mono text-[11px]" style={{ color: 'var(--text-4-hex)' }}>
              Paste a local path or GitHub URL — we trace every dependency across SQL → Python → TypeScript.
            </p>
          </div>

          {/* Input section */}
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block font-mono text-xs mb-2" style={{ color: 'var(--text-3-hex)' }}>
                Repository path / GitHub URL
              </label>
              <input
                type="text"
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                autoFocus
                placeholder="C:/Projects/my-app  ·  https://github.com/org/repo"
                className="w-full px-3 py-2.5 rounded-lg border outline-none font-mono text-xs transition-all"
                style={{
                  background: 'var(--raised-hex)',
                  borderColor: 'var(--border-1-hex)',
                  color: 'var(--text-1-hex)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--teal-hex)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-1-hex)')}
                onKeyDown={e => { if (e.key === 'Enter' && repoUrl.trim()) handleAnalyze(); }}
              />
            </div>

            {/* What gets analyzed */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: '🗄️', label: 'SQL schemas', sub: 'Tables, columns, relationships' },
                { icon: '🐍', label: 'Python / Django', sub: 'Models, views, serializers' },
                { icon: '⚡', label: 'TypeScript / React', sub: 'Interfaces, components, hooks' },
                { icon: '🔗', label: 'Cross-lang edges', sub: 'ORM maps, API contracts' },
              ].map(item => (
                <div key={item.label} className="px-3 py-2.5 rounded-lg"
                  style={{ background: 'var(--raised-hex)', border: '1px solid var(--border-1-hex)' }}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm">{item.icon}</span>
                    <span className="font-syne font-semibold text-[10px]" style={{ color: 'var(--text-2-hex)' }}>
                      {item.label}
                    </span>
                  </div>
                  <div className="font-mono text-[9px]" style={{ color: 'var(--text-4-hex)' }}>
                    {item.sub}
                  </div>
                </div>
              ))}
            </div>

            <motion.button
              onClick={handleAnalyze}
              disabled={!repoUrl.trim()}
              whileHover={repoUrl.trim() ? { scale: 1.01 } : {}}
              whileTap={repoUrl.trim() ? { scale: 0.99 } : {}}
              className="w-full py-3 rounded-lg font-syne font-semibold text-sm transition-all"
              style={{
                background: repoUrl.trim()
                  ? 'linear-gradient(135deg, var(--teal-hex) 0%, var(--teal-2-hex) 100%)'
                  : 'var(--border-1-hex)',
                color: 'var(--void-hex)',
                cursor: repoUrl.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Start Analysis →
            </motion.button>
          </div>
        </motion.div>

        {/* Skip */}
        {status?.has_graph && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center mt-4 font-mono text-[10px] cursor-pointer"
            style={{ color: 'var(--text-4-hex)' }}
            onClick={() => navigate('/app')}
          >
            Go to dashboard without analyzing →
          </motion.p>
        )}
      </motion.div>
    </div>
  );
};

export default SetupPage;
