import re
import networkx as nx
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from backend.query.severity import compute_severity_score


def get_impact(G: nx.DiGraph, node_id: str) -> dict:
    """
    Fast mode: BFS traversal — no LLM, instant response.
    Returns all downstream descendants with path confidence and max break risk.
    """
    if node_id not in G:
        return {"error": "node not found", "node_id": node_id}

    descendants = list(nx.descendants(G, node_id))
    chain = []

    for desc in descendants:
        try:
            path = nx.shortest_path(G, node_id, desc)
            edges_on_path = [G.edges[path[i], path[i + 1]] for i in range(len(path) - 1)]

            path_confidence = 1.0
            for e in edges_on_path:
                path_confidence *= e.get("confidence", 1.0)

            risk_order = ["none", "low", "medium", "high"]
            max_risk = max(
                (e.get("break_risk", "none") for e in edges_on_path),
                key=lambda x: risk_order.index(x) if x in risk_order else 0
            )

            node_data = dict(G.nodes[desc])
            node_data["id"] = desc
            chain.append({
                "node": node_data,
                "distance": len(path) - 1,
                "path": path,
                "path_confidence": round(path_confidence, 3),
                "max_break_risk": max_risk
            })
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            pass

    severity = compute_severity_score(G, node_id, chain)

    return {
        "source": dict(G.nodes[node_id]),
        "affected_count": len(descendants),
        "languages_affected": list(set(
            G.nodes[d].get("language", "?") for d in descendants
        )),
        "chain": sorted(chain, key=lambda x: x["distance"]),
        "has_critical_breaks": any(c["max_break_risk"] == "high" for c in chain),
        "severity": severity
    }


def _extract_context_nodes(G: nx.DiGraph, question: str, selected_node_id: str | None) -> set[str]:
    """
    Find graph nodes relevant to the question via keyword matching, then expand 1-2 hops.
    Falls back to top-degree nodes per language if nothing matches.
    """
    q = question.lower()

    # Tokenise question into words (strip punctuation)
    q_tokens = set(re.split(r'[\s\.,;:()\[\]{}\'"!?/\\]+', q)) - {"", "the", "a", "an", "in",
        "of", "for", "to", "is", "are", "was", "what", "how", "why", "where", "which",
        "this", "that", "with", "from", "does", "do", "can", "my", "its", "their"}

    # Score every node by how many question tokens it matches
    scored: list[tuple[float, str]] = []
    for nid, data in G.nodes(data=True):
        score = 0.0
        name = data.get("name", "").lower()
        file_parts = set(re.split(r'[/\\.]', data.get("file", "").lower()))
        summary = data.get("summary", "").lower()
        source = (data.get("source_lines") or "").lower()

        for tok in q_tokens:
            if len(tok) < 3:
                continue
            if tok == name:
                score += 3.0
            elif tok in name:
                score += 1.5
            elif tok in file_parts:
                score += 1.0
            elif tok in summary:
                score += 0.5
            elif tok in source:
                score += 0.3

        if score > 0:
            scored.append((score, nid))

    # Take top keyword-matched nodes
    scored.sort(reverse=True)
    seed_nodes: set[str] = {nid for _, nid in scored[:15]}

    # Always include selected node
    if selected_node_id and selected_node_id in G:
        seed_nodes.add(selected_node_id)

    # Expand seeds 1-hop in both directions
    expanded: set[str] = set(seed_nodes)
    for nid in seed_nodes:
        expanded.update(G.predecessors(nid))
        expanded.update(G.successors(nid))

    # If no keyword match, fall back to top-N per language for breadth
    if not seed_nodes:
        nodes_by_lang: dict[str, list] = {}
        for nid, data in G.nodes(data=True):
            lang = data.get("language", "other")
            nodes_by_lang.setdefault(lang, []).append((G.degree(nid), nid))
        for lang_nodes in nodes_by_lang.values():
            lang_nodes.sort(reverse=True)
            for _, nid in lang_nodes[:12]:
                expanded.add(nid)

    # Cap at 60 to keep context manageable
    if len(expanded) > 60:
        # Priority: selected > seeds > rest by degree
        priority = list(seed_nodes)
        if selected_node_id:
            priority = [selected_node_id] + [n for n in priority if n != selected_node_id]
        rest = sorted(expanded - set(priority), key=lambda n: G.degree(n), reverse=True)
        expanded = set(priority[:30]) | set(rest[:30])

    return expanded


def _build_rag_context(G: nx.DiGraph, context_nodes: set[str]) -> str:
    """
    Build a structured text block describing the relevant subgraph.
    Includes source code snippets and cross-language edge data.
    """
    LANG_ABBR = {"sql": "SQL", "python": "PY", "typescript": "TS",
                 "javascript": "JS", "react": "RX"}

    # Group by layer for readability
    LAYER_ORDER = ["sql", "python", "typescript", "javascript", "react"]
    by_lang: dict[str, list] = {}
    for nid in context_nodes:
        if nid not in G:
            continue
        lang = G.nodes[nid].get("language", "other")
        by_lang.setdefault(lang, []).append(nid)

    sections: list[str] = []

    for lang in LAYER_ORDER + [l for l in by_lang if l not in LAYER_ORDER]:
        nodes = by_lang.get(lang, [])
        if not nodes:
            continue
        abbr = LANG_ABBR.get(lang, lang.upper()[:2])
        lang_lines: list[str] = []
        for nid in nodes:
            data = G.nodes[nid]
            name = data.get("name", nid.split("::")[-1])
            ntype = data.get("type", "?")
            file_ = data.get("file", "?")
            line = data.get("line_start", "?")
            summary = data.get("summary", "")
            source = (data.get("source_lines") or "")[:250].strip()
            sensitivity = data.get("sensitivity", "")
            data_in = data.get("data_in", [])
            data_out = data.get("data_out", [])

            entry = f"  [{abbr}] {ntype} `{name}` — {file_}:{line}"
            if summary:
                entry += f"\n    summary: {summary}"
            if sensitivity and sensitivity not in ("none", ""):
                entry += f"\n    sensitivity: {sensitivity}"
            if data_in:
                entry += f"\n    data_in: {data_in}"
            if data_out:
                entry += f"\n    data_out: {data_out}"
            if source:
                # indent source lines for readability
                indented = "\n".join("    | " + l for l in source.split("\n")[:12])
                entry += f"\n    code:\n{indented}"
            lang_lines.append(entry)

        if lang_lines:
            sections.append(f"--- {lang.upper()} LAYER ---\n" + "\n\n".join(lang_lines))

    # Cross-language edges within context
    edge_lines: list[str] = []
    for src, tgt, edata in G.edges(data=True):
        if src not in context_nodes or tgt not in context_nodes:
            continue
        src_name = G.nodes[src].get("name", src.split("::")[-1])
        tgt_name = G.nodes[tgt].get("name", tgt.split("::")[-1])
        src_lang = LANG_ABBR.get(G.nodes[src].get("language", ""), "?")
        tgt_lang = LANG_ABBR.get(G.nodes[tgt].get("language", ""), "?")
        etype = edata.get("type", "FLOWS_TO")
        conf = edata.get("confidence", 1.0)
        risk = edata.get("break_risk", "none")
        reason = edata.get("break_reason", "")
        line = f"  [{src_lang}]{src_name} -[{etype} conf={conf:.2f} risk={risk}]-> [{tgt_lang}]{tgt_name}"
        if reason:
            line += f"  # {reason[:80]}"
        edge_lines.append(line)

    result = "\n\n".join(sections)
    if edge_lines:
        result += "\n\n--- RELATIONSHIPS ---\n" + "\n".join(edge_lines[:60])

    return result


async def answer_query(
    G: nx.DiGraph,
    question: str,
    selected_node_id: str | None = None,
    history: list[dict] | None = None,
) -> str:
    """
    Graph RAG chat.
    1. Extract relevant subgraph from keyword matching + selected node
    2. Build structured context with source code + edges
    3. Call LLM with conversation history
    """
    import os
    from openai import AsyncOpenAI
    from dotenv import load_dotenv
    load_dotenv()

    llm_client = AsyncOpenAI(
        base_url=os.getenv("FEATHERLESS_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=os.getenv("FEATHERLESS_API_KEY", ""),
        timeout=35.0,
        max_retries=0,
    )
    model = os.getenv("FEATHERLESS_MODEL", "meta-llama/llama-3.1-8b-instruct")

    context_nodes = _extract_context_nodes(G, question, selected_node_id)
    rag_context = _build_rag_context(G, context_nodes)

    all_languages = set(nx.get_node_attributes(G, "language").values())
    total_nodes = G.number_of_nodes()
    total_edges = G.number_of_edges()

    selected_info = ""
    if selected_node_id and selected_node_id in G:
        d = G.nodes[selected_node_id]
        selected_info = (
            f"\nCURRENTLY SELECTED NODE: `{d.get('name', selected_node_id)}` "
            f"({d.get('type','?')} in {d.get('language','?')}, {d.get('file','?')}:{d.get('line_start','?')})"
        )

    system = f"""You are DepGraph.ai, an expert code analyst for a polyglot codebase.

CODEBASE: {total_nodes} symbols, {total_edges} dependency edges, languages: {', '.join(sorted(all_languages))}.{selected_info}

RELEVANT GRAPH CONTEXT ({len(context_nodes)} nodes):
{rag_context}

INSTRUCTIONS:
- Answer ONLY from the graph context above. Do not hallucinate file names or function names not shown.
- Reference specific files, line numbers, and symbol names when you can.
- For data flow questions: trace the DB -> Python -> TypeScript/React path across the relationship edges.
- For "what breaks" questions: focus on edges where break_risk=high.
- Format code references as `backtick quoted` and file paths as file.ext:line.
- Be concise and direct. Use bullet points for lists of items."""

    messages: list[dict] = [{"role": "system", "content": system}]

    # Include up to 6 previous turns (3 exchanges) for multi-turn context
    if history:
        messages.extend(history[-6:])

    messages.append({"role": "user", "content": question})

    try:
        response = await llm_client.chat.completions.create(
            model=model,
            max_tokens=600,
            temperature=0.2,
            messages=messages,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Query unavailable: {e}"


async def narrate_impact(G: nx.DiGraph, node_id: str) -> str:
    """LLM-narrated explanation of the impact chain."""
    import json
    import os
    from openai import AsyncOpenAI
    from dotenv import load_dotenv
    load_dotenv()

    llm_client = AsyncOpenAI(
        base_url=os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1"),
        api_key=os.getenv("FEATHERLESS_API_KEY", ""),
        timeout=60.0,
        max_retries=0,
    )
    model = os.getenv("FEATHERLESS_MODEL", "meta-llama/llama-3.1-8b-instruct")

    impact = get_impact(G, node_id)
    subgraph_data = {
        "source_node": impact["source"],
        "chain": impact["chain"][:10],
        "severity": impact["severity"]
    }

    prompt = f"""A developer is considering modifying this symbol in their polyglot codebase.

Source node: {json.dumps(impact['source'], indent=2)}
Severity: {impact['severity']['tier']} (ImpactScore: {impact['severity']['score']})

Full downstream dependency chain (across all language layers):
{json.dumps(subgraph_data['chain'], indent=2)}

Write a developer-friendly explanation covering:
1. What this field is, what data it holds, and its sensitivity level
2. The complete data flow journey across each language layer (include exact transformations)
3. Exactly what will break and why if this field is renamed or deleted (file + line)
4. Correct order of changes for a safe rename

Use specific file names, line numbers, and field names. Be direct and actionable."""

    try:
        response = await llm_client.chat.completions.create(
            model=model,
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Narration unavailable: {e}"


# ── Naming-convention helpers ────────────────────────────────────────────────

def _to_camel(name: str) -> str:
    """user_email → userEmail"""
    parts = name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _to_snake(name: str) -> str:
    """userEmail → user_email"""
    s1 = re.sub(r'(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def _target_name(new_name: str, lang: str, old_node_name: str) -> str:
    """
    Given the desired new_name (in whatever case the user typed),
    return the version appropriate for the target language.

    Rule: if the old node already uses camelCase (TS/React), output camelCase.
    Otherwise (SQL/Python), output snake_case.
    """
    is_frontend = lang in ("typescript", "react", "javascript")
    # Normalise new_name to snake_case first, then re-case for the target
    snake = _to_snake(new_name)
    if is_frontend:
        return _to_camel(snake)
    return snake


def _change_type(lang: str, node_type: str) -> str:
    t = node_type.lower()
    if lang == "sql":
        return "rename_column"
    if lang == "python" and "column" in t:
        return "update_orm"
    if lang == "python":
        return "update_schema"
    if lang in ("typescript", "javascript"):
        return "update_interface"
    if lang == "react":
        return "update_component"
    return "rename"


# ── Deterministic migration (no LLM) ────────────────────────────────────────

def _build_migration_deterministic(G: nx.DiGraph, node_id: str, new_name: str) -> dict:
    """
    Build the migration plan entirely from graph node data — no LLM required.

    For each node in the impact chain:
      1. Look up its source_lines from the graph.
      2. Find lines that contain the node's old name.
      3. Replace with the new name, applying the correct naming convention
         (snake_case for SQL/Python, camelCase for TS/React).
    """
    impact = get_impact(G, node_id)
    source_data = dict(G.nodes[node_id])
    old_name_root = source_data.get("name", node_id.split("::")[-1])

    files: list[dict] = []
    seen: set[tuple] = set()  # (file, line) dedup

    # Process source node + every downstream node
    chain_nodes: list[dict] = [source_data] + [
        dict(G.nodes[c["node"]["id"]]) if "id" in (c["node"] if isinstance(c["node"], dict) else {})
        else (dict(G.nodes.get(list(c["node"].keys())[0], {})) if isinstance(c["node"], dict) else dict(c["node"]))
        for c in impact["chain"]
        if c.get("node")
    ]

    # Rebuild cleanly — some chain items nest node data differently
    clean_nodes: list[dict] = [source_data]
    for c in impact["chain"]:
        raw = c.get("node", {})
        nid = raw.get("id", "")
        if nid and nid in G:
            clean_nodes.append(dict(G.nodes[nid]))
        elif isinstance(raw, dict):
            clean_nodes.append(raw)

    for nd in clean_nodes:
        lang       = nd.get("language", "")
        file_path  = nd.get("file", "")
        line_start = nd.get("line_start", 0)
        src_text   = (nd.get("source_lines") or "").strip()
        node_name  = nd.get("name", old_name_root)

        if not file_path or not src_text:
            continue

        tname = _target_name(new_name, lang, node_name)

        # Search each source line for the node's own name (most specific match)
        src_lines = src_text.split("\n")
        for i, src_line in enumerate(src_lines):
            # Match on node_name first; fall back to old_name_root
            match_name = node_name if node_name in src_line else (old_name_root if old_name_root in src_line else None)
            if not match_name:
                continue

            # Preserve the correct target form for this language
            replacement = _target_name(new_name, lang, match_name)
            new_line = src_line.replace(match_name, replacement)
            if new_line == src_line:
                continue

            actual_line = line_start + i
            key = (file_path, actual_line)
            if key in seen:
                continue
            seen.add(key)

            files.append({
                "file":        file_path,
                "language":    lang,
                "line":        actual_line,
                "old_code":    src_line.strip(),
                "new_code":    new_line.strip(),
                "change_type": _change_type(lang, nd.get("type", "")),
            })
            break  # one change per node — the most representative line

    # Safe application order: SQL → Python → TS/React
    order_langs = []
    for lng in ["sql", "python", "typescript", "javascript", "react"]:
        if any(f["language"] == lng for f in files):
            order_langs.append(lng)

    ORDER_LABEL = {
        "sql":        "SQL — rename column in schema/migration file",
        "python":     "Python — update ORM model and Pydantic serialiser",
        "typescript": "TypeScript — update interfaces and API types",
        "javascript": "JavaScript — update references",
        "react":      "React — update component props and destructuring",
    }
    safe_order = [ORDER_LABEL[lg] for lg in order_langs if lg in ORDER_LABEL]

    file_count = len(set(f["file"] for f in files))
    lang_set   = sorted(set(f["language"] for f in files))
    summary    = (
        f"{len(files)} change{'s' if len(files) != 1 else ''} across "
        f"{file_count} file{'s' if file_count != 1 else ''} "
        f"in {', '.join(lang_set)}"
    )

    return {
        "summary":    summary,
        "safe_order": safe_order or ["Apply changes in database → backend → frontend order"],
        "files":      files,
    }


async def generate_migration(G: nx.DiGraph, node_id: str, new_name: str) -> dict:
    """
    Generate a complete cross-language migration plan for renaming a field.

    Strategy:
      1. Always build a deterministic plan from graph data (instant, reliable).
      2. Attempt an LLM pass to enrich/correct the plan.
      3. If LLM fails or returns fewer results than the deterministic plan, keep deterministic.
    """
    import json
    import os
    from openai import AsyncOpenAI
    from dotenv import load_dotenv
    load_dotenv()

    if node_id not in G:
        return {"summary": f"Node '{node_id}' not found in graph.", "files": [], "safe_order": []}

    # ── Step 1: deterministic plan (always succeeds) ──────────────────────────
    det_plan = _build_migration_deterministic(G, node_id, new_name)

    if not det_plan["files"]:
        # Node has no source_lines stored — nothing to diff
        return {
            "summary": "No source code found for this node. Re-run analysis with a repo that includes source files.",
            "files":   [],
            "safe_order": [],
        }

    # ── Step 2: LLM enrichment (best-effort, small prompt) ───────────────────
    try:
        llm_client = AsyncOpenAI(
            base_url=os.getenv("FEATHERLESS_BASE_URL", "https://openrouter.ai/api/v1"),
            api_key=os.getenv("FEATHERLESS_API_KEY", ""),
            timeout=25.0,
            max_retries=0,
        )
        model = os.getenv("FEATHERLESS_MODEL", "meta-llama/llama-3.1-8b-instruct")

        source_node = dict(G.nodes[node_id])
        old_name    = source_node.get("name", node_id.split("::")[-1])

        # Small, focused prompt — only ask LLM to verify/fix the diff lines
        compact_files = [
            {"file": f["file"], "language": f["language"], "line": f["line"],
             "old_code": f["old_code"], "new_code": f["new_code"]}
            for f in det_plan["files"]
        ]
        prompt = (
            f"Review and correct this cross-language rename plan.\n"
            f"Renaming: '{old_name}' -> '{new_name}'\n\n"
            f"Current plan (JSON):\n{json.dumps(compact_files, indent=2)}\n\n"
            f"Rules:\n"
            f"- SQL/Python use snake_case; TypeScript/React use camelCase\n"
            f"- Only fix incorrect new_code values\n"
            f"- Keep the same file/line/language/change_type fields\n\n"
            f"Return ONLY valid JSON array (same structure, no markdown, no explanation)."
        )

        resp = await llm_client.chat.completions.create(
            model=model, max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.choices[0].message.content.strip()

        # Extract JSON array from anywhere in the response
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        if start >= 0 and end > start:
            llm_files = json.loads(raw[start:end])
            # Only use LLM result if it has at least as many entries
            if isinstance(llm_files, list) and len(llm_files) >= len(det_plan["files"]):
                # Merge: keep deterministic change_type, use LLM new_code if different
                for llm_f, det_f in zip(llm_files, det_plan["files"]):
                    llm_f.setdefault("change_type", det_f["change_type"])
                det_plan["files"] = llm_files

    except Exception:
        pass  # LLM failed — keep the deterministic plan unchanged

    return det_plan
