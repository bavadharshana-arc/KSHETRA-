"""
Test package for the core persistence layer (backend/models.py, crud.py,
schemas.py, routers/predictions.py, routers/prediction_outcomes.py). Uses
Python's built-in `unittest` (project convention -- see
backend/blockers/tests/__init__.py; no pytest dependency is added). Run from
the `backend/` directory:

    python -m unittest discover -s tests -p "test_*.py" -v

This bootstrap puts `backend/` on sys.path (mirroring
backend/blockers/tests/__init__.py's own convention), so every test module
can `import models`, `import crud`, `from routers import ...`, etc.
regardless of the working directory `unittest` was invoked from.
"""

import os
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
