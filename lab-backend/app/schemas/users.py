#
#  File: schemas/users.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT © 2025 macitch.
#

from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict


class UserRecord(BaseModel):
    """Single user entry in admin listings."""
    model_config = ConfigDict(extra="ignore", frozen=True)

    id: Optional[str] = None
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


class UserListResponse(BaseModel):
    """Paginated result containing user profiles."""
    total: int
    users: List[UserRecord]