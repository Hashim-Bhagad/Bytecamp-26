export interface NodeData {
  id: string;
  lang: 'sql' | 'python' | 'ts' | 'react';
  name: string;
  preview: string[];
  severity: 'CRITICAL' | 'BREAKS' | null;
  breaking: boolean;
  impactScore: number;
  impactedFiles: number;
  confidence: number;
  position: { x: number; y: number };
}

export interface EdgeData {
  from: string;
  to: string;
  type: 'ast' | 'naming' | 'llm';
  critical: boolean;
}

export interface DiffLine {
  num: number;
  type: 'unchanged' | 'changed';
  before: string;
  after: string;
}

export interface TerminalLine {
  id: string;
  type: 'info' | 'alert' | 'normal';
  timestamp?: string;
  message: string;
}

export const LANG_COLORS: Record<string, string> = {
  sql: '#f59e0b',
  python: '#a78bfa',
  ts: '#38bdf8',
  react: '#34d399',
};

export const LANG_LABELS: Record<string, string> = {
  sql: 'SQL',
  python: 'PY',
  ts: 'TS',
  react: 'RX',
};

export const NODES: Record<string, NodeData> = {
  'schema.sql': {
    id: 'schema.sql',
    lang: 'sql', name: 'schema.sql',
    preview: ['user_email VARCHAR(255)'],
    severity: 'CRITICAL', breaking: true,
    impactScore: 90.09, impactedFiles: 5, confidence: 0.942,
    position: { x: 180, y: 280 },
  },
  'auth_service.py': {
    id: 'auth_service.py',
    lang: 'python', name: 'auth_service.py',
    preview: ['class User:', 'def get_user_email(self):'],
    severity: 'CRITICAL', breaking: true,
    impactScore: 72.4, impactedFiles: 3, confidence: 0.881,
    position: { x: 400, y: 340 },
  },
  'api_client.ts': {
    id: 'api_client.ts',
    lang: 'ts', name: 'api_client.ts',
    preview: ['interface UserResponse {', '  user_email: string;'],
    severity: 'CRITICAL', breaking: true,
    impactScore: 65.1, impactedFiles: 2, confidence: 0.910,
    position: { x: 620, y: 270 },
  },
  'UserProfile.tsx': {
    id: 'UserProfile.tsx',
    lang: 'react', name: 'UserProfile.tsx',
    preview: ['data.user_email'],
    severity: 'BREAKS', breaking: true,
    impactScore: 40.2, impactedFiles: 0, confidence: 0.880,
    position: { x: 830, y: 180 },
  },
  'SettingsView.tsx': {
    id: 'SettingsView.tsx',
    lang: 'react', name: 'SettingsView.tsx',
    preview: ['onChange={e => ...}'],
    severity: 'BREAKS', breaking: true,
    impactScore: 38.7, impactedFiles: 0, confidence: 0.855,
    position: { x: 830, y: 380 },
  },
  'logger.py': {
    id: 'logger.py',
    lang: 'python', name: 'logger.py',
    preview: ['log_event'],
    severity: null, breaking: false,
    impactScore: 0, impactedFiles: 0, confidence: 1.0,
    position: { x: 400, y: 140 },
  },
  'utils.ts': {
    id: 'utils.ts',
    lang: 'ts', name: 'utils.ts',
    preview: ['formatDate'],
    severity: null, breaking: false,
    impactScore: 0, impactedFiles: 0, confidence: 1.0,
    position: { x: 620, y: 430 },
  },
};

export const EDGES: EdgeData[] = [
  { from: 'schema.sql', to: 'auth_service.py', type: 'ast', critical: true },
  { from: 'auth_service.py', to: 'api_client.ts', type: 'naming', critical: true },
  { from: 'api_client.ts', to: 'UserProfile.tsx', type: 'naming', critical: true },
  { from: 'api_client.ts', to: 'SettingsView.tsx', type: 'llm', critical: true },
  { from: 'auth_service.py', to: 'logger.py', type: 'ast', critical: false },
  { from: 'api_client.ts', to: 'utils.ts', type: 'ast', critical: false },
];

export const DIFF_DATA: Record<string, { lines: DiffLine[] }> = {
  'auth_service.py': {
    lines: [
      { num: 112, type: 'unchanged', before: 'class User(Base):', after: 'class User(Base):' },
      { num: 113, type: 'unchanged', before: "    __tablename__ = 'users'", after: "    __tablename__ = 'users'" },
      { num: 114, type: 'unchanged', before: '', after: '' },
      { num: 115, type: 'changed', before: '    user_email = Column(', after: '    contact_email = Column(' },
      { num: 116, type: 'changed', before: '        String,', after: '        String,' },
      { num: 117, type: 'changed', before: '        unique=True', after: '        unique=True' },
      { num: 118, type: 'unchanged', before: '    )', after: '    )' },
      { num: 119, type: 'unchanged', before: '', after: '' },
      { num: 120, type: 'changed', before: '    def get_user_email(self):', after: '    def get_contact_email(self):' },
      { num: 121, type: 'changed', before: '        return self.user_email', after: '        return self.contact_email' },
    ],
  },
  'schema.sql': {
    lines: [
      { num: 40, type: 'unchanged', before: 'CREATE TABLE users (', after: 'CREATE TABLE users (' },
      { num: 41, type: 'unchanged', before: '    id SERIAL PRIMARY KEY,', after: '    id SERIAL PRIMARY KEY,' },
      { num: 42, type: 'changed', before: '    user_email VARCHAR(255) UNIQUE,', after: '    contact_email VARCHAR(255) UNIQUE,' },
      { num: 43, type: 'unchanged', before: '    created_at TIMESTAMP DEFAULT NOW()', after: '    created_at TIMESTAMP DEFAULT NOW()' },
      { num: 44, type: 'unchanged', before: ');', after: ');' },
    ],
  },
  'api_client.ts': {
    lines: [
      { num: 22, type: 'unchanged', before: 'export interface UserResponse {', after: 'export interface UserResponse {' },
      { num: 23, type: 'unchanged', before: '  id: number;', after: '  id: number;' },
      { num: 24, type: 'changed', before: '  user_email: string;', after: '  contact_email: string;' },
      { num: 25, type: 'unchanged', before: '  created_at: string;', after: '  created_at: string;' },
      { num: 26, type: 'unchanged', before: '}', after: '}' },
    ],
  },
  'UserProfile.tsx': {
    lines: [
      { num: 84, type: 'unchanged', before: 'const UserProfile = ({ data }) => {', after: 'const UserProfile = ({ data }) => {' },
      { num: 85, type: 'unchanged', before: '  return (', after: '  return (' },
      { num: 86, type: 'changed', before: '    <span>{data.user_email}</span>', after: '    <span>{data.contact_email}</span>' },
      { num: 87, type: 'unchanged', before: '  );', after: '  );' },
      { num: 88, type: 'unchanged', before: '};', after: '};' },
    ],
  },
  'SettingsView.tsx': {
    lines: [
      { num: 140, type: 'unchanged', before: '<input', after: '<input' },
      { num: 141, type: 'unchanged', before: '  type="email"', after: '  type="email"' },
      { num: 142, type: 'changed', before: '  value={user.user_email}', after: '  value={user.contact_email}' },
      { num: 143, type: 'changed', before: '  onChange={e => setUserEmail(e.target.value)}', after: '  onChange={e => setContactEmail(e.target.value)}' },
      { num: 144, type: 'unchanged', before: '/>', after: '/>' },
    ],
  },
};

export const INITIAL_TERMINAL_LINES: TerminalLine[] = [
  { id: '1', type: 'normal', message: '→ Initializing tree-sitter parsers for SQL, Python, TypeScript, React...' },
  { id: '2', type: 'normal', message: '→ Parsed 7 source files. CodeNode tree built (1,402 nodes, 89 structural edges)' },
  { id: '3', type: 'normal', message: '→ Layer 2: Rule-based edge extraction complete. ORM mappings: 4, Imports: 23, Calls: 62' },
  { id: '4', type: 'normal', message: '→ Boundary Zone Detector identified 8 naming-convention pairs (Confidence > 0.85)' },
  { id: '5', type: 'normal', message: '→ LLM inference pass completed. Added 32 tentative edges (avg confidence: 0.74)' },
  { id: '6', type: 'info', timestamp: '14:02:44', message: "Info: Running blast radius simulation for target node 'user_email'..." },
  { id: '7', type: 'alert', timestamp: '14:02:45', message: 'ALERT: Critical breaking chain detected across boundary SQL→Python→TS→React.' },
  { id: '8', type: 'info', timestamp: '14:02:45', message: 'Severity calculated: 90.09. ImpactScore formula: Σ(dependents × confidence) × API_multiplier × coverage_multiplier' },
  { id: '9', type: 'normal', timestamp: '14:02:45', message: 'Awaiting user instruction...' },
];

export const TIMELINE_ITEMS = [
  { lang: 'sql', color: '#f59e0b', label: 'SQL', file: 'schema.sql:42', desc: 'Column definition · user_email VARCHAR(255)' },
  { lang: 'python', color: '#a78bfa', label: 'PY', file: 'auth_service.py:118', desc: 'Method · get_user_email() → ORM binding' },
  { lang: 'ts', color: '#38bdf8', label: 'TS', file: 'api_client.ts:24', desc: 'Interface prop · UserResponse.user_email' },
  { lang: 'react', color: '#34d399', label: 'RX', file: 'UserProfile.tsx:86', desc: 'Data binding · data.user_email', badge: 'BREAKS' },
  { lang: 'react', color: '#34d399', label: 'RX', file: 'SettingsView.tsx:142', desc: 'Form binding · onChange handler', badge: 'BREAKS' },
];
