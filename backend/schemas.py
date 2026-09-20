"""
===============================================================================
KSHETRA: Persistence Layer — Pydantic Schemas
===============================================================================

Pydantic (v2) request/response shapes for the six approved entities,
mirroring src/types/index.ts field-for-field (Python snake_case; the
frontend is not wired to these yet, so no camelCase aliasing has been added).

STEP 1 defined `*Base` / `*Create` / `*Read` per entity. STEP 2 (CRUD
routers, backend/routers/*.py) adds `*Update` schemas for PATCH — every
field Optional so a partial update only touches the fields the caller sent
(`exclude_unset=True` at the call site in backend/crud.py). `AuditLog` and
`Prediction` intentionally have no Update schema: audit rows are an
immutable historical trail (create + read only) and predictions are
append-only (Step 3+ territory, not touched in Step 2).

Each entity has:
  - a `*Base` schema (fields shared by create/read)
  - a `*Create` schema (what a POST endpoint accepts)
  - a `*Update` schema (what a PATCH endpoint accepts — all fields optional)
  - a `*Read` schema (adds server-assigned id/timestamps, `from_attributes`
    enabled so it can be built directly from a models.py ORM instance)
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# -----------------------------------------------------------------------------
# Shared nested structures (mirror the nested interfaces in types/index.ts)
# -----------------------------------------------------------------------------
class CorridorSectionSchema(BaseModel):
    sectionId: str
    name: str
    chainageKm: str
    riskScore: int
    riskLevel: str
    bottleneckCount: int
    description: str


class ECourtRecordSchema(BaseModel):
    caseNumber: str
    cnrNumber: str
    courtName: str
    caseType: str
    filingDate: str
    petitioner: str
    respondent: str
    caseStatus: str
    nextHearingDate: Optional[str] = None
    prayer: str
    interimInjunction: bool


class BhoomiRevenueRecordSchema(BaseModel):
    khataNumber: str
    pattaNumber: str
    landClassification: str
    guidelineValuePerAcre: float
    encumbranceStatus: str
    lastJamabandiDate: str
    subRegistrarOffice: str


class BhuvanGisRecordSchema(BaseModel):
    elevationMeters: float
    distanceToCorridorCenterMeters: float
    intersectionAreaSqM: float
    environmentalZone: str
    waterBodyAdjacent: bool
    satelliteImageDate: str


class ShapFactorSchema(BaseModel):
    factor: str
    impactPercent: float
    shapValue: Optional[float] = None
    category: str
    description: str
    severity: str


class SurvivalMilestoneSchema(BaseModel):
    elapsed_months: float
    delay_free_probability: float
    delay_free_percent: str


class CoxTimeAnalysisSchema(BaseModel):
    reference_origin: str
    elapsed_notification_age_months: Optional[float] = None
    median_delay_free_months_from_notification: Optional[float] = None
    elapsed_past_model_median: Optional[bool] = None
    remaining_time_note: str


class SurvivalAnalysisResultSchema(BaseModel):
    partial_hazard_ratio: float
    hazard_tier: str
    estimated_median_delay_free_milestone: str
    key_hazard_drivers: List[str]
    delay_free_survival_curve: Dict[str, SurvivalMilestoneSchema]
    non_completion_notice: str
    time_analysis: Optional[CoxTimeAnalysisSchema] = None
    survival_definition: Optional[str] = None


# -----------------------------------------------------------------------------
# Project
# -----------------------------------------------------------------------------
class ProjectBase(BaseModel):
    name: str
    code: str
    department: str
    agency: str
    total_length_km: float
    project_value_crores: float
    total_parcels: int
    acquired_parcels: int
    pending_parcels: int
    high_risk_parcels: int
    med_risk_parcels: int
    low_risk_parcels: int
    predicted_delay_months: float
    status: str
    current_larr_stage: str
    corridor_sections: List[CorridorSectionSchema] = []
    corridor_path: List[List[float]] = []
    start_point_name: Optional[str] = None
    end_point_name: Optional[str] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    is_custom_project: Optional[bool] = False
    project_type: Optional[str] = None
    planning_priorities: Optional[List[str]] = None


class ProjectCreate(ProjectBase):
    id: str  # preserved application ID (e.g. "proj-nh79x"), not server-generated


class ProjectUpdate(BaseModel):
    """All fields optional — PATCH /api/projects/{id} only touches what's sent."""

    name: Optional[str] = None
    code: Optional[str] = None
    department: Optional[str] = None
    agency: Optional[str] = None
    total_length_km: Optional[float] = None
    project_value_crores: Optional[float] = None
    total_parcels: Optional[int] = None
    acquired_parcels: Optional[int] = None
    pending_parcels: Optional[int] = None
    high_risk_parcels: Optional[int] = None
    med_risk_parcels: Optional[int] = None
    low_risk_parcels: Optional[int] = None
    predicted_delay_months: Optional[float] = None
    status: Optional[str] = None
    current_larr_stage: Optional[str] = None
    corridor_sections: Optional[List[CorridorSectionSchema]] = None
    corridor_path: Optional[List[List[float]]] = None
    start_point_name: Optional[str] = None
    end_point_name: Optional[str] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    is_custom_project: Optional[bool] = None
    project_type: Optional[str] = None
    planning_priorities: Optional[List[str]] = None


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime


# -----------------------------------------------------------------------------
# Parcel
# -----------------------------------------------------------------------------
class ParcelBase(BaseModel):
    survey_number: str
    ulpin: str
    project_id: str
    project_name: str
    owner_name: str
    co_owners: List[str] = []
    co_owner_count: int
    village: str
    taluk: str
    district: str
    area_acres: float
    area_sq_meters: float
    mutation_status: str
    last_mutation_years_ago: int
    document_status: str
    record_freshness_score: int
    record_confidence: str
    court_case: bool
    court_case_status: str
    ownership_dispute: str
    court_record: Optional[ECourtRecordSchema] = None
    revenue_record: Optional[BhoomiRevenueRecordSchema] = None
    gis_record: Optional[BhuvanGisRecordSchema] = None
    acquisition_status: str
    stage: str
    notification_date: str
    compensation_status: str
    estimated_compensation_crores: float
    possession_status: str
    delay_risk_score: int
    risk_level: str
    predicted_delay_months: float
    predicted_delay_range: str
    delay_confidence: str
    top_risk_factor: str
    ai_explanation: str
    shap_factors: List[ShapFactorSchema] = []
    risk_factors_list: List[str] = []
    delay_probability: Optional[float] = None
    is_real_api_prediction: Optional[bool] = None
    api_error: Optional[str] = None
    survival_analysis: Optional[SurvivalAnalysisResultSchema] = None
    recommended_action: str
    priority: str
    predicted_delay_after_intervention: float
    potential_reduction_months: float
    intervention_status: str
    assigned_officer: Optional[str] = None
    assigned_due_date: Optional[str] = None
    field_verified: bool
    field_verification_notes: Optional[str] = None
    gps_lat: float
    gps_lng: float
    evidence_photo_attached: Optional[bool] = None
    field_verified_at: Optional[str] = None
    map_coordinates: List[List[float]] = []
    center_lat: float
    center_lng: float
    last_synced_at: Optional[str] = None
    sync_status: str


class ParcelCreate(ParcelBase):
    id: str  # preserved application ID (e.g. "P-0245")


class ParcelUpdate(BaseModel):
    """All fields optional — PATCH /api/parcels/{id} only touches what's sent."""

    survey_number: Optional[str] = None
    ulpin: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    owner_name: Optional[str] = None
    co_owners: Optional[List[str]] = None
    co_owner_count: Optional[int] = None
    village: Optional[str] = None
    taluk: Optional[str] = None
    district: Optional[str] = None
    area_acres: Optional[float] = None
    area_sq_meters: Optional[float] = None
    mutation_status: Optional[str] = None
    last_mutation_years_ago: Optional[int] = None
    document_status: Optional[str] = None
    record_freshness_score: Optional[int] = None
    record_confidence: Optional[str] = None
    court_case: Optional[bool] = None
    court_case_status: Optional[str] = None
    ownership_dispute: Optional[str] = None
    court_record: Optional[ECourtRecordSchema] = None
    revenue_record: Optional[BhoomiRevenueRecordSchema] = None
    gis_record: Optional[BhuvanGisRecordSchema] = None
    acquisition_status: Optional[str] = None
    stage: Optional[str] = None
    notification_date: Optional[str] = None
    compensation_status: Optional[str] = None
    estimated_compensation_crores: Optional[float] = None
    possession_status: Optional[str] = None
    delay_risk_score: Optional[int] = None
    risk_level: Optional[str] = None
    predicted_delay_months: Optional[float] = None
    predicted_delay_range: Optional[str] = None
    delay_confidence: Optional[str] = None
    top_risk_factor: Optional[str] = None
    ai_explanation: Optional[str] = None
    shap_factors: Optional[List[ShapFactorSchema]] = None
    risk_factors_list: Optional[List[str]] = None
    delay_probability: Optional[float] = None
    is_real_api_prediction: Optional[bool] = None
    api_error: Optional[str] = None
    survival_analysis: Optional[SurvivalAnalysisResultSchema] = None
    recommended_action: Optional[str] = None
    priority: Optional[str] = None
    predicted_delay_after_intervention: Optional[float] = None
    potential_reduction_months: Optional[float] = None
    intervention_status: Optional[str] = None
    assigned_officer: Optional[str] = None
    assigned_due_date: Optional[str] = None
    field_verified: Optional[bool] = None
    field_verification_notes: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    evidence_photo_attached: Optional[bool] = None
    field_verified_at: Optional[str] = None
    map_coordinates: Optional[List[List[float]]] = None
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    last_synced_at: Optional[str] = None
    sync_status: Optional[str] = None


class ParcelRead(ParcelBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime


# -----------------------------------------------------------------------------
# Alert
# -----------------------------------------------------------------------------
class AlertBase(BaseModel):
    level: str
    title: str
    project_name: str
    project_id: str
    parcel_id: str
    survey_number: str
    risk_score: int
    trigger: str
    reason: str
    recommended_action: str
    created_at_display: str
    status: str
    resolution_notes: Optional[str] = None
    assigned_to: Optional[str] = None


class AlertCreate(AlertBase):
    id: str  # preserved application ID (e.g. "ALT-1092")


class AlertUpdate(BaseModel):
    """All fields optional — PATCH /api/alerts/{id} only touches what's sent."""

    level: Optional[str] = None
    title: Optional[str] = None
    project_name: Optional[str] = None
    project_id: Optional[str] = None
    parcel_id: Optional[str] = None
    survey_number: Optional[str] = None
    risk_score: Optional[int] = None
    trigger: Optional[str] = None
    reason: Optional[str] = None
    recommended_action: Optional[str] = None
    created_at_display: Optional[str] = None
    status: Optional[str] = None
    resolution_notes: Optional[str] = None
    assigned_to: Optional[str] = None


class AlertRead(AlertBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime


# -----------------------------------------------------------------------------
# CaseAction
# -----------------------------------------------------------------------------
class CaseActionBase(BaseModel):
    parcel_id: str
    survey_number: str
    title: str
    action_type: str
    assigned_officer: str
    assigned_officer_role: str
    priority: str
    status: str
    due_date: str
    created_at_display: str
    completed_at: Optional[str] = None
    notes: str
    target_delay_reduction_months: float


class CaseActionCreate(CaseActionBase):
    id: str  # preserved application ID (e.g. "ACT-501")


class CaseActionUpdate(BaseModel):
    """All fields optional — PATCH /api/case-actions/{id} only touches what's sent."""

    parcel_id: Optional[str] = None
    survey_number: Optional[str] = None
    title: Optional[str] = None
    action_type: Optional[str] = None
    assigned_officer: Optional[str] = None
    assigned_officer_role: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    created_at_display: Optional[str] = None
    completed_at: Optional[str] = None
    notes: Optional[str] = None
    target_delay_reduction_months: Optional[float] = None


class CaseActionRead(CaseActionBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime


# -----------------------------------------------------------------------------
# AuditLog — immutable: create + read only, no Update schema on purpose
# (a Step 2 CRUD router exposes GET/POST for this entity, never PATCH/DELETE).
# -----------------------------------------------------------------------------
class AuditLogBase(BaseModel):
    timestamp_display: str
    officer_id: str
    officer_name: str
    role: str
    action: str
    parcel_id: Optional[str] = None
    survey_number: Optional[str] = None
    details: str


class AuditLogCreate(AuditLogBase):
    id: str  # preserved application ID (e.g. "LOG-901")


class AuditLogRead(AuditLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


# -----------------------------------------------------------------------------
# Prediction (append-only; no Update schema is defined on purpose)
# -----------------------------------------------------------------------------
class PredictionBase(BaseModel):
    project_id: str
    parcel_id: Optional[str] = None
    scope: str  # 'project' | 'parcel'
    project_name: str
    generated_at: str
    is_real_api_prediction: bool
    prediction_mode: Optional[str] = None
    api_error: Optional[str] = None
    model_input: Dict[str, Any]
    sample_coverage: Optional[Dict[str, Any]] = None
    input_diagnostics: Optional[Dict[str, Any]] = None
    aggregation_notes: List[str] = []
    delay_probability: float
    delay_risk_score: float
    risk_level: str
    predicted_delay_months: Optional[float] = None
    predicted_delay_range: str
    top_risk_factor: str
    ai_explanation: str
    # STEP 3 NOTE: intentionally List[Dict[str, Any]], NOT List[ShapFactorSchema].
    # ShapFactorSchema (factor/impactPercent/category/description/severity) is the
    # FRONTEND's hand-authored narrative shape (still used, unchanged, by
    # ParcelBase/ParcelUpdate below for seeded/CRUD parcel data). The raw ML
    # pipeline's SHAP output (ai-model/explain.py `top_contributing_factors`,
    # and backend/demo_fallback.py's contribution list) uses entirely different
    # field names (feature_name/input_value/shap_contribution/direction/
    # impact_magnitude/contribution_share) and has no category/description/
    # severity at all. Forcing ShapFactorSchema here would either fail
    # validation outright (required fields missing) or require fabricating
    # category/description/severity text with no model basis — so this field
    # stores the raw contribution dicts verbatim instead. No database column
    # changed (still a plain JSON column in models.py); this is a Pydantic
    # validation-layer relaxation only. See the Step 3 report.
    shap_factors: List[Dict[str, Any]] = []
    survival_analysis: Optional[SurvivalAnalysisResultSchema] = None
    recommended_action: str
    # STEP 9B: nullable — None for every row persisted before this field
    # existed (see models.Prediction.model_version) and for any demo-fallback
    # result (no trained-model artifact produced it). Never fabricated.
    model_version: Optional[str] = None


class PredictionCreate(PredictionBase):
    """No `id` field: predictions are server-generated (UUID) since there is
    no pre-existing frontend ID scheme for this new entity."""


class PredictionRead(PredictionBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


# -----------------------------------------------------------------------------
# PredictionOutcome (Step 9B; append-only — no Update schema on purpose, see
# models.PredictionOutcome and crud.py: no update_prediction_outcome /
# delete_prediction_outcome helper exists).
# -----------------------------------------------------------------------------
# Same value vocabularies already established elsewhere in this codebase
# (legal.enums.SourceType / exposure.enums.ConfidenceLabel), reused verbatim
# here as plain strings rather than imported as Python Enum types — see
# models.PredictionOutcome's class docstring for why the core persistence
# layer never imports from the optional legal/exposure packages.
VALID_OUTCOME_SOURCE_TYPES = [
    "OFFICIAL_GAZETTE",
    "COURT_RECORD",
    "GOVERNMENT_PORTAL",
    "REGISTERED_RECORD",
    "FIELD_VERIFICATION",
    "IMPORTED_SYSTEM",
    "MANUAL_ENTRY",
    "SYNTHETIC_DEMO",
]

VALID_OUTCOME_CONFIDENCE_LABELS = [
    "VERIFIED",
    "PARTIAL",
    "NEEDS_VERIFICATION",
    "INSUFFICIENT",
]


class PredictionOutcomeBase(BaseModel):
    actual_event_occurred: bool
    actual_duration_months: Optional[float] = None
    actual_completion_date: Optional[date] = None
    observed_as_of_date: date
    source_type: str  # one of VALID_OUTCOME_SOURCE_TYPES
    evidence_reference: Optional[str] = None
    # Defaults False: an outcome is only "entered/reported" until a caller
    # explicitly asserts it is independently confirmed. Never defaults to
    # True (see models.PredictionOutcome's class docstring).
    verified: bool = False
    confidence: Optional[str] = None  # one of VALID_OUTCOME_CONFIDENCE_LABELS
    entered_by: str

    @field_validator("source_type")
    @classmethod
    def _validate_source_type(cls, value: str) -> str:
        if value not in VALID_OUTCOME_SOURCE_TYPES:
            raise ValueError(f"source_type must be one of {VALID_OUTCOME_SOURCE_TYPES}")
        return value

    @field_validator("confidence")
    @classmethod
    def _validate_confidence(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VALID_OUTCOME_CONFIDENCE_LABELS:
            raise ValueError(f"confidence must be one of {VALID_OUTCOME_CONFIDENCE_LABELS}")
        return value


class PredictionOutcomeCreate(PredictionOutcomeBase):
    """No `id`/`prediction_id`/`project_id`/`parcel_id`: `prediction_id` comes
    from the POST URL path, and `project_id`/`parcel_id` are always derived
    server-side from that Prediction row (routers/prediction_outcomes.py) —
    never accepted as free-form client input, so an outcome can never
    disagree with the prediction it links to."""


class PredictionOutcomeRead(PredictionOutcomeBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    prediction_id: str
    project_id: str
    parcel_id: Optional[str] = None
    created_at: datetime
