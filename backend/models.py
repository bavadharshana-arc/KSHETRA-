"""
===============================================================================
KSHETRA: Persistence Layer — SQLAlchemy ORM Models
===============================================================================

STEP 1 OF THE PERSISTENCE PLAN. Mirrors the six approved entities from
src/types/index.ts field-for-field:

    Project      -> projects
    Parcel       -> parcels
    Alert        -> alerts
    CaseAction   -> case_actions
    AuditLog     -> audit_logs
    ProjectPrediction -> predictions   (NEW table; no prior storage existed)

This file does NOT modify src/types/index.ts, ai-model/, or
backend/demo_fallback.py, and is not imported by backend/main.py yet — no
router or endpoint reads/writes through these models in this phase. Only
additive, backend-only bookkeeping columns (created_at/updated_at) are
introduced beyond what the frontend types currently carry.

PostgreSQL/PostGIS migration notes (why the schema looks the way it does):
  - Primary keys are TEXT/string, preserving the app's existing
    human-readable IDs (P-0245, proj-nh79x, ALT-1092, ACT-501, LOG-901)
    rather than switching to SQLite/Postgres autoincrement integers.
  - `predictions` is brand new (no prior ID scheme to preserve), so its
    primary key is a server-generated UUID hex string.
  - Every POINT-like coordinate (parcel GPS, parcel polygon center, project
    start/end) is stored as scalar FLOAT lat/lng columns, NOT JSON. That is
    what lets a later PostGIS migration add a generated `geom` POINT column
    via `ST_MakePoint(lng, lat)` with a one-line UPDATE, no reshaping.
  - POLYGON/LINESTRING-like arrays (parcel boundary `mapCoordinates`,
    project `corridorPath`) stay as JSON for now — SQLite has no native
    geometry type. These are the one field group that needs a dedicated
    migration step (JSON -> PostGIS geometry) later; everything else is a
    `DATABASE_URL` swap.
  - Other structured/nested objects that are today free-form on the frontend
    (ECourtRecord, BhoomiRevenueRecord, BhuvanGisRecord, ShapFactor[],
    SurvivalAnalysisResult, corridor sections, co-owners, risk-factor lists)
    are SQLAlchemy JSON columns — identical on SQLite (TEXT) and PostgreSQL
    (JSONB); no application code change needed when migrating.
  - `notification_date`, `assigned_due_date`, `last_synced_at`, and the
    `*_display` timestamp columns are kept as the same display STRINGS the
    frontend already produces (e.g. "12-Jan-2024", "2026-08-23 14:30")
    rather than parsed into DATETIME, to avoid any behavior change in this
    phase. `created_at`/`updated_at` are the real DB-level timestamps used
    for ordering (see Prediction below).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base


def _uuid_hex() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    """Mirrors `Project` in src/types/index.ts."""

    __tablename__ = "projects"

    id = Column(String, primary_key=True)  # e.g. "proj-nh79x" — preserved as-is
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)
    department = Column(String, nullable=False)
    agency = Column(String, nullable=False)  # 'NHAI' | 'Railways' | 'State PWD' | 'SIPCOT' | 'TN Metrorail'
    total_length_km = Column(Float, nullable=False)
    project_value_crores = Column(Float, nullable=False)
    total_parcels = Column(Integer, nullable=False)
    acquired_parcels = Column(Integer, nullable=False)
    pending_parcels = Column(Integer, nullable=False)
    high_risk_parcels = Column(Integer, nullable=False)
    med_risk_parcels = Column(Integer, nullable=False)
    low_risk_parcels = Column(Integer, nullable=False)
    predicted_delay_months = Column(Float, nullable=False)
    status = Column(String, nullable=False)  # 'On Track' | 'At Risk' | 'Delayed'
    current_larr_stage = Column(String, nullable=False)  # LarrStage

    corridor_sections = Column(JSON, nullable=False, default=list)  # Project.corridorSections[]
    corridor_path = Column(JSON, nullable=False, default=list)  # [lat,lng][] — JSON for now, see module docstring

    start_point_name = Column(String, nullable=True)
    end_point_name = Column(String, nullable=True)
    # Scalar lat/lng, not JSON — PostGIS-ready POINT fields (see module docstring).
    start_lat = Column(Float, nullable=True)
    start_lng = Column(Float, nullable=True)
    end_lat = Column(Float, nullable=True)
    end_lng = Column(Float, nullable=True)

    is_custom_project = Column(Boolean, nullable=True, default=False)
    project_type = Column(String, nullable=True)
    planning_priorities = Column(JSON, nullable=True)  # list[str]

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    parcels = relationship("Parcel", back_populates="project", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="project", cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="project", cascade="all, delete-orphan")


class Parcel(Base):
    """Mirrors `Parcel` in src/types/index.ts."""

    __tablename__ = "parcels"

    id = Column(String, primary_key=True)  # e.g. "P-0245" — preserved as-is
    survey_number = Column(String, nullable=False)
    ulpin = Column(String, nullable=False)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    project_name = Column(String, nullable=False)  # denormalized echo, matches Parcel.projectName

    owner_name = Column(String, nullable=False)
    co_owners = Column(JSON, nullable=False, default=list)  # list[str]
    co_owner_count = Column(Integer, nullable=False)

    village = Column(String, nullable=False)
    taluk = Column(String, nullable=False)
    district = Column(String, nullable=False)
    area_acres = Column(Float, nullable=False)
    area_sq_meters = Column(Float, nullable=False)

    mutation_status = Column(String, nullable=False)
    last_mutation_years_ago = Column(Integer, nullable=False)
    document_status = Column(String, nullable=False)
    record_freshness_score = Column(Integer, nullable=False)
    record_confidence = Column(String, nullable=False)

    court_case = Column(Boolean, nullable=False, default=False)
    court_case_status = Column(String, nullable=False)
    ownership_dispute = Column(String, nullable=False)
    court_record = Column(JSON, nullable=True)  # ECourtRecord | undefined
    revenue_record = Column(JSON, nullable=True)  # BhoomiRevenueRecord | undefined
    gis_record = Column(JSON, nullable=True)  # BhuvanGisRecord | undefined

    acquisition_status = Column(String, nullable=False)
    stage = Column(String, nullable=False)  # LarrStage
    notification_date = Column(String, nullable=False)  # display string, see module docstring
    compensation_status = Column(String, nullable=False)
    estimated_compensation_crores = Column(Float, nullable=False)
    possession_status = Column(String, nullable=False)

    delay_risk_score = Column(Integer, nullable=False)
    risk_level = Column(String, nullable=False)  # RiskLevel
    predicted_delay_months = Column(Float, nullable=False)
    predicted_delay_range = Column(String, nullable=False)
    delay_confidence = Column(String, nullable=False)
    top_risk_factor = Column(String, nullable=False)
    ai_explanation = Column(Text, nullable=False)
    shap_factors = Column(JSON, nullable=False, default=list)  # ShapFactor[]
    risk_factors_list = Column(JSON, nullable=False, default=list)  # list[str]

    delay_probability = Column(Float, nullable=True)
    is_real_api_prediction = Column(Boolean, nullable=True)
    api_error = Column(Text, nullable=True)
    survival_analysis = Column(JSON, nullable=True)  # SurvivalAnalysisResult | undefined

    recommended_action = Column(Text, nullable=False)
    priority = Column(String, nullable=False)
    predicted_delay_after_intervention = Column(Float, nullable=False)
    potential_reduction_months = Column(Float, nullable=False)
    intervention_status = Column(String, nullable=False)
    assigned_officer = Column(String, nullable=True)
    assigned_due_date = Column(String, nullable=True)  # display string

    field_verified = Column(Boolean, nullable=False, default=False)
    field_verification_notes = Column(Text, nullable=True)
    # Scalar lat/lng, not JSON — PostGIS-ready POINT fields (see module docstring).
    gps_lat = Column(Float, nullable=False)
    gps_lng = Column(Float, nullable=False)
    evidence_photo_attached = Column(Boolean, nullable=True)
    field_verified_at = Column(String, nullable=True)  # display string

    map_coordinates = Column(JSON, nullable=False, default=list)  # polygon [lat,lng][] — JSON for now
    center_lat = Column(Float, nullable=False)
    center_lng = Column(Float, nullable=False)

    last_synced_at = Column(String, nullable=True)  # display string; simulated sync only, see [[status-truthfulness]]
    sync_status = Column(String, nullable=False)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    project = relationship("Project", back_populates="parcels")
    alerts = relationship("Alert", back_populates="parcel", cascade="all, delete-orphan")
    case_actions = relationship("CaseAction", back_populates="parcel", cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="parcel", cascade="all, delete-orphan")


class Alert(Base):
    """Mirrors `Alert` in src/types/index.ts."""

    __tablename__ = "alerts"

    id = Column(String, primary_key=True)  # e.g. "ALT-1092" — preserved as-is
    level = Column(String, nullable=False)  # 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO'
    title = Column(String, nullable=False)
    project_name = Column(String, nullable=False)  # denormalized echo, matches Alert.projectName
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    parcel_id = Column(String, ForeignKey("parcels.id", ondelete="CASCADE"), nullable=False, index=True)
    survey_number = Column(String, nullable=False)
    risk_score = Column(Integer, nullable=False)
    trigger = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    recommended_action = Column(Text, nullable=False)
    created_at_display = Column(String, nullable=False)  # Alert.createdAt display string, kept as-is
    status = Column(String, nullable=False)
    resolution_notes = Column(Text, nullable=True)
    assigned_to = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    project = relationship("Project", back_populates="alerts")
    parcel = relationship("Parcel", back_populates="alerts")


class CaseAction(Base):
    """Mirrors `CaseAction` in src/types/index.ts."""

    __tablename__ = "case_actions"

    id = Column(String, primary_key=True)  # e.g. "ACT-501" — preserved as-is
    parcel_id = Column(String, ForeignKey("parcels.id", ondelete="CASCADE"), nullable=False, index=True)
    survey_number = Column(String, nullable=False)
    title = Column(String, nullable=False)
    action_type = Column(String, nullable=False)
    assigned_officer = Column(String, nullable=False)
    assigned_officer_role = Column(String, nullable=False)
    priority = Column(String, nullable=False)
    status = Column(String, nullable=False)
    due_date = Column(String, nullable=False)  # display string
    created_at_display = Column(String, nullable=False)  # CaseAction.createdAt display string
    completed_at = Column(String, nullable=True)  # display string
    notes = Column(Text, nullable=False)
    target_delay_reduction_months = Column(Float, nullable=False)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    parcel = relationship("Parcel", back_populates="case_actions")


class AuditLog(Base):
    """Mirrors `AuditLog` in src/types/index.ts."""

    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True)  # e.g. "LOG-901" — preserved as-is
    timestamp_display = Column(String, nullable=False)  # AuditLog.timestamp display string
    officer_id = Column(String, nullable=False)  # no FK — users are not persisted in this phase
    officer_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    action = Column(Text, nullable=False)
    parcel_id = Column(String, ForeignKey("parcels.id", ondelete="SET NULL"), nullable=True, index=True)
    survey_number = Column(String, nullable=True)
    details = Column(Text, nullable=False)

    # Audit rows are historical: a deleted parcel should not erase its
    # log trail, so parcel_id is SET NULL on delete rather than CASCADE.
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    parcel = relationship("Parcel")


class Prediction(Base):
    """
    NEW table — persists `ProjectPrediction` (src/types/index.ts). Nothing in
    the current app writes to this table yet; it exists so Step 3+ (adding
    persistence around /predict) has a stable, already-designed target.

    APPEND-ONLY: every prediction run is a new row. There is no update path
    and no unique constraint that would force an upsert — the same
    project/parcel can accumulate many rows over time, forming a history.
    `created_at` (DB insert time) is the reliable "most recent" sort key;
    `generated_at` mirrors the display string the backend already produces
    (backend/main.py `_now_iso()`) and is preserved verbatim for the UI.

    Does not alter /predict's behavior in any way — backend/main.py is not
    imported here and this table is not written to by the existing endpoint.
    """

    __tablename__ = "predictions"

    id = Column(String, primary_key=True, default=_uuid_hex)  # no prior ID scheme to preserve
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    parcel_id = Column(String, ForeignKey("parcels.id", ondelete="CASCADE"), nullable=True, index=True)
    scope = Column(String, nullable=False)  # 'project' | 'parcel'

    project_name = Column(String, nullable=False)  # ProjectPrediction.projectName
    generated_at = Column(String, nullable=False)  # ProjectPrediction.generatedAt display string
    is_real_api_prediction = Column(Boolean, nullable=False)
    prediction_mode = Column(String, nullable=True)  # 'live-model' | 'demo-fallback'
    api_error = Column(Text, nullable=True)

    model_input = Column(JSON, nullable=False)  # ProjectPrediction.modelInput
    sample_coverage = Column(JSON, nullable=True)
    input_diagnostics = Column(JSON, nullable=True)
    aggregation_notes = Column(JSON, nullable=False, default=list)

    delay_probability = Column(Float, nullable=False)
    delay_risk_score = Column(Float, nullable=False)
    risk_level = Column(String, nullable=False)  # RiskLevel
    predicted_delay_months = Column(Float, nullable=True)  # NULL for live-model (probability, not duration)
    predicted_delay_range = Column(String, nullable=False)
    top_risk_factor = Column(String, nullable=False)
    ai_explanation = Column(Text, nullable=False)
    shap_factors = Column(JSON, nullable=False, default=list)  # ShapFactor[]
    survival_analysis = Column(JSON, nullable=True)  # SurvivalAnalysisResult | undefined
    recommended_action = Column(Text, nullable=False)

    # STEP 9B: nullable so every historical row inserted before this column
    # existed remains valid and readable as-is (NULL, never backfilled or
    # fabricated — see this file's module docstring and the Step 9B brief's
    # "do not rewrite or fabricate their version" instruction). Populated
    # going forward from inference_service.run_prediction()'s
    # meta.model_version (backend/routers/predictions.py._build_prediction_row).
    model_version = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    project = relationship("Project", back_populates="predictions")
    parcel = relationship("Parcel", back_populates="predictions")
    outcomes = relationship("PredictionOutcome", back_populates="prediction", cascade="all, delete-orphan")


class PredictionOutcome(Base):
    """
    STEP 9B OF THE PERSISTENCE PLAN. Records the eventual real-world outcome
    of one specific `Prediction` row, so a prediction's accuracy can later be
    reviewed against what actually happened.

    APPEND-ONLY, like `Prediction` itself: no update_* or delete_* CRUD
    helper exists for this table (see crud.py), and no PATCH/DELETE endpoint
    is exposed (see routers/prediction_outcomes.py). Recording a second,
    corrected outcome for the same prediction is a new row, not an edit of
    the first — the original `Prediction` row this references is NEVER
    modified by writing an outcome.

    `verified` defaults to False: an outcome is "entered/reported" the
    moment it is created, and only counts as independently confirmed when a
    caller explicitly asserts `verified=True` at creation time (there is no
    separate verify-endpoint, since that would be an update). Nothing in
    this codebase — no engine, no report, no aggregate — may treat an
    unverified outcome as validated ground truth; `verified` is exactly the
    flag that lets a consumer tell the difference.

    `source_type` and `confidence` are stored as plain strings whose value
    sets deliberately reuse the SAME vocabulary already established
    elsewhere in this codebase (source_type: legal.enums.SourceType;
    confidence: exposure.enums.ConfidenceLabel — see
    schemas.PredictionOutcomeBase's validators for the exact accepted
    values) rather than inventing a third, conflicting vocabulary. The
    Python Enum types themselves are intentionally NOT imported here:
    backend/models.py, crud.py and schemas.py are the core persistence
    layer that /predict's prediction-persistence path depends on
    unconditionally, whereas backend/legal/ and backend/exposure/ are
    optional layers main.py can fail to import without breaking the core
    (see main.py's _LEGAL_IMPORT_ERROR / _EXPOSURE_IMPORT_ERROR degrade-
    gracefully pattern) — core code must never import from them.
    """

    __tablename__ = "prediction_outcomes"

    id = Column(String, primary_key=True, default=_uuid_hex)
    prediction_id = Column(String, ForeignKey("predictions.id", ondelete="CASCADE"), nullable=False, index=True)
    # Denormalized echoes of the referenced Prediction's own project_id/
    # parcel_id — always set from `prediction.project_id`/`prediction.parcel_id`
    # server-side (routers/prediction_outcomes.py), never accepted as
    # free-form client input, so this can never disagree with the
    # prediction it links to.
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    parcel_id = Column(String, ForeignKey("parcels.id", ondelete="CASCADE"), nullable=True, index=True)

    actual_event_occurred = Column(Boolean, nullable=False)
    actual_duration_months = Column(Float, nullable=True)
    actual_completion_date = Column(Date, nullable=True)
    observed_as_of_date = Column(Date, nullable=False)

    source_type = Column(String, nullable=False)  # legal.enums.SourceType value (see class docstring)
    evidence_reference = Column(String, nullable=True)
    verified = Column(Boolean, nullable=False, default=False)
    confidence = Column(String, nullable=True)  # exposure.enums.ConfidenceLabel value (see class docstring)
    entered_by = Column(String, nullable=False)  # no FK — users are not persisted in this phase (see AuditLog)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    prediction = relationship("Prediction", back_populates="outcomes")
