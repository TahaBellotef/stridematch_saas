#
#  File: public.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT © 2025 macitch.
#

from fastapi import APIRouter

# Public routes have been retired now that AWS Cognito handles onboarding.
# The router remains to preserve include_router() calls without exposing endpoints.
router = APIRouter(prefix="/public", tags=["Public"])
