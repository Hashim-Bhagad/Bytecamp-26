import subprocess
import os
import re
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))


def get_changed_files(repo_path: str, mode: str = "staged") -> list[str]:
    """
    Get list of changed files from git.
    mode="staged": files staged for commit (pre-commit hook use case)
    mode="pr":     files changed vs main branch (CI use case)
    mode="last":   files changed in last commit
    """
    cmds = {
        "staged": ["git", "diff", "--cached", "--name-only"],
        "pr":     ["git", "diff", "--name-only", "origin/main...HEAD"],
        "last":   ["git", "diff", "--name-only", "HEAD~1", "HEAD"]
    }
    cmd = cmds.get(mode, cmds["staged"])
    try:
        result = subprocess.run(
            cmd, cwd=repo_path, capture_output=True, text=True, timeout=10
        )
        files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
        return files
    except Exception as e:
        print(f"  [GIT WARN] get_changed_files failed: {e}")
        return []


def get_changed_node_ids(G, repo_path: str, mode: str = "staged") -> list[dict]:
    """Map changed files to affected graph nodes."""
    changed_files = get_changed_files(repo_path, mode)
    changed_nodes = []
    for filepath in changed_files:
        for node_id, data in G.nodes(data=True):
            node_file = data.get("file", "")
            # Match by suffix (relative path vs absolute)
            if node_file.endswith(filepath) or filepath in node_file:
                changed_nodes.append({
                    "node_id": node_id,
                    "name": data.get("name", ""),
                    "language": data.get("language", ""),
                    "file": filepath
                })
    return changed_nodes


def get_renames_from_diff(repo_path: str) -> list[tuple[str, str]]:
    """Extract (old_name, new_name) pairs from staged diff lines."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "-U0"],
            cwd=repo_path, capture_output=True, text=True, timeout=10
        )
    except Exception:
        return []

    renames = []
    lines = result.stdout.split("\n")
    for i, line in enumerate(lines[:-1]):
        if line.startswith("-") and not line.startswith("---"):
            old_ids = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]{2,})\b', line[1:])
            next_line = lines[i + 1]
            if next_line.startswith("+") and not next_line.startswith("+++"):
                new_ids = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]{2,})\b', next_line[1:])
                for old, new in zip(old_ids, new_ids):
                    if old != new:
                        renames.append((old, new))
    return renames
