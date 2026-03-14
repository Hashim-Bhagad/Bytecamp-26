import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import apiClient from '@/api/client';

type ApplyState = 'idle' | 'applying' | 'done';

const MigrateTab = () => {
  const { selectedDiffFile, setSelectedDiffFile, impactData, selectedNode } = useApp();
  const [applyState, setApplyState] = useState<ApplyState>('idle');
  const [diffContent, setDiffContent] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Get list of files from impactData
  const files = impactData?.affected_nodes?.map((n: any) => n.node_id) || [];

  useEffect(() => {
    let active = true;
    if (selectedDiffFile) {
      setLoading(true);
      apiClient.getRefactor(selectedDiffFile)
        .then((data: any) => {
          if (active) setDiffContent(data);
        })
        .catch(err => {
          console.error('Failed to load refactor diff:', err);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => { active = false; };
  }, [selectedDiffFile]);

  const handleApply = async () => {
    setApplyState('applying');
    try {
      // In a real scenario, we'd call an API to apply changes to the filesystem
      // For this prototype, we simulate the success
      await new Promise(r => setTimeout(r, 1500));
      setApplyState('done');
    } catch (err) {
      console.error('Failed to apply refactor:', err);
      setApplyState('idle');
    }
  };

  useEffect(() => {
    if (applyState === 'done') {
      const t = setTimeout(() => setApplyState('idle'), 3000);
      return () => clearTimeout(t);
    }
  }, [applyState]);

  if (!selectedNode) {
    return (
      <div className="p-8 text-center">
        <div className="font-mono text-[12px]" style={{ color: 'var(--text-4-hex)' }}>Select a node in the graph to start refactoring</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-syne font-semibold text-[11px] tracking-[0.12em]" style={{ color: 'var(--text-3-hex)' }}>REFACTOR PLAN</span>
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-4-hex)' }}>{files.length} files affected</span>
        </div>

        {/* Action preview */}
        <div className="p-3 rounded-lg flex flex-col items-center gap-2" style={{
          background: 'var(--surface-hex)', border: '1px solid var(--border-2-hex)'
        }}>
          <div className="flex items-center gap-3 font-mono text-[13px]">
            <code className="px-2 py-0.5 rounded-sm" style={{ background: 'rgba(255,87,51,0.08)', color: '#ff9980' }}>{selectedNode}</code>
            <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--teal-hex)' }}>→</motion.span>
            <code className="px-2 py-0.5 rounded-sm" style={{ background: 'rgba(0,229,184,0.08)', color: '#5fffd8' }}>REFAC_DONE</code>
          </div>
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-3-hex)' }}>Automated patches generated for downstream dependencies</span>
        </div>

        {/* File tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {files.map((f: string) => (
            <button
              key={f}
              onClick={() => setSelectedDiffFile(f)}
              className="font-mono text-[11px] px-3 py-1.5 rounded-md whitespace-nowrap flex items-center gap-1 cursor-pointer"
              style={{
                background: selectedDiffFile === f ? 'var(--raised-hex)' : 'transparent',
                border: selectedDiffFile === f ? '1px solid var(--teal-hex)' : '1px solid var(--border-1-hex)',
                color: selectedDiffFile === f ? 'var(--text-1-hex)' : 'var(--text-3-hex)',
              }}
            >
              {f}
              {selectedDiffFile === f && <span className="w-1 h-1 rounded-full" style={{ background: 'var(--teal-hex)' }} />}
            </button>
          ))}
        </div>

        {/* Diff viewer */}
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4">
             <div className="w-6 h-6 border-2 border-teal-hex border-t-transparent rounded-full animate-spin" />
             <span className="font-mono text-[11px]" style={{ color: 'var(--text-4-hex)' }}>Generating Patch...</span>
          </div>
        ) : diffContent ? (
          <div className="grid grid-cols-1 gap-px rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-1-hex)', background: 'var(--border-1-hex)' }}>
            <div className="px-3 py-1.5 font-mono text-[11px] flex justify-between" style={{ background: 'var(--surface-hex)', color: 'var(--text-3-hex)' }}>
               <span>{selectedDiffFile}</span>
               <span style={{ color: 'var(--teal-hex)' }}>PATCH GENERATED</span>
            </div>
            
            <div className="bg-base-hex p-0 font-mono text-[12px] overflow-x-auto">
               {diffContent.explanation && (
                 <div className="p-3 border-b italic shrink-0" style={{ borderColor: 'var(--border-1-hex)', color: 'var(--text-4-hex)' }}>
                   {diffContent.explanation}
                 </div>
               )}
               <pre className="p-3 text-[12px] leading-relaxed shrink-0" style={{ color: 'var(--text-2-hex)' }}>
                 {diffContent.diff}
               </pre>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center font-mono text-[12px]" style={{ color: 'var(--text-3-hex)' }}>
            {files.length > 0 ? 'Select a file to view automated patch' : 'No breaking changes detected to refactor.'}
          </div>
        )}
      </div>

      {/* Apply button */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-1-hex)' }}>
        <motion.button
          whileHover={{ filter: 'brightness(1.1)', boxShadow: '0 0 24px rgba(0,229,184,0.15)' }}
          whileTap={{ scale: 0.99 }}
          onClick={handleApply}
          disabled={applyState !== 'idle' || !selectedDiffFile}
          className="w-full py-3.5 rounded-lg font-syne font-semibold text-[14px] cursor-pointer"
          style={{
            background: applyState === 'done'
              ? 'rgba(0,229,184,0.08)'
              : 'linear-gradient(135deg, var(--teal-hex) 0%, var(--teal-2-hex) 100%)',
            color: applyState === 'done' ? 'var(--teal-hex)' : 'var(--void-hex)',
            border: applyState === 'done' ? '1px solid var(--teal-hex)' : 'none',
          }}
        >
          {applyState === 'idle' && `Apply Patches to ${files.length} Files`}
          {applyState === 'applying' && (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--void-hex)', borderTopColor: 'transparent' }} />
              Updating Filesystem...
            </span>
          )}
          {applyState === 'done' && `✓ Applied — ${files.length} files updated`}
        </motion.button>
      </div>
    </div>
  );
};

export default MigrateTab;
