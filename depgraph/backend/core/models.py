from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class CodeNode:
    id: str              # unique: "schema.sql::users::user_email"
    type: str            # repo | file | class | table | function | column | variable
    language: str        # sql | python | typescript | react | javascript
    name: str            # "user_email"
    source_lines: str    # raw source code of this node
    file: str            # "schema.sql"
    line_start: int
    line_end: int
    children: List['CodeNode'] = field(default_factory=list)
    parent_id: Optional[str] = None
    summary: str = ""            # filled by LLM in Layer 4
    metadata: dict = field(default_factory=dict)
    # metadata keys:
    #   sensitivity: "none" | "low" | "medium" | "high" | "pii"
    #   data_in: List[str]       — fields this node receives
    #   data_out: List[str]      — fields this node exposes
    #   transformations: List[str] — e.g. ["snake_to_camel", "null_stripped"]
    #   boundary_signals: List[str] — patterns that flagged this node
    #   is_boundary: bool
    #   test_coverage: bool      — does test file reference this node?
    #   inferred_by: str         — "ast" | "naming" | "llm"
    #   confidence: float        — 0.0–1.0
