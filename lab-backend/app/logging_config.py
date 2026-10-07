#
#  File: logging_config.py
#  Project: StrideMatchLab
#  Structured JSON logging with request/job correlation IDs.
#

from __future__ import annotations

import logging
import os
import uuid
from contextvars import ContextVar

from pythonjsonlogger.json import JsonFormatter

# -----------------------------------------------------------------------------
# Context variables for correlation IDs
# -----------------------------------------------------------------------------

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
job_id_var: ContextVar[str] = ContextVar("job_id", default="-")
user_id_var: ContextVar[str] = ContextVar("user_id", default="-")


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]


# -----------------------------------------------------------------------------
# Custom filter that injects context vars into every log record
# -----------------------------------------------------------------------------

class CorrelationFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("-")  # type: ignore[attr-defined]
        record.job_id = job_id_var.get("-")  # type: ignore[attr-defined]
        record.user_id = user_id_var.get("-")  # type: ignore[attr-defined]
        return True


# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------

def setup_logging() -> None:
    """Configure root logger with JSON formatting and correlation IDs."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    use_json = os.getenv("LOG_FORMAT", "json").lower() == "json"

    root = logging.getLogger()
    root.setLevel(getattr(logging, log_level, logging.INFO))

    # Remove any existing handlers (prevents duplicate output)
    root.handlers.clear()

    handler = logging.StreamHandler()
    handler.addFilter(CorrelationFilter())

    if use_json:
        formatter = JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s "
                "%(request_id)s %(job_id)s %(user_id)s",
            rename_fields={
                "asctime": "timestamp",
                "levelname": "level",
                "name": "logger",
            },
        )
    else:
        formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] %(name)s "
            "[req=%(request_id)s job=%(job_id)s] %(message)s"
        )

    handler.setFormatter(formatter)
    root.addHandler(handler)
