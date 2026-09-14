"""
Test package for the blocker engine (backend/blockers/). Uses Python's
built-in `unittest` (project convention -- see backend/legal/tests/__init__.py;
no pytest dependency is added). Run from the `backend/` directory:

    python -m unittest discover -s blockers/tests -p "test_*.py" -v

This bootstrap puts `backend/` on sys.path (mirroring backend/legal/tests/__init__.py
and backend/main.py's own flat-import convention), so every test module can
`from blockers.xxx import ...` and `from legal.xxx import ...` regardless of
the working directory `unittest` was invoked from.
"""

import os
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
