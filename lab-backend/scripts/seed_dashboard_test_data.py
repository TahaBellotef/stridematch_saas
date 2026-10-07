#
#  File: scripts/seed_dashboard_test_data.py
#  Project: StrideMatchLab
#
#  Inserts synthetic customers / foot scans / gait analyses spread across the
#  past 12 months into the default dev organization, so the dashboard date
#  filter (This Week / This Month / This Year / custom range) has real
#  variation to show instead of everything clustered on the last few days.
#
#  All synthetic rows are tagged so they can be identified and removed later:
#    - CustomerProfileModel.email LIKE 'seed-runner-%@stridematch-test.local'
#
#  Usage:
#    .venv/Scripts/python.exe scripts/seed_dashboard_test_data.py
#

from __future__ import annotations

import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.engine import SessionLocal
import app.models.tenant  # noqa: F401 - registers OrganizationModel/StoreModel as FK targets
from app.models.customer_profile import CustomerProfileModel
from app.models.foot_scan import FootScanResultModel, FootScanSessionModel
from app.models.session import AnalysisSessionModel

ORGANIZATION_ID = "66f4489a222741c9b917a432bc006cc3"
DAYS_BACK = 365
NUM_CUSTOMERS = 45

random.seed(42)

_EXPERIENCE_VALUES = [
    "Less than 6 months",
    "6 months to 1 year",
    "1 year to 3 years",
    "More than 3 years",
]
_FREQUENCY_VALUES = ["One", "2 to 3", "4 to 5", "Everyday"]
_GIVEN_NAMES = ["Sam", "Riley", "Jordan", "Casey", "Morgan", "Avery", "Taylor", "Drew", "Reese", "Quinn"]
_FAMILY_NAMES = ["Carter", "Bennett", "Nguyen", "Garcia", "Müller", "Kovac", "Diallo", "Haddad", "Russo", "Park"]


def _utc(d: datetime) -> datetime:
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d


def main() -> None:
    db = SessionLocal()
    now = _utc(datetime.now(timezone.utc))

    print(f"Seeding {NUM_CUSTOMERS} customers + scans/analyses over the past {DAYS_BACK} days...")

    customers: list[CustomerProfileModel] = []
    for i in range(NUM_CUSTOMERS):
        # Spread customer signup dates across the full year, weighted toward
        # "older" customers having had more time to accumulate repeat scans.
        days_ago = int(random.triangular(0, DAYS_BACK, DAYS_BACK * 0.7))
        created_at = now - timedelta(days=days_ago, hours=random.randint(0, 23))

        given = random.choice(_GIVEN_NAMES)
        family = random.choice(_FAMILY_NAMES)
        customer = CustomerProfileModel(
            id=uuid.uuid4().hex,
            email=f"seed-runner-{i:03d}@stridematch-test.local",
            customer_id=None,
            organization_id=ORGANIZATION_ID,
            given_name=given,
            family_name=family,
            full_name=f"{given} {family}",
            sex=random.choice(["male", "female"]),
            age=random.choice([random.randint(8, 12), random.randint(13, 17)] + [random.randint(18, 65)] * 4),
            weight=round(random.uniform(50, 95), 1),
            height=round(random.uniform(155, 195), 1),
            running_duration=random.choice(_EXPERIENCE_VALUES),
            runs_per_week=random.choice(_FREQUENCY_VALUES),
            shoe_size=str(random.choice([38, 39, 40, 41, 42, 43, 44, 45])),
            shoe_size_unit="EU",
            created_at=created_at,
            updated_at=created_at,
        )
        db.add(customer)
        customers.append(customer)

    db.flush()

    pronations = ["pronation", "neutral", "supination", None]
    analysis_types = ["rear", "side", None]
    statuses_scan = ["completed"] * 9 + ["pending"]
    statuses_analysis = ["completed"] * 8 + ["pending", "failed"]

    scan_count = 0
    analysis_count = 0

    for customer in customers:
        created_at = _utc(customer.created_at)
        days_since_signup = max(1, (now - created_at).days)

        # Returning customers get 2-6 scans across their lifetime; some
        # customers only ever did their first scan (no repeat).
        num_scans = random.choice([1, 1, 2, 2, 3, 4, 5, 6])
        scan_dates = sorted(
            created_at + timedelta(days=random.randint(0, days_since_signup), hours=random.randint(0, 23))
            for _ in range(num_scans)
        )
        # First scan always anchored to signup day (acquisition event).
        scan_dates[0] = created_at

        for scan_date in scan_dates:
            session = FootScanSessionModel(
                id=uuid.uuid4().hex,
                created_at=scan_date,
                completed_at=scan_date + timedelta(minutes=random.randint(2, 15)),
                status=random.choice(statuses_scan),
                customer_id=customer.id,
                overall_confidence=round(random.uniform(0.65, 0.99), 2),
                organization_id=ORGANIZATION_ID,
                recommendation={"eu": random.choice([40, 41, 42, 43, 44]), "confidence": round(random.uniform(0.7, 0.98), 2)}
                if random.random() < 0.7
                else None,
            )
            db.add(session)
            db.flush()  # FootScanResultModel below has no ORM relationship() to
            # the session, so the unit-of-work can't infer insert ordering -
            # flush now to make sure the FK target row exists in the DB first.
            scan_count += 1

            warnings: list[str] = []
            roll = random.random()
            if roll < 0.15:
                warnings = ["Unusual length detected"]
            elif roll < 0.25:
                warnings = ["Unusual width detected"]
            elif roll < 0.32:
                warnings = ["Unusual ratio detected"]

            result = FootScanResultModel(
                job_id=uuid.uuid4().hex,
                session_id=session.id,
                created_at=scan_date,
                completed_at=scan_date + timedelta(minutes=random.randint(2, 15)),
                status="completed",
                foot="left",
                confidence={
                    "overall": round(random.uniform(0.65, 0.99), 2),
                    "calibration": round(random.uniform(0.7, 1.0), 2),
                    "segmentation": round(random.uniform(0.7, 1.0), 2),
                    "measurement": round(random.uniform(0.7, 1.0), 2),
                    "warnings": warnings,
                },
            )
            db.add(result)

        # Gait analyses: roughly half as frequent as foot scans.
        num_analyses = random.choice([0, 1, 1, 2, 2, 3])
        for _ in range(num_analyses):
            analysis_date = created_at + timedelta(
                days=random.randint(0, days_since_signup), hours=random.randint(0, 23)
            )
            analysis = AnalysisSessionModel(
                id=uuid.uuid4().hex,
                created_at=analysis_date,
                status=random.choice(statuses_analysis),
                runner_profile={},
                customer_id=customer.id,
                customer_first_name=customer.given_name,
                customer_last_name=customer.family_name,
                customer_email=customer.email,
                analysis_type=random.choice(analysis_types),
                required_captures=[],
                completed_captures=[],
                inferred_pronation=random.choice(pronations),
                organization_id=ORGANIZATION_ID,
            )
            db.add(analysis)
            analysis_count += 1

    db.commit()
    db.close()

    print(f"Inserted {len(customers)} customers, {scan_count} foot scan sessions, {analysis_count} gait analyses.")
    print("To remove this seed data later:")
    print(
        "  DELETE FROM foot_scan_results WHERE session_id IN "
        "(SELECT id FROM foot_scan_sessions WHERE customer_id IN "
        "(SELECT id FROM customer_profiles WHERE email LIKE 'seed-runner-%@stridematch-test.local'));"
    )
    print(
        "  DELETE FROM foot_scan_sessions WHERE customer_id IN "
        "(SELECT id FROM customer_profiles WHERE email LIKE 'seed-runner-%@stridematch-test.local');"
    )
    print(
        "  DELETE FROM analysis_sessions WHERE customer_id IN "
        "(SELECT id FROM customer_profiles WHERE email LIKE 'seed-runner-%@stridematch-test.local');"
    )
    print("  DELETE FROM customer_profiles WHERE email LIKE 'seed-runner-%@stridematch-test.local';")


if __name__ == "__main__":
    main()
