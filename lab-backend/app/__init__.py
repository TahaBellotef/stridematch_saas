"""
Application package for the SMLab FastAPI service.

IMPORTANT:
- This file must remain SIDE-EFFECT FREE.
- Do NOT import FastAPI app or routers here.
"""

from pathlib import Path
import sys

# Ensure shared modules (core/, data/, config/, etc.) are importable
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.append(str(_PROJECT_ROOT))

# ❌ DO NOT import create_app here
# from .main import create_app