import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.core.models import CodeNode
from backend.parsers.sql_parser import parse_sql_file
from backend.parsers.python_parser import parse_python_file
from backend.parsers.typescript_parser import parse_typescript_file


SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.venv', 'dist', 'build', '.next', 'coverage'}


def parse_file(filepath: str) -> 'CodeNode | None':
    """Route file to correct parser based on extension."""
    ext = os.path.splitext(filepath)[1].lower()
    if ext in ('.sql', '.psql'):
        return parse_sql_file(filepath)
    elif ext == '.py':
        return parse_python_file(filepath)
    elif ext in ('.ts', '.tsx', '.js', '.jsx'):
        return parse_typescript_file(filepath)
    return None


def parse_repo(repo_path: str) -> list:
    """Parse all supported files in a repo. Returns list of root CodeNodes."""
    file_nodes = []
    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            filepath = os.path.join(root, f)
            try:
                node = parse_file(filepath)
                if node:
                    file_nodes.append(node)
            except Exception as e:
                print(f"  [WARN] Failed to parse {filepath}: {e}")
    return file_nodes


def flatten_tree(nodes: list) -> list:
    """Flatten a list of root CodeNodes into a flat list of all CodeNodes (DFS)."""
    result = []

    def _walk(node):
        result.append(node)
        for child in node.children:
            _walk(child)

    for n in nodes:
        _walk(n)
    return result


def build_node_index(file_nodes: list) -> dict:
    """Build a {node_id: CodeNode} index from a list of root file nodes."""
    return {n.id: n for n in flatten_tree(file_nodes)}
