import asyncio
import json
import hashlib
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from openai import OpenAI
from dotenv import load_dotenv
from backend.core.models import CodeNode

load_dotenv()

# Featherless AI client via OpenAI SDK
client = OpenAI(
    base_url=os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1"),
    api_key=os.getenv("FEATHERLESS_API_KEY", "")
)
# We will use asyncio.to_thread for the sync client calls or switch to AsyncOpenAI.
# Switching to AsyncOpenAI is cleaner:
from openai import AsyncOpenAI
async_client = AsyncOpenAI(
    base_url=os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1"),
    api_key=os.getenv("FEATHERLESS_API_KEY", "")
)
MODEL = os.getenv("FEATHERLESS_MODEL", "zai-org/GLM-4.7")

# Content-hash cache for annotations — only re-call LLM when code changes
_annotation_cache: dict[str, dict] = {}

# Semaphore: GLM-4.7 costs 4 concurrency units per request.
# Plan limit is 4 units → only 1 request can be in-flight at a time.
_sem = asyncio.Semaphore(1)


def build_context_window(node: CodeNode, node_index: dict) -> str:
    """
    Build hierarchical context by walking the CodeNode tree.
    Parent gives scope. Siblings give surrounding context.
    Children give internal structure. Zero vector operations.
    """
    parent = node_index.get(node.parent_id)
    siblings = [c for c in parent.children if c.id != node.id] if parent else []
    children_preview = "\n".join(
        f"  - {c.name} ({c.type}): {c.source_lines[:120]}"
        for c in node.children[:10]
    )
    sibling_names = ", ".join(s.name for s in siblings[:8])
    parent_src = (parent.source_lines[:400] if parent else "n/a")

    return f"""FILE: {node.file}
LANGUAGE: {node.language}

PARENT SCOPE ({parent.type if parent else 'root'}: {parent.name if parent else 'n/a'}):
{parent_src}

SIBLINGS IN SAME SCOPE: {sibling_names}

THIS NODE ({node.type}: {node.name}) — lines {node.line_start}–{node.line_end}:
{node.source_lines}

CHILDREN:
{children_preview if children_preview else '  (leaf node)'}
"""


async def annotate_node(node: CodeNode, node_index: dict) -> dict:
    """
    Annotate a boundary node using GLM-4.7 via Featherless.
    Cache by content hash — only re-analyze when code changes.
    """
    cache_key = hashlib.md5(node.source_lines.encode()).hexdigest()
    if cache_key in _annotation_cache:
        return _annotation_cache[cache_key]

    context = build_context_window(node, node_index)
    children_summaries = "\n".join(
        f"  - {c.name}: {c.summary}" for c in node.children if c.summary
    )

    prompt = f"""You are analyzing a node in a polyglot codebase dependency system.

{context}

Child summaries (already analyzed):
{children_summaries if children_summaries else '  (none)'}

Extract the following as JSON only (no markdown, no preamble):
{{
  "summary": "one sentence: what this is and what data it holds or transforms",
  "data_in": ["field names or values this node receives"],
  "data_out": ["field names or values this node exposes or produces"],
  "transformations": ["any changes: camelCase, null-check, type coercion, serialization"],
  "sensitivity": "none | low | medium | high | pii",
  "boundary_signals": ["specific patterns indicating cross-language data flow"]
}}"""

    result = {
        "summary": f"{node.type} {node.name} in {node.language}",
        "data_in": [], "data_out": [],
        "transformations": [], "sensitivity": "none", "boundary_signals": []
    }

    async with _sem:  # only 1 concurrent call allowed for GLM-4.7
        for attempt in range(5):  # up to 5 retries
            try:
                response = await asyncio.wait_for(
                    async_client.chat.completions.create(
                        model=MODEL,
                        max_tokens=400,
                        messages=[{"role": "user", "content": prompt}]
                    ),
                    timeout=30.0
                )
                text = response.choices[0].message.content.strip()
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                result = json.loads(text)
                break
            except asyncio.TimeoutError:
                print(f"  [LLM WARN] annotate_node timed out for {node.id} (attempt {attempt+1})")
                if attempt >= 4:
                    break
                await asyncio.sleep(2 ** attempt)  # 1s, 2s, 4s, 8s, 16s
            except Exception as e:
                if "concurrency_limit_exceeded" in str(e) or "429" in str(e):
                    wait = 2 ** (attempt + 1)  # 2s, 4s, 8s, 16s, 32s
                    print(f"  [LLM] Rate limited — waiting {wait}s before retry (attempt {attempt+1})")
                    await asyncio.sleep(wait)
                    continue
                print(f"  [LLM WARN] annotate_node failed for {node.id} (attempt {attempt+1}): {e}")
                if attempt >= 4:
                    break

    _annotation_cache[cache_key] = result
    return result


async def traverse_and_annotate(node: CodeNode, node_index: dict):
    """
    Annotate a single boundary node (no recursive child traversal).
    Children are NOT individually annotated — only the selected boundary nodes
    passed in from main.py are processed. This avoids O(all_nodes) LLM calls.
    """
    annotation = await annotate_node(node, node_index)
    node.summary = annotation.get("summary", "")
    node.metadata.update(annotation)
    print(f"  [LLM] Annotated: {node.id[:60]}")


async def resolve_boundary_edges(pairs: list, node_index: dict) -> list[dict]:
    """
    For each boundary pair, use GLM-4.7 to identify specific fields
    that flow from emitter to receiver.
    All pairs are processed in parallel, gated by the shared semaphore (max 3 concurrent).
    """

    async def _resolve_pair(pair) -> list[dict]:
        emitter_ctx = build_context_window(pair.emitter, node_index)
        receiver_ctx = build_context_window(pair.receiver, node_index)

        prompt = f"""You are identifying cross-language data flow in a polyglot codebase.

EMITTER ({pair.emitter_language}):
{emitter_ctx}
Emitter summary: {pair.emitter.summary}
Data out: {pair.emitter.metadata.get('data_out', [])}

RECEIVER ({pair.receiver_language}):
{receiver_ctx}
Receiver summary: {pair.receiver.summary}
Data in: {pair.receiver.metadata.get('data_in', [])}

For each field that flows from the EMITTER to the RECEIVER, return a JSON array.
Return ONLY the JSON array, no markdown:
[
  {{
    "source_node_id": "exact id of the source field/property",
    "target_node_id": "exact id of the target field/property",
    "relationship": "FLOWS_TO | TRANSFORMS | EXPOSES_AS | RENDERS",
    "transformation": "how data changes: snake_to_camel | null_stripped | type_cast | direct",
    "confidence": 0.0,
    "data_fields": ["specific field names that travel this edge"],
    "break_risk": "none | low | medium | high",
    "break_reason": "exactly what breaks if source is renamed or deleted"
  }}
]

Only include matches with confidence >= 0.5. Be conservative. If no matches, return []."""

        async with _sem:
            for attempt in range(5):
                try:
                    response = await asyncio.wait_for(
                        async_client.chat.completions.create(
                            model=MODEL,
                            max_tokens=800,
                            messages=[{"role": "user", "content": prompt}]
                        ),
                        timeout=30.0
                    )
                    text = response.choices[0].message.content.strip()
                    if text.startswith("```"):
                        text = text.split("```")[1]
                        if text.startswith("json"):
                            text = text[4:]
                    edges = json.loads(text)
                    if isinstance(edges, list):
                        print(f"  [LLM] Pair {pair.emitter_language}→{pair.receiver_language}: {len(edges)} edge(s)")
                        return edges
                    return []
                except asyncio.TimeoutError:
                    print(f"  [LLM WARN] resolve_pair timed out (attempt {attempt+1})")
                    if attempt >= 4:
                        return []
                    await asyncio.sleep(2 ** attempt)
                except Exception as e:
                    if "concurrency_limit_exceeded" in str(e) or "429" in str(e):
                        wait = 2 ** (attempt + 1)  # 2s, 4s, 8s, 16s, 32s
                        print(f"  [LLM] Rate limited — waiting {wait}s (attempt {attempt+1})")
                        await asyncio.sleep(wait)
                        continue
                    print(f"  [LLM WARN] resolve_boundary_edges failed (attempt {attempt+1}): {e}")
                    if attempt >= 4:
                        return []
        return []

    results = await asyncio.gather(*[_resolve_pair(pair) for pair in pairs])
    all_edges = [edge for edges in results for edge in edges]
    return all_edges
