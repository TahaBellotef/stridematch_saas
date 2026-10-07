from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.runner_profile import RunnerProfileModel
from app.schemas.runner_profile_api import RunnerProfileCreate, RunnerProfileUpdate


def get_by_sub(db: Session, sub: str) -> Optional[RunnerProfileModel]:
    return (
        db.query(RunnerProfileModel)
        .filter(RunnerProfileModel.cognito_sub == sub)
        .one_or_none()
    )


def get_by_id(db: Session, profile_id: str) -> Optional[RunnerProfileModel]:
    return db.get(RunnerProfileModel, profile_id)


def _apply(model: RunnerProfileModel, payload: dict) -> None:
    for key, value in payload.items():
        setattr(model, key, value)


def upsert_for_sub(db: Session, sub: str, data: RunnerProfileCreate) -> RunnerProfileModel:
    payload = data.model_dump(exclude_unset=True, by_alias=False)
    model = get_by_sub(db, sub)
    if model is None:
        model = RunnerProfileModel(cognito_sub=sub)
        db.add(model)
    _apply(model, payload)
    db.commit()
    db.refresh(model)
    return model


def update_for_sub(db: Session, sub: str, data: RunnerProfileUpdate) -> Optional[RunnerProfileModel]:
    model = get_by_sub(db, sub)
    if model is None:
        return None
    _apply(model, data.model_dump(exclude_unset=True, by_alias=False))
    db.commit()
    db.refresh(model)
    return model


def update_analysis(
    db: Session, sub: str, job_id: Optional[str], pronation: Optional[str]
) -> RunnerProfileModel:
    """Called by the analysis-completion path. Analysis value wins over client seed."""
    model = get_by_sub(db, sub)
    if model is None:
        model = RunnerProfileModel(cognito_sub=sub)
        db.add(model)
    model.pronation = pronation
    model.latest_analysis_job_id = job_id
    db.commit()
    db.refresh(model)
    return model
