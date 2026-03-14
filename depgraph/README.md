# DepGraph.ai 🗺️

Cross-language dependency mapping for polyglot codebases. Catches silent breaks **before** they hit production.

![SQL → Python → TypeScript → React](./docs/flow.png)

## What it does

When you rename a database column (`user_email` → `email`), DepGraph.ai shows:
- Every Python ORM field, Pydantic schema, TypeScript interface, and React component that breaks
- The exact file and line number
- A severity score (ImpactScore formula)
- A complete migration plan with before/after diffs

## Quick Start

### Backend

```bash
cd depgraph

# 1. Install deps
pip install -r requirements.txt

# 2. Set your Featherless API key
echo "FEATHERLESS_API_KEY=your_key_here" >> .env

# 3. Start backend
python -m uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Demo

1. Enter `./sample-project` in the path box and click **Analyze**
2. Watch the 6-layer pipeline run (see progress bar)
3. Click `user_email` in the sidebar
4. See **4 languages affected**, severity = CRITICAL
5. Right panel → **Fix** tab → enter `email` → see migration plan

## Architecture

```
SQL → Python ORM → Pydantic Schema → FastAPI Route
                                   ↓ (JSON boundary)
                TypeScript Interface → React Components
```

6 layers:
1. **AST Foundation** — tree-sitter + sqlglot
2. **Structural Graph** — ORM_MAP, CONVENTION_MAP, IMPORTS
3. **Boundary Zone Detector** — AXA Language Detector (ASE 2024)
4. **LLM Semantic Resolution** — GLM-4.7 via Featherless.ai
5. **Unified Knowledge Graph** — NetworkX DiGraph
6. **Dual Query Engine** — Fast BFS + Deep AI narration

## Git Hook

```bash
python scripts/install_hooks.py /path/to/your/repo
```

Blocks commits that introduce cross-language breaks (medium/high risk).

## API

| Endpoint | Description |
|---|---|
| `POST /api/analyze?repo_path=` | Run full analysis |
| `GET /api/graph` | Graph in React Flow format |
| `GET /api/impact/{node_id}` | Fast BFS impact (no LLM) |
| `GET /api/narrate/{node_id}` | AI-narrated impact explanation |
| `POST /api/chat` | Graph RAG chat |
| `POST /api/migrate` | Cross-language migration plan |
| `GET /api/health` | Health check |
| `WS /ws/progress` | Real-time analysis progress |
