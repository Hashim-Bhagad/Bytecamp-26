import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import apiClient from '@/api/client';

const LANG_PILL_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  SQL: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  PY: { bg: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: 'rgba(167,139,250,0.3)' },
  TS: { bg: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: 'rgba(56,189,248,0.3)' },
  JS: { bg: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: 'rgba(56,189,248,0.3)' },
  RX: { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.3)' },
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isError?: boolean;
}

const LangPill = ({ lang }: { lang: string }) => {
  const s = LANG_PILL_STYLES[lang] || LANG_PILL_STYLES['TS'];
  return (
    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm inline-block" style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`
    }}>{lang}</span>
  );
};

const ChatTab = () => {
  const { setActiveTab, selectedNode } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: 'I have successfully indexed the repository. Select any node and ask me about its implementation or blast radius.', 
      timestamp: new Date().toLocaleTimeString() 
    }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const query = input.trim();
    const userMsg: Message = { role: 'user', content: query, timestamp: new Date().toLocaleTimeString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await apiClient.chat(selectedNode || 'global', query);
      const aiMsg: Message = { 
        role: 'assistant', 
        content: response.answer, 
        timestamp: new Date().toLocaleTimeString() 
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${err.message || 'Failed to get response'}`, 
        timestamp: new Date().toLocaleTimeString(),
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'Explain this module?',
    'What are the dependencies?',
    'Show me where this is used',
  ];

  return (
    <div className="flex flex-col h-full bg-void-hex">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--border-1-hex)' }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--teal-hex)' }} />
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-3-hex)' }}>Graph RAG Active</span>
        </div>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-4-hex)' }}>{selectedNode ? `Node: ${selectedNode}` : 'Global Context'}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex items-center gap-2 mb-1">
                <span style={{ color: 'var(--teal-hex)' }}>⚡</span>
                <span className="font-syne font-semibold text-[11px]" style={{ color: 'var(--teal-hex)' }}>DepGraph.ai</span>
              </div>
            )}
            <div className={`px-3.5 py-2.5 rounded-xl max-w-[95%] ${msg.role === 'user' ? 'rounded-br-sm' : 'rounded-tl-sm'}`} style={{
              background: msg.role === 'user' ? 'var(--raised-hex)' : 'var(--surface-hex)', 
              border: `1px solid ${msg.isError ? 'rgba(255,87,51,0.3)' : 'var(--border-2-hex)'}`
            }}>
              <span className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: msg.isError ? 'var(--orange-hex)' : 'var(--text-1-hex)' }}>
                {msg.content}
              </span>
            </div>
            <span className="font-mono text-[9px] mt-1" style={{ color: 'var(--text-4-hex)' }}>{msg.timestamp}</span>
          </div>
        ))}
        {loading && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: 'var(--teal-hex)' }}>⚡</span>
              <span className="font-syne font-semibold text-[11px]" style={{ color: 'var(--teal-hex)' }}>Thinking...</span>
            </div>
            <div className="px-4 py-3 rounded-xl rounded-tl-sm w-32" style={{ background: 'var(--surface-hex)', border: '1px solid var(--border-2-hex)' }}>
              <div className="flex gap-1 justify-center">
                {[0, 1, 2].map(d => (
                  <motion.div
                    key={d}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: d * 0.1 }}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--teal-hex)' }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {!loading && messages.length < 3 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {suggestions.map(s => (
            <button
              key={s}
              className="font-mono text-[10px] px-2.5 py-1 rounded-full cursor-pointer hover:border-teal-hex hover:text-teal-hex transition-colors"
              style={{ background: 'var(--surface-hex)', border: '1px solid var(--border-1-hex)', color: 'var(--text-3-hex)' }}
              onClick={() => { setInput(s); }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3" style={{ borderColor: 'var(--border-1-hex)', background: 'var(--base-hex)' }}>
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border transition-all duration-150 focus-within:shadow-[0_0_0_2px_rgba(0,229,184,0.08)]" style={{
          background: 'var(--surface-hex)', borderColor: 'var(--border-2-hex)'
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={selectedNode ? `Ask about ${selectedNode}...` : "Ask about dependencies..."}
            className="flex-1 bg-transparent outline-none font-mono text-[13px]"
            style={{ color: 'var(--text-1-hex)' }}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-8 h-8 flex items-center justify-center rounded-md text-[14px] cursor-pointer"
            style={{
              background: input ? 'var(--teal-hex)' : 'var(--border-1-hex)',
              color: 'var(--void-hex)',
              opacity: input ? 1 : 0.5,
            }}
          >
            ↗
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default ChatTab;
