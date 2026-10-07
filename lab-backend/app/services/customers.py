# app/services/customers.py
"""Shared customer profile lookup (by id, customer_id, or email)."""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.customer_profile import CustomerProfileModel


def find_customer_profile(
    db: Session,
    identifier: str,
    organization_id: Optional[str] = None,
    is_superadmin: bool = False,
) -> Optional[CustomerProfileModel]:
    """Look up a customer by primary key id, business customer_id, or email."""
    query = db.query(CustomerProfileModel)
    if not is_superadmin and organization_id is not None:
        query = query.filter(CustomerProfileModel.organization_id == organization_id)

    for attr in (CustomerProfileModel.id, CustomerProfileModel.customer_id, CustomerProfileModel.email):
        profile = query.filter(attr == identifier).one_or_none()
        if profile:
            return profile
    return None


def customer_display_name(profile: CustomerProfileModel) -> str:
    if profile.full_name:
        return profile.full_name
    joined = " ".join(part for part in [profile.given_name, profile.family_name] if part)
    return joined or profile.email
