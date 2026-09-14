"""
Test package for the statutory clock engine (backend/legal/).

Uses Python's built-in `unittest` (no new dependency added — pytest is not
installed in this project's Python environment). Run from the `backend/`
directory:

    python -m unittest discover -s legal/tests -p "test_*.py" -v

This bootstrap puts `backend/` on sys.path (mirroring the flat-import
convention already used by backend/main.py and backend/migrations/env.py),
so every test module can `from legal.xxx import ...` regardless of the
working directory `unittest` was invoked from.
"""

import os
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
