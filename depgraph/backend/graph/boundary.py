import re
import sys
import os
from dataclasses import dataclass
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from backend.core.models import CodeNode
from backend.parsers.dispatcher import flatten_tree


# Regex patterns that signal a node is at a cross-language boundary
BOUNDARY_PATTERNS = {
    "python": [
        r"class\s+\w+\(.*Serializer\)",          # DRF serializer
        r"class\s+\w+\(.*BaseModel\)",            # Pydantic BaseModel
        r"class\s+\w+\(.*Schema\)",               # Marshmallow schema
        r"@app\.(get|post|put|delete|patch)\(",   # FastAPI route
        r"@router\.(get|post|put|delete)\(",      # FastAPI router
        r"response_model\s*=",                    # FastAPI response_model
        r"model_config\s*=\s*ConfigDict",         # Pydantic v2 config
        r"model_config\s*=\s*\{",                # Pydantic v2 dict config
        r"class Meta:\s*model\s*=",              # DRF ModelSerializer Meta
        r"fields\s*=\s*\[",                      # DRF explicit fields list
    ],
    "typescript": [
        r"interface\s+\w+(DTO|Response|Request|Payload|Schema)",
        r"type\s+\w+(DTO|Response|Request)\s*=",
        r"export\s+(interface|type)\s+\w+",
        r"fetch\(|axios\.|useQuery\(|useMutation\(",
        r"z\.object\(",                            # Zod schema
    ],
    "react": [
        r"props\.\w+",
        r"user\.\w+|response\.\w+|data\.\w+",
        r"useSelector|useAppSelector",
        r"\.userEmail|\.user_email|\.fullName|\.full_name",
    ],
    "sql": [],   # All SQL tables/columns are potential boundary emitters
}


@dataclass
class BoundaryPair:
    emitter: CodeNode
    receiver: CodeNode
    emitter_language: str
    receiver_language: str
    signal: str


def detect_boundary_nodes(all_file_nodes: list) -> list:
    """Find all nodes that are at a cross-language boundary."""
    boundary_nodes = []
    seen_ids = set()

    for node in flatten_tree(all_file_nodes):
        if node.id in seen_ids:
            continue

        is_boundary = False

        # Check language-specific patterns
        patterns = BOUNDARY_PATTERNS.get(node.language, [])
        for pattern in patterns:
            if re.search(pattern, node.source_lines, re.MULTILINE | re.DOTALL):
                node.metadata["is_boundary"] = True
                node.metadata["boundary_signal"] = pattern
                is_boundary = True
                break

        # All SQL tables/columns are potential emitters
        if node.language == "sql" and node.type in ("table", "column"):
            node.metadata["is_boundary"] = True
            is_boundary = True

        if is_boundary:
            boundary_nodes.append(node)
            seen_ids.add(node.id)

    print(f"  Boundary Zone Detector: {len(boundary_nodes)} boundary nodes found")
    return boundary_nodes


def create_boundary_pairs(boundary_nodes: list) -> list:
    """
    Pair boundary nodes across adjacent language layers.
    Language adjacency: sql → python → typescript → react
    Only adjacent layers are paired to scope LLM calls.
    """
    lang_order = ["sql", "python", "typescript", "react", "javascript"]
    pairs = []

    for i in range(len(lang_order) - 1):
        emitter_lang = lang_order[i]
        receiver_lang = lang_order[i + 1]
        emitters = [n for n in boundary_nodes if n.language == emitter_lang]
        receivers = [n for n in boundary_nodes if n.language == receiver_lang]
        for e in emitters:
            for r in receivers:
                pairs.append(BoundaryPair(
                    emitter=e,
                    receiver=r,
                    emitter_language=emitter_lang,
                    receiver_language=receiver_lang,
                    signal=e.metadata.get("boundary_signal", "sql_table")
                ))

    total_nodes = len(flatten_tree(boundary_nodes))
    print(f"  Boundary Zone Detector: {len(pairs)} pairs "
          f"(LLM calls reduced from ~{total_nodes} nodes to {len(pairs)} pairs)")
    return pairs
