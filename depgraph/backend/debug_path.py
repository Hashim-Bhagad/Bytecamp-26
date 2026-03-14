import sys
import os
from pathlib import Path

print(f"CWD: {os.getcwd()}")
print(f"SCRIPT: {__file__}")
print(f"Resolved parent: {Path(__file__).resolve().parent}")
print(f"Resolved grandparent: {Path(__file__).resolve().parent.parent}")
print(f"Initial sys.path[0]: {sys.path[0]}")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
print(f"Updated sys.path[0]: {sys.path[0]}")

try:
    from backend.parsers.dispatcher import parse_repo
    print("Import success!")
except ImportError as e:
    print(f"Import failed: {e}")
    print("sys.path:")
    for p in sys.path:
        print(f"  {p}")
