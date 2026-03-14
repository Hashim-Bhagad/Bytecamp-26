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

            # Multiply confidences along path — chain confidence degrades
            path_confidence = 1.0
            for e in edges_on_path:
                path_confidence *= e.get("confidence", 1.0)

            risk_order = ["none", "low", "medium", "high"]
            max_risk = max(
                (e.get("break_risk", "none") for e in edges_on_path),
                key=lambda x: risk_order.index(x) if x in risk_order else 0
            )

            node_data = dict(G.nodes[desc])
            node_data["id"] = desc  # Include id in node data for reference
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


async def narrate_impact(G: nx.DiGraph, node_id: str) -> str:
    """
    Deep mode: LLM-narrated explanation of the impact chain.
    Uses Graph RAG: extracts subgraph → augments prompt → generates grounded answer.
    """
    import json
    import os
    from openai import AsyncOpenAI
    from dotenv import load_dotenv
    load_dotenv()

    llm_client = AsyncOpenAI(
        base_url=os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1"),
        api_key=os.getenv("FEATHERLESS_API_KEY", "")
    )
    model = os.getenv("FEATHERLESS_MODEL", "zai-org/GLM-4.7")

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


async def generate_migration(G: nx.DiGraph, node_id: str, new_name: str) -> dict:
    """
    Generate a complete cross-language migration plan for renaming a field.
    Returns JSON with per-file diffs in safe dependency order.
    """
    import json
    import os
    from openai import AsyncOpenAI
    from dotenv import load_dotenv
    load_dotenv()

    llm_client = AsyncOpenAI(
        base_url=os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1"),
        api_key=os.getenv("FEATHERLESS_API_KEY", "")
    )
    model = os.getenv("FEATHERLESS_MODEL", "zai-org/GLM-4.7")

    impact = get_impact(G, node_id)
    source_node = impact["source"]

    prompt = f"""Generate a complete, safe migration plan for renaming a field in a polyglot codebase.

Field being renamed: '{source_node.get('name', node_id)}' → '{new_name}'
Source: {source_node.get('file', '?')} line {source_node.get('line_start', '?')}
Language: {source_node.get('language', '?')}

All affected nodes across all language layers:
{json.dumps(impact['chain'], indent=2)}

Account for ALL transformations:
- If SQL: use ALTER TABLE RENAME COLUMN
- If Python ORM: update Column() argument or attribute name
- If Pydantic: update field name (keep camelCase alias if present)
- If TypeScript interface: update field name preserving camelCase
- If React: update prop access and destructuring

Return ONLY this JSON (no markdown):
{{
  "summary": "X changes across Y files in Z languages",
  "safe_order": ["apply SQL first, then Python ORM, then schema, then TypeScript, then React"],
  "files": [
    {{
      "file": "filename",
      "language": "sql|python|typescript|react",
      "line": 12,
      "old_code": "exact current line",
      "new_code": "exact replacement line",
      "change_type": "rename|update_reference|update_serializer|update_interface"
    }}
  ]
}}"""

    try:
        response = await llm_client.chat.completions.create(
            model=model,
            max_tokens=1200,
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except json.JSONDecodeError:
        return {"summary": "Parse error — LLM returned invalid JSON", "files": [], "safe_order": []}
    except Exception as e:
        return {"summary": f"Migration unavailable: {e}", "files": [], "safe_order": []}


async def answer_query(G: nx.DiGraph, question: str, selected_node_id: str = None) -> str:
    """
    Graph RAG chat: extract relevant subgraph → send to LLM → return grounded answer.
    """
    import json
    import os
    from openai import AsyncOpenAI
    from dotenv import load_dotenv
    load_dotenv()

    llm_client = AsyncOpenAI(
        base_url=os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1"),
        api_key=os.getenv("FEATHERLESS_API_KEY", "")
    )
    model = os.getenv("FEATHERLESS_MODEL", "zai-org/GLM-4.7")

    # Graph RAG: extract relevant subgraph
    if selected_node_id and selected_node_id in G:
        subgraph = nx.ego_graph(G, selected_node_id, radius=2)
        nodes_data = [dict(G.nodes[n]) | {"id": n} for n in subgraph.nodes]
    else:
        sorted_nodes = sorted(G.degree(), key=lambda x: x[1], reverse=True)
        nodes_data = [dict(G.nodes[n]) | {"id": n} for n, _ in sorted_nodes[:40]]

    languages = set(nx.get_node_attributes(G, 'language').values())
    system = f"""You are an expert code analyst for a polyglot codebase.
Contains {G.number_of_nodes()} symbols across {len(languages)} languages: {', '.join(languages)}.
Relevant graph context:
{json.dumps(nodes_data, indent=2)}

Answer precisely. Reference specific file names, line numbers, and field names.
Use break_risk and break_reason fields to quantify danger."""

    try:
        response = await llm_client.chat.completions.create(
            model=model,
            max_tokens=600,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": question}
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Query unavailable: {e}"
