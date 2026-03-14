import os
import stat

HOOK_SCRIPT = '''#!/bin/sh
echo "DepGraph.ai: checking cross-language impact..."
python -m backend.git.pre_commit_hook
if [ $? -ne 0 ]; then
    echo ""
    echo "Use git commit --no-verify to skip this check."
    exit 1
fi
'''


def install_pre_commit_hook(repo_path: str):
    """Install the DepGraph.ai pre-commit hook in a git repository."""
    git_dir = os.path.join(repo_path, ".git")
    if not os.path.exists(git_dir):
        print(f"Error: {repo_path} is not a git repository (no .git directory)")
        return False

    hook_path = os.path.join(git_dir, "hooks", "pre-commit")
    with open(hook_path, "w", newline='\n') as f:
        f.write(HOOK_SCRIPT)

    # Make executable
    st = os.stat(hook_path)
    os.chmod(hook_path, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    print(f"✓ DepGraph.ai pre-commit hook installed at {hook_path}")
    return True


if __name__ == "__main__":
    import sys
    repo = sys.argv[1] if len(sys.argv) > 1 else "."
    install_pre_commit_hook(os.path.abspath(repo))
