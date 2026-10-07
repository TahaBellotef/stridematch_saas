# db/models.py
# Import all models so Alembic can see them

from app.models.customer_profile import CustomerProfileModel
from app.models.session import AnalysisSessionModel
from app.models.foot_scan import FootScanSessionModel, FootScanResultModel
from app.models.tenant import OrganizationModel, StoreModel, UserOrgMembershipModel
from app.models.runner_profile import RunnerProfileModel
