from dotenv import load_dotenv
load_dotenv()

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

_is_lambda = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
_is_sqlite = DATABASE_URL.startswith("sqlite")


def _pool_kwargs() -> dict:
    if _is_sqlite:
        # SQLite (tests / local dev): no connection pooling args
        if DATABASE_URL in ("sqlite:///:memory:", "sqlite://"):
            return {"poolclass": StaticPool}
        return {"poolclass": NullPool}
    if _is_lambda:
        return {"poolclass": NullPool}
    return {
        "pool_pre_ping": True,
        "pool_size": 5,
        "max_overflow": 10,
        "pool_recycle": 1800,
        "pool_timeout": 30,
    }


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    future=True,
    **_pool_kwargs(),
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True,
)
