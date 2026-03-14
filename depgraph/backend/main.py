import asyncio
import json
import os
import sys
from pathlib import Path

import networkx as nx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.parsers.dispatcher import parse_repo, flatten_tree, build_node_index
from backend.graph.structural import extract_structural_edges
from backend.graph.boundary import detect_boundary_nodes, create_boundary_pairs
from backend.graph.llm_resolver import traverse_and_annotate, resolve_boundary_edges
from backend.graph.knowledge_graph import build_knowledge_graph, save_graph, load_graph
from backend.query.engine import get_impact, narrate_impact, generate_migration, answer_query
from backend.query.severity import compute_severity_score
from backend.git.cloner import clone_repo
from backend.git.diff_reader import get_changed_files, get_changed_node_ids
from backend.query.vulnerability import extract_vulnerabilities

# ────────────────────────────────────────────────────────────
# App setup
# ────────────────────────────────────────────────────────────
app = FastAPI(title="DepGraph.ai API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state — loaded once, updated incrementally
G: nx.DiGraph | None = None
ALL_FILE_NODES: list = []
GRAPH_PATH = str(Path(__file__).resolve().parent.parent / "depgraph_knowledge.json")

# Active WebSocket connection for progress streaming
_progress_ws: WebSocket | None = None


# ────────────────────────────────────────────────────────────
# Progress streaming helper
# ────────────────────────────────────────────────────────────
async def push_progress(msg: str, pct: int, is_error: bool = False):
    global _progress_ws
    print(f"[{pct}%] {msg}")
    if _progress_ws:
        try:
            # Match frontend expectation: { type: 'progress', message: string, progress: float (0-1), is_error: boolean }
            await _progress_ws.send_json({
                "type": "progress",
                "message": msg,
                "progress": pct / 100.0,
                "is_error": is_error
            })
        except Exception:
            pass


# ────────────────────────────────────────────────────────────
# Full analysis pipeline (runs in background)
# ────────────────────────────────────────────────────────────
async def run_full_analysis(repo_path: str):
    global G, ALL_FILE_NODES

    await push_progress("Initializing AST parsers (tree-sitter)...", 5)
    await push_progress("Scanning repository and parsing source files...", 10)
    ALL_FILE_NODES = parse_repo(repo_path)
    all_nodes_flat = flatten_tree(ALL_FILE_NODES)
    await push_progress(f"Successfully parsed {len(all_nodes_flat)} symbols across SQL/Python/TS", 25)

    await push_progress("Mapping structural dependencies (ORM, Imports)...", 35)
    structural_G = nx.DiGraph()
    repo_path_obj = Path(repo_path)
    for n in all_nodes_flat:
        try:
            rel_file = str(Path(n.file).relative_to(repo_path_obj))
        except ValueError:
            rel_file = n.file
            
        structural_G.add_node(n.id, **{
            "name": n.name, "type": n.type, "language": n.language,
            "file": rel_file, "line_start": n.line_start, "line_end": n.line_end
        })
    extract_structural_edges(ALL_FILE_NODES, structural_G)
    await push_progress(f"Structural mapping complete: {structural_G.number_of_edges()} edges found", 45)

    await push_progress("Boundary Zone Detector running (AXA Logic)...", 55)
    node_index = build_node_index(ALL_FILE_NODES)
    boundary_nodes = detect_boundary_nodes(ALL_FILE_NODES)
    pairs = create_boundary_pairs(boundary_nodes)
    await push_progress(f"Identified {len(pairs)} cross-language boundary pairs", 60)

    total = len(boundary_nodes)
    await push_progress(f"Running Semantic Annotation with GLM-4.7... (0/{total} nodes)", 70)
    completed = 0
    try:
        for node in boundary_nodes:
            await traverse_and_annotate(node, node_index)
            completed += 1
            # Push live updates every node, interpolating progress 70→82
            pct = int(70 + (completed / total) * 12)
            await push_progress(f"Annotated {completed}/{total} boundary nodes ...", pct)
    except BaseException as e:
        # CancelledError (uvicorn reload) or any fatal error — log and continue
        print(f"  [WARN] Annotation interrupted at {completed}/{total}: {e}")
    await push_progress(f"Semantic annotation complete ({completed}/{total} nodes annotated)", 82)
    
    await push_progress("Resolving cross-language semantic edges (AI Resolver)...", 85)
    semantic_edges = await resolve_boundary_edges(pairs, node_index)
    
    await push_progress("Unifying structural and semantic graphs...", 95)
    G = build_knowledge_graph(ALL_FILE_NODES, structural_G, semantic_edges)
    save_graph(G, GRAPH_PATH)
    
    await push_progress("Analysis complete. Plotting dependencies...", 100)


# ────────────────────────────────────────────────────────────
# Startup: pre-load graph if exists
# ────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    global G
    if os.path.exists(GRAPH_PATH):
        try:
            G = load_graph(GRAPH_PATH)
            print(f"  Loaded existing graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
        except Exception as e:
            print(f"  Could not load existing graph: {e}")


# ────────────────────────────────────────────────────────────
# REST Endpoints
# ────────────────────────────────────────────────────────────

@app.post("/api/analyze")
async def analyze(repo_path: str, background_tasks: BackgroundTasks):
    """
    Trigger full repo analysis. repo_path can be a local path or a GitHub URL.
    """
    final_path = repo_path
    if repo_path.startswith("http") and "github.com" in repo_path:
        try:
            await push_progress("Cloning remote repository...", 2)
            final_path = clone_repo(repo_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to clone repository: {str(e)}")
    
    if not os.path.exists(final_path):
        raise HTTPException(status_code=404, detail="Repository path not found")

    background_tasks.add_task(run_full_analysis, final_path)
    return {"status": "started", "repo_path": final_path}


@app.get("/api/graph")
async def get_graph():
    """Full graph in React Flow format."""
    if G is None:
        return {"nodes": [], "edges": []}

    nodes = []
    for node_id, data in G.nodes(data=True):
        try:
            # Only compute severity for nodes with descendants
            desc_count = len(list(nx.descendants(G, node_id)))
            if desc_count > 0:
                impact_chain = []
                for desc in list(nx.descendants(G, node_id))[:20]:
                    try:
                        path = nx.shortest_path(G, node_id, desc)
                        pc = 1.0
                        for i in range(len(path) - 1):
                            e = G.edges[path[i], path[i + 1]]
                            pc *= e.get("confidence", 1.0)
                        risk_order = ["none", "low", "medium", "high"]
                        max_risk = max(
                            (G.edges[path[i], path[i + 1]].get("break_risk", "none")
                             for i in range(len(path) - 1)),
                            key=lambda x: risk_order.index(x) if x in risk_order else 0
                        )
                        impact_chain.append({"node": {"id": desc}, "distance": len(path) - 1,
                                             "path": path, "path_confidence": round(pc, 3),
                                             "max_break_risk": max_risk})
                    except Exception:
                        pass
                severity = compute_severity_score(G, node_id, impact_chain)
            else:
                severity = {"score": 0, "tier": "LOW", "color": "#22c55e", "breakdown": {}}
        except Exception:
            severity = {"score": 0, "tier": "LOW", "color": "#22c55e", "breakdown": {}}

        nodes.append({
            "id": node_id,
            "data": {**data, "severity": severity},
            "position": {"x": 0, "y": 0}  # Dagre sets real positions client-side
        })

    edges = []
    for src, tgt, data in G.edges(data=True):
        edges.append({
            "id": f"{src}->{tgt}",
            "source": src,
            "target": tgt,
            "data": data
        })

    return {"nodes": nodes, "edges": edges}


@app.get("/api/impact/{node_id:path}")
async def impact_endpoint(node_id: str):
    """Fast BFS impact analysis. No LLM. Instant response."""
    if G is None:
        raise HTTPException(status_code=503, detail="Graph not built yet. Run /api/analyze first.")
    return get_impact(G, node_id)


@app.get("/api/narrate/{node_id:path}")
async def narrate_endpoint(node_id: str):
    """LLM-narrated explanation. 1-3 seconds."""
    if G is None:
        raise HTTPException(status_code=503, detail="Graph not built yet. Run /api/analyze first.")
    return {"narration": await narrate_impact(G, node_id)}


class ChatRequest(BaseModel):
    question: str
    selected_node_id: str = None


@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    """Graph RAG chat. Grounds answer in subgraph context."""
    if G is None:
        raise HTTPException(status_code=503, detail="Graph not built yet. Run /api/analyze first.")
    return {"answer": await answer_query(G, req.question, req.selected_node_id)}


class MigrateRequest(BaseModel):
    node_id: str
    new_name: str


@app.post("/api/migrate")
async def migrate_endpoint(req: MigrateRequest):
    """Generate complete cross-language migration plan."""
    if G is None:
        raise HTTPException(status_code=503, detail="Graph not built yet. Run /api/analyze first.")
    return await generate_migration(G, req.node_id, req.new_name)


@app.get("/api/git/impact")
async def git_impact_endpoint(repo_path: str = ".", mode: str = "staged"):
    """Returns impact of files changed in git diff."""
    if G is None:
        raise HTTPException(status_code=503, detail="Graph not built yet. Run /api/analyze first.")
    changed = get_changed_node_ids(G, repo_path, mode)
    results = []
    for n in changed:
        if n["node_id"] in G:
            results.append({"node": n, "impact": get_impact(G, n["node_id"])})
    return {"changed_nodes": results}
    

@app.get("/api/vulnerabilities")
async def vulnerabilities_endpoint():
    """Extract and explain cross-language vulnerabilities."""
    if G is None:
        return []
    try:
        from backend.query.vulnerability import extract_vulnerabilities
        return extract_vulnerabilities(G)
    except Exception as e:
        print(f"Vulnerability extraction failed: {str(e)}")
        return []


@app.get("/api/nodes")
async def list_nodes(language: str = None, type: str = None):
    """List all graph nodes with optional language/type filters."""
    if G is None:
        return {"nodes": []}
    nodes = []
    for node_id, data in G.nodes(data=True):
        if language and data.get("language") != language:
            continue
        if type and data.get("type") != type:
            continue
        nodes.append({"id": node_id, **data})
    return {"nodes": nodes}


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "graph_built": G is not None,
        "nodes": G.number_of_nodes() if G else 0,
        "edges": G.number_of_edges() if G else 0
    }


# ────────────────────────────────────────────────────────────
# WebSocket for progress streaming
# ────────────────────────────────────────────────────────────
@app.websocket("/ws/progress")
async def progress_ws(websocket: WebSocket):
    """Streams analysis progress as {type, message, progress} JSON messages."""
    global _progress_ws
    await websocket.accept()
    _progress_ws = websocket
    try:
        # receive_text() properly blocks until the client disconnects
        # (the client can send any message to keep-alive, or just close)
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send a heartbeat ping to confirm the connection is alive
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break  # client is gone
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _progress_ws = None


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
