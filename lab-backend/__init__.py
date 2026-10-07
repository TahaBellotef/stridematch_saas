"""
Backend package initializer for the SMLab API.

This module intentionally keeps side effects to a minimum so the package can be
imported in different contexts (tests, CLI tooling, etc.) without configuring
the FastAPI application.
"""

from pathlib import Path
import sys

# Ensure project root is importable so shared modules (core/, data/, etc.)
# remain accessible when the backend package is executed as an entry point.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.append(str(_PROJECT_ROOT))

__all__ = []
