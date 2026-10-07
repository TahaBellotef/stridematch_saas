from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import require_user, is_admin
from app.db.deps import get_db
from app.schemas.runner_profile_api import (
    RunnerProfileCreate,
    RunnerProfileUpdate,
    RunnerProfileResponse,
)
from app.services import runner_profile as svc

router = APIRouter(prefix="/runners/profile", tags=["runner-profile"])


@router.post("", response_model=RunnerProfileResponse)
def create_profile(
    body: RunnerProfileCreate,
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    return svc.upsert_for_sub(db, claims["sub"], body)


@router.get("", response_model=RunnerProfileResponse)
def get_my_profile(
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    model = svc.get_by_sub(db, claims["sub"])
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    return model


@router.put("", response_model=RunnerProfileResponse)
def update_my_profile(
    body: RunnerProfileUpdate,
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    model = svc.update_for_sub(db, claims["sub"], body)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    return model


@router.get("/{profile_id}", response_model=RunnerProfileResponse)
def get_profile_by_id(
    profile_id: str,
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    model = svc.get_by_id(db, profile_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    if model.cognito_sub != claims["sub"] and not is_admin(claims):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return model


@router.put("/{profile_id}", response_model=RunnerProfileResponse)
def update_profile_by_id(
    profile_id: str,
    body: RunnerProfileUpdate,
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    model = svc.get_by_id(db, profile_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    if model.cognito_sub != claims["sub"] and not is_admin(claims):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return svc.update_for_sub(db, model.cognito_sub, body)
