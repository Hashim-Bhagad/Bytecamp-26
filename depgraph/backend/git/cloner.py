import os
import hashlib
from git import Repo
import shutil

CLONE_DIR = "clones"

def clone_repo(url: str) -> str:
    """
    Clone a GitHub repository to a local cache directory.
    Returns the absolute path to the cloned repository.
    """
    if not os.path.exists(CLONE_DIR):
        os.makedirs(CLONE_DIR)

    # Create a unique directory name based on URL hash
    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
    repo_name = url.split("/")[-1].replace(".git", "")
    target_path = os.path.abspath(os.path.join(CLONE_DIR, f"{repo_name}_{url_hash}"))

    if os.path.exists(target_path):
        print(f"  [Git] Using cached clone at {target_path}")
        return target_path

    print(f"  [Git] Cloning {url} to {target_path}...")
    Repo.clone_from(url, target_path, depth=1)
    return target_path

def cleanup_clones():
    """Remove the clones directory."""
    if os.path.exists(CLONE_DIR):
        shutil.rmtree(CLONE_DIR)
