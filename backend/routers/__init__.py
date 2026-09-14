"""
KSHETRA persistence-layer routers (Step 2 of the persistence plan).

Each module here owns one entity's CRUD endpoints, mounted under /api/* in
backend/main.py alongside the untouched /, /health, and /predict routes.
Nothing in this package imports ai-model/, backend/demo_fallback.py, or
touches /predict's request/response handling in any way.
"""
