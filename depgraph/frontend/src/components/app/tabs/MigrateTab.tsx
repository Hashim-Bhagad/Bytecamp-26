import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { apiClient } from '@/api/client';

type GenState = 'idle' | 'generating' | 'ready';

interface MigrateFile {
  file: string;
  language: string;
  line: number;
  old_code: string;
  new_code: string;
  change_type: string;
}

interface MigratePlan {
  summary: string;
  safe_order: string[];
  files: MigrateFile[];
}

interface ApplyResult {
  file: string;
  status: 'ok' | 'error' | 'not_found';
  detail?: string;
  changes?: number;
}

const LANG_COLOR: Record<string, string> = {
  sql:        '#f59e0b',
  python:     '#a78bfa',
  typescript: '#38bdf8',
  react:      '#34d399',
  javascript: '#fbbf24',
};

const MigrateTab = () => {
  const { selectedNode } = useApp();
  const [newName, setNewName]     = useState('');
  const [genState, setGenState]   = useState<GenState>('idle');
  const [plan, setPlan]           = useState<MigratePlan | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [genError, setGenError]   = useState<string | null>(null);

  // Apply state
  const [applying, setApplying]   = useState(false);
  const [applyResults, setApplyResults] = useState<ApplyResult[] | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);

  // Repo path state
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [repoExists, setRepoExists] = useState(false);
  const [pathOverride, setPathOverride] = useState('');
  const [settingPath, setSettingPath] = useState(false);

  useEffect(() => {
    apiClient.getRepoPath().then(r => {
      setRepoPath(r.repo_path || null);
      setRepoExists(r.exists);
    }).catch(() => {
      // ignore 401 or other errors
    });
  }, []);

  const selectedFileData = plan?.files.find(f => f.file === selectedFile);

  const handleGenerate = async () => {
    if (!selectedNode || !newName.trim()) return;
    setGenState('generating');
    setGenError(null);
    setPlan(null);
    setApplyResults(null);
    setApplyError(null);
    try {
      const result = await apiClient.migrate(selectedNode, newName.trim());
      const p = result as unknown as MigratePlan;
      setPlan(p);
      if (p.files?.length > 0) setSelectedFile(p.files[0].file);
      setGenState('ready');
    } catch (err: any) {
      setGenError(err.message || 'Migration generation failed');
      setGenState('idle');
    }
  };

  const handleDownload = async () => {
    if (!plan) return;
    setDownloading(true);
    try {
      await apiClient.migrateDownload(plan.files);
    } catch (err: any) {
      setApplyError(err.response?.data?.detail || err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleApply = async () => {
    if (!plan) return;
    setApplying(true);
    setApplyResults(null);
    setApplyError(null);
    try {
      const res = await apiClient.migrateApply(plan.files);
      setApplyResults(res.results);
    } catch (err: any) {
      setApplyError(err.response?.data?.detail || err.message || 'Apply failed');
    } finally {
      setApplying(false);
    }
  };

  if (!selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ background: 'var(--surface-hex)', border: '1px solid var(--border-2-hex)' }}>
          ↔
        </div>
        <p className="font-mono text-[12px] text-center" style={{ color: 'var(--text-4-hex)' }}>
          Select a node in the graph<br />to generate a migration plan
        </p>
      </div>
    );
  }

  const applyOk    = applyResults?.filter(r => r.status === 'ok').length ?? 0;
  const applyFail  = applyResults?.filter(r => r.status !== 'ok').length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">

        {/* Repo path status */}
        <div className="p-2.5 rounded-lg space-y-2" style={{ background: 'var(--surface-hex)', border: `1px solid ${repoExists ? 'rgba(0,229,184,0.2)' : 'rgba(255,87,51,0.25)'}` }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px]">{repoExists ? '✓' : '⚠'}</span>
            <span className="font-mono text-[10px] truncate flex-1" style={{ color: repoExists ? 'var(--teal-hex)' : '#ff9980' }}>
              {repoPath ? repoPath : 'No repo path set — run analysis first'}
            </span>
            <button
              onClick={() => setSettingPath(p => !p)}
              className="font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0"
              style={{ borderColor: 'var(--border-1-hex)', color: 'var(--text-3-hex)' }}
            >
              {settingPath ? 'cancel' : 'set path'}
            </button>
          </div>
          {settingPath && (
            <div className="flex gap-2">
              <input
                value={pathOverride}
                onChange={e => setPathOverride(e.target.value)}
                placeholder="C:\path\to\repo or /home/user/repo"
                className="flex-1 bg-transparent outline-none font-mono text-[10px] px-2 py-1 rounded border"
                style={{ borderColor: 'var(--border-2-hex)', color: 'var(--text-1-hex)', background: 'var(--raised-hex)' }}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && pathOverride.trim()) {
                    try {
                      const r = await apiClient.setRepoPath(pathOverride.trim());
                      setRepoPath(r.repo_path); setRepoExists(r.exists); setSettingPath(false); setPathOverride('');
                    } catch (err: any) {
                      // show error inline
                    }
                  }
                }}
              />
              <button
                onClick={async () => {
                  if (!pathOverride.trim()) return;
                  try {
                    const r = await apiClient.setRepoPath(pathOverride.trim());
                    setRepoPath(r.repo_path); setRepoExists(r.exists); setSettingPath(false); setPathOverride('');
                  } catch (err: any) {
                    alert(err.response?.data?.detail || 'Invalid path');
                  }
                }}
                className="font-mono text-[10px] px-2.5 py-1 rounded"
                style={{ background: 'var(--teal-hex)', color: 'var(--void-hex)' }}
              >
                Set
              </button>
            </div>
          )}
        </div>

        {/* Section label */}
        <span className="font-syne font-semibold text-[10px] tracking-[0.14em]" style={{ color: 'var(--text-4-hex)' }}>
          CROSS-LANGUAGE RENAME
        </span>

        {/* Rename form */}
        <div className="p-3 rounded-lg space-y-3" style={{ background: 'var(--surface-hex)', border: '1px solid var(--border-2-hex)' }}>
          <div className="flex items-center gap-2 font-mono text-[12px]">
            <code className="px-2 py-1 rounded-sm truncate max-w-[110px]" style={{ background: 'rgba(255,87,51,0.08)', color: '#ff9980' }}>
              {selectedNode.split('::').pop()}
            </code>
            <motion.span animate={{ x: [0, 3, 0] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--teal-hex)' }}>→</motion.span>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="new_name"
              className="flex-1 bg-transparent outline-none font-mono text-[12px] px-2 py-1 rounded-sm border"
              style={{
                background: 'rgba(0,229,184,0.04)',
                borderColor: newName ? 'var(--teal-hex)' : 'var(--border-2-hex)',
                color: '#5fffd8',
              }}
            />
          </div>
          <motion.button
            whileHover={{ filter: 'brightness(1.1)' }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGenerate}
            disabled={!newName.trim() || genState === 'generating'}
            className="w-full py-2 rounded-md font-syne font-semibold text-[12px] cursor-pointer flex items-center justify-center gap-2"
            style={{
              background: newName.trim() ? 'var(--teal-hex)' : 'var(--border-1-hex)',
              color: newName.trim() ? 'var(--void-hex)' : 'var(--text-4-hex)',
              opacity: genState === 'generating' ? 0.7 : 1,
            }}
          >
            {genState === 'generating' ? (
              <>
                <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--void-hex)', borderTopColor: 'transparent' }} />
                Generating plan...
              </>
            ) : plan ? 'Re-generate Plan' : 'Generate Migration Plan'}
          </motion.button>
        </div>

        {/* Gen error */}
        {genError && (
          <div className="px-3 py-2 rounded-md font-mono text-[11px]" style={{ background: 'rgba(255,87,51,0.08)', color: '#ff9980', border: '1px solid rgba(255,87,51,0.25)' }}>
            {genError}
          </div>
        )}

        {/* Plan */}
        <AnimatePresence>
          {plan && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">

              {/* Summary */}
              <div className="px-3 py-2 rounded-md font-mono text-[11px]" style={{ background: 'var(--surface-hex)', border: '1px solid var(--border-2-hex)', color: 'var(--teal-hex)' }}>
                ✓ {plan.summary}
              </div>

              {/* Safe order */}
              {plan.safe_order?.length > 0 && (
                <div className="space-y-1">
                  <span className="font-syne font-semibold text-[10px] tracking-[0.12em]" style={{ color: 'var(--text-4-hex)' }}>SAFE ORDER</span>
                  {plan.safe_order.map((step, i) => (
                    <div key={i} className="font-mono text-[10px] flex items-start gap-2" style={{ color: 'var(--text-3-hex)' }}>
                      <span style={{ color: 'var(--teal-hex)', minWidth: 14 }}>{i + 1}.</span>
                      {step}
                    </div>
                  ))}
                </div>
              )}

              {/* File tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                {plan.files.map(f => {
                  const fname = f.file.split('/').pop() || f.file;
                  const lc = LANG_COLOR[f.language] || '#4a6888';
                  const result = applyResults?.find(r => r.file === f.file);
                  return (
                    <button
                      key={f.file}
                      onClick={() => setSelectedFile(f.file)}
                      className="font-mono text-[10px] px-2.5 py-1.5 rounded-md whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 relative"
                      style={{
                        background: selectedFile === f.file ? 'var(--raised-hex)' : 'transparent',
                        border: `1px solid ${selectedFile === f.file ? lc : 'var(--border-1-hex)'}`,
                        color: selectedFile === f.file ? 'var(--text-1-hex)' : 'var(--text-3-hex)',
                      }}
                    >
                      <span style={{ color: lc, fontSize: 7 }}>■</span>
                      {fname}
                      {result && (
                        <span style={{ color: result.status === 'ok' ? 'var(--teal-hex)' : '#ff5733', fontSize: 10 }}>
                          {result.status === 'ok' ? '✓' : '✕'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Diff viewer */}
              {selectedFileData && (
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-1-hex)' }}>
                  <div className="px-3 py-1.5 font-mono text-[10px] flex justify-between items-center" style={{ background: 'var(--surface-hex)', color: 'var(--text-3-hex)' }}>
                    <span>
                      {selectedFileData.file}
                      <span style={{ color: 'var(--text-4-hex)' }}>:{selectedFileData.line}</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded-sm" style={{
                      background: `${LANG_COLOR[selectedFileData.language] ?? '#4a6888'}18`,
                      color: LANG_COLOR[selectedFileData.language] ?? '#888',
                      border: `1px solid ${LANG_COLOR[selectedFileData.language] ?? '#4a6888'}30`,
                    }}>
                      {selectedFileData.change_type}
                    </span>
                  </div>
                  <div className="p-3 space-y-2 font-mono text-[11px]" style={{ background: 'var(--base-hex)' }}>
                    <div>
                      <div className="text-[9px] mb-1" style={{ color: 'var(--text-4-hex)' }}>BEFORE</div>
                      <div className="px-2 py-1.5 rounded-sm whitespace-pre-wrap break-all" style={{ background: 'rgba(255,87,51,0.06)', border: '1px solid rgba(255,87,51,0.15)', color: '#ff9980' }}>
                        <span style={{ color: 'rgba(255,87,51,0.5)', marginRight: 6 }}>−</span>
                        {selectedFileData.old_code}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] mb-1" style={{ color: 'var(--text-4-hex)' }}>AFTER</div>
                      <div className="px-2 py-1.5 rounded-sm whitespace-pre-wrap break-all" style={{ background: 'rgba(0,229,184,0.06)', border: '1px solid rgba(0,229,184,0.15)', color: '#5fffd8' }}>
                        <span style={{ color: 'rgba(0,229,184,0.5)', marginRight: 6 }}>+</span>
                        {selectedFileData.new_code}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Apply results */}
              {applyResults && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-syne font-semibold text-[10px] tracking-[0.12em]" style={{ color: 'var(--text-4-hex)' }}>APPLY RESULTS</span>
                    {applyOk > 0 && <span className="font-mono text-[10px]" style={{ color: 'var(--teal-hex)' }}>{applyOk} updated</span>}
                    {applyFail > 0 && <span className="font-mono text-[10px]" style={{ color: '#ff5733' }}>{applyFail} failed</span>}
                  </div>
                  {applyResults.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 font-mono text-[10px] px-2 py-1.5 rounded" style={{
                      background: r.status === 'ok' ? 'rgba(0,229,184,0.05)' : 'rgba(255,87,51,0.05)',
                      border: `1px solid ${r.status === 'ok' ? 'rgba(0,229,184,0.2)' : 'rgba(255,87,51,0.2)'}`,
                    }}>
                      <span style={{ color: r.status === 'ok' ? 'var(--teal-hex)' : '#ff5733', flexShrink: 0 }}>
                        {r.status === 'ok' ? '✓' : '✕'}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate" style={{ color: 'var(--text-2-hex)' }}>{r.file}</div>
                        {r.detail && <div style={{ color: 'var(--text-4-hex)' }}>{r.detail}</div>}
                        {r.changes && <div style={{ color: 'var(--teal-hex)' }}>{r.changes} change{r.changes !== 1 ? 's' : ''} applied</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Apply error */}
              {applyError && (
                <div className="px-3 py-2 rounded-md font-mono text-[11px]" style={{ background: 'rgba(255,87,51,0.08)', color: '#ff9980', border: '1px solid rgba(255,87,51,0.25)' }}>
                  {applyError}
                </div>
              )}

            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action buttons */}
      {plan && plan.files.length > 0 && (
        <div className="p-4 border-t space-y-2" style={{ borderColor: 'var(--border-1-hex)' }}>

          {/* Download ZIP */}
          <motion.button
            whileHover={{ filter: 'brightness(1.08)' }}
            whileTap={{ scale: 0.99 }}
            onClick={handleDownload}
            disabled={downloading || applying}
            className="w-full py-2.5 rounded-lg font-syne font-semibold text-[12px] cursor-pointer flex items-center justify-center gap-2 border"
            style={{
              background: 'transparent',
              borderColor: 'var(--teal-hex)',
              color: 'var(--teal-hex)',
              opacity: downloading ? 0.7 : 1,
            }}
          >
            {downloading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--teal-hex)', borderTopColor: 'transparent' }} />
                Building ZIP...
              </>
            ) : (
              <>
                ↓ Download {plan.files.length} Modified File{plan.files.length !== 1 ? 's' : ''} (.zip)
              </>
            )}
          </motion.button>

          {/* Apply to disk */}
          {!applyResults ? (
            <motion.button
              whileHover={{ filter: 'brightness(1.1)', boxShadow: '0 0 20px rgba(0,229,184,0.12)' }}
              whileTap={{ scale: 0.99 }}
              onClick={handleApply}
              disabled={applying || downloading}
              className="w-full py-2.5 rounded-lg font-syne font-semibold text-[12px] cursor-pointer flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, var(--teal-hex) 0%, var(--teal-2-hex) 100%)',
                color: 'var(--void-hex)',
                opacity: applying ? 0.7 : 1,
              }}
            >
              {applying ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--void-hex)', borderTopColor: 'transparent' }} />
                  Writing files...
                </>
              ) : `⚡ Apply to Disk (${plan.files.length} file${plan.files.length !== 1 ? 's' : ''})`}
            </motion.button>
          ) : (
            <div className="w-full py-2.5 rounded-lg font-syne font-semibold text-[12px] text-center" style={{
              background: applyFail === 0 ? 'rgba(0,229,184,0.08)' : 'rgba(255,87,51,0.08)',
              color: applyFail === 0 ? 'var(--teal-hex)' : '#ff9980',
              border: `1px solid ${applyFail === 0 ? 'var(--teal-hex)' : 'rgba(255,87,51,0.4)'}`,
            }}>
              {applyFail === 0
                ? `✓ All ${applyOk} files updated successfully`
                : `${applyOk} updated · ${applyFail} failed — see details above`}
            </div>
          )}

          <p className="font-mono text-[9px] text-center" style={{ color: 'var(--text-4-hex)' }}>
            "Apply to Disk" writes directly to your repository · use ZIP for a safe preview first
          </p>
        </div>
      )}
    </div>
  );
};

export default MigrateTab;
