import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { useRef, useEffect } from 'react';

const Terminal = () => {
  const { terminalLines, terminalCollapsed, setTerminalCollapsed } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalLines]);

  return (
    <div className="shrink-0 flex flex-col border-t" style={{
      height: terminalCollapsed ? 32 : 200,
      borderColor: 'var(--border-1-hex)',
      transition: 'height 0.2s ease',
    }}>
      {/* Header */}
      <div className="h-8 shrink-0 flex items-center px-4 gap-2" style={{ background: '#030609' }}>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
        </div>
        <div className="w-px h-4 mx-2" style={{ background: 'var(--border-1-hex)' }} />
        <span className="text-[12px]" style={{ color: 'var(--text-3-hex)' }}>⚙</span>
        <span className="font-syne font-semibold text-[10px] tracking-[0.15em]" style={{ color: 'var(--text-3-hex)' }}>ANALYSIS ENGINE LOG</span>
        <div className="flex-1" />
        <button onClick={() => setTerminalCollapsed(!terminalCollapsed)} className="font-mono text-[11px] cursor-pointer hover:text-text-2" style={{ color: 'var(--text-4-hex)' }}>
          {terminalCollapsed ? '▼ Expand' : '▲ Collapse'}
        </button>
      </div>

      {/* Content */}
      {!terminalCollapsed && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.9]" style={{ background: '#030609' }}>
          {terminalLines.map((line, i) => (
            <motion.div
              key={line.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i < 9 ? i * 0.2 : 0 }}
              className="flex items-start gap-2"
              style={line.type === 'alert' ? {
                background: 'rgba(255,87,51,0.06)',
                borderLeft: '2px solid var(--orange-hex)',
                color: 'var(--orange-hex)',
                paddingLeft: 8,
                marginLeft: -8,
                fontWeight: line.message.includes('SQL→Python→TS→React') ? 600 : undefined,
              } : {}}
            >
              {line.timestamp && (
                <span style={{ color: 'var(--text-4-hex)' }}>[{line.timestamp}]</span>
              )}
              <span
                style={{
                  color: line.type === 'alert' ? 'var(--orange-hex)'
                    : line.type === 'info' ? 'var(--text-2-hex)'
                    : 'var(--text-3-hex)',
                }}
                dangerouslySetInnerHTML={{
                  __html: line.message.replace(
                    'SQL→Python→TS→React',
                    '<span style="font-weight:600;color:#ff5733">SQL→Python→TS→React</span>'
                  )
                }}
              />
            </motion.div>
          ))}
          {/* Blinking cursor */}
          <span className="cursor-blink" style={{ color: 'var(--teal-hex)' }}>█</span>
        </div>
      )}
    </div>
  );
};

export default Terminal;
