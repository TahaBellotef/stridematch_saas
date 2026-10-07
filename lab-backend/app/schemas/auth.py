#
#  File: schemas/auth.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT © 2025 macitch.
#

from pydantic import BaseModel, Field
from typing import Optional


class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class AdminLoginResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token for admin-only endpoints.")
    token_type: str = Field("Bearer", description="Authentication scheme (always 'Bearer').")
    expires_in: Optional[int] = Field(
        None,
        description="Expiration time in seconds when using local admin login.",
    )

    # Cognito-only fields (not used in local admin mode)
    refresh_token: Optional[str] = None
    id_token: Optional[str] = None
    scope: Optional[str] = None