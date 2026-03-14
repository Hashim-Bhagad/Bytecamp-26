import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const ease = [0.22, 1, 0.36, 1];

const LandingPage = () => {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const [repoPath, setRepoPath] = useState('');

  const handleEnter = () => {
    setExiting(true);
    setTimeout(() => navigate('/analyzing', { state: { repoUrl: repoPath || '.' } }), 600);
  };

  return (
    <motion.div
      className="relative min-h-screen overflow-hidden flex items-center justify-center"
      style={{ background: 'var(--void-hex)' }}
      animate={exiting ? { opacity: 0, filter: 'blur(12px)' } : {}}
      transition={{ duration: 0.5 }}
    >
      {/* Dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,229,184,0.06) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Floating orbs */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,229,184,0.04), transparent 70%)', top: '10%', left: '20%' }}
        animate={{ x: [0, 30, -20, 0], y: [0, -20, 15, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.03), transparent 70%)', bottom: '10%', right: '15%' }}
        animate={{ x: [0, -25, 20, 0], y: [0, 15, -25, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      />

      {/* Background ghost graph */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.12]" viewBox="0 0 1000 600">
        <motion.circle cx="200" cy="300" r="4" fill="#00e5b8" animate={{ cx: [200, 204, 198, 200], cy: [300, 296, 304, 300] }} transition={{ duration: 8, repeat: Infinity }} />
        <motion.circle cx="350" cy="250" r="3" fill="#a78bfa" animate={{ cx: [350, 346, 354, 350] }} transition={{ duration: 8, repeat: Infinity }} />
        <motion.circle cx="500" cy="320" r="4" fill="#38bdf8" animate={{ cy: [320, 316, 324, 320] }} transition={{ duration: 8, repeat: Infinity }} />
        <motion.circle cx="650" cy="280" r="3" fill="#34d399" animate={{ cx: [650, 654, 648, 650] }} transition={{ duration: 8, repeat: Infinity }} />
        <motion.circle cx="800" cy="200" r="3" fill="#34d399" animate={{ cy: [200, 204, 196, 200] }} transition={{ duration: 8, repeat: Infinity }} />
        <motion.path d="M204 300 C270 300, 280 250, 347 250" stroke="#ff5733" strokeWidth="1.5" fill="none" strokeDasharray="6 4" 
          animate={{ strokeDashoffset: [0, -20] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />
        <motion.path d="M353 250 C420 250, 430 320, 496 320" stroke="#ff5733" strokeWidth="1.5" fill="none" strokeDasharray="6 4"
          animate={{ strokeDashoffset: [0, -20] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />
        <motion.path d="M504 320 C570 320, 580 280, 647 280" stroke="#ff5733" strokeWidth="1.5" fill="none" strokeDasharray="6 4"
          animate={{ strokeDashoffset: [0, -20] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />
        <motion.path d="M653 280 C720 280, 730 200, 797 200" stroke="#ff5733" strokeWidth="1" fill="none" strokeDasharray="6 4"
          animate={{ strokeDashoffset: [0, -20] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />
      </svg>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Lightning bolt */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease }}
          className="text-5xl"
          style={{ color: 'var(--teal-hex)' }}
        >
          ⚡
        </motion.div>

        {/* Wordmark */}
        <motion.h1
          initial={{ opacity: 0, filter: 'blur(12px)', y: 20 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease }}
          className="font-syne font-[800] text-7xl"
          style={{ color: 'var(--text-1-hex)' }}
        >
          DepGraph.ai
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, filter: 'blur(12px)', y: 10 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease }}
          className="font-serif italic text-[22px]"
          style={{ color: 'var(--text-2-hex)' }}
        >
          The first AI that sees across language boundaries.
        </motion.p>

        {/* Stats pills */}
        <motion.div
          className="flex gap-3 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          {['1,402 nodes analyzed', '6 breaking changes found', '94.2% confidence'].map((stat, i) => (
            <motion.div
              key={stat}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 + i * 0.1, ease }}
              className="px-4 py-2 rounded-md font-syne font-medium text-[13px]"
              style={{
                background: 'var(--surface-hex)',
                border: '1px solid var(--border-2-hex)',
                color: 'var(--text-2-hex)',
              }}
            >
              {stat}
            </motion.div>
          ))}
        </motion.div>

        {/* Repo Input */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, ease }}
          className="w-full max-w-md mt-4"
        >
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: 'var(--text-4-hex)' }}>TARGET REPOSITORY PATH</span>
            <div className="flex items-center gap-2 p-2 rounded-lg border focus-within:border-teal-hex transition-all" style={{ background: 'var(--surface-hex)', borderColor: 'var(--border-2-hex)' }}>
              <span style={{ color: 'var(--text-4-hex)', paddingLeft: '8px' }}>📁</span>
              <input
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="e.g. C:/Projects/my-app or https://github.com/..."
                className="bg-transparent border-none outline-none flex-1 font-mono text-[13px]"
                style={{ color: 'var(--text-1-hex)' }}
              />
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4, ease }}
          whileHover={{ scale: 1.04, boxShadow: '0 0 32px rgba(0,229,184,0.25)' }}
          whileTap={{ scale: 0.98 }}
          onClick={handleEnter}
          className="mt-2 px-8 py-3.5 rounded-md font-syne font-semibold text-sm tracking-wider cursor-pointer w-full max-w-md"
          style={{
            background: 'linear-gradient(135deg, var(--teal-hex) 0%, var(--teal-2-hex) 100%)',
            color: 'var(--void-hex)',
            letterSpacing: '0.05em',
          }}
        >
          Initialize Analysis →
        </motion.button>

        {/* Trust signals */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          className="flex flex-col items-center gap-1 mt-6 font-mono text-[11px]"
          style={{ color: 'var(--text-3-hex)' }}
        >
          <span>Built on AXA Architecture (IEEE/ACM ASE 2024)</span>
          <span>tree-sitter · NetworkX · Claude API</span>
          <span>SQL → Python → TypeScript → React</span>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default LandingPage;
