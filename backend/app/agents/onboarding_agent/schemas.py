from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class OnboardingStepStatus(StrEnum):
    COMPLETED = "COMPLETED"
    RUNNING = "RUNNING"
    WAITING_APPROVAL = "WAITING_APPROVAL"
    PENDING = "PENDING"


class OnboardingStep(BaseModel):
    agent: str
    title: str
    status: OnboardingStepStatus
    summary: str


class ParsedResume(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    skills: list[str] = Field(default_factory=list)
    experience: str | None = None
    education: str | None = None
    current_company: str | None = None
    raw_text_preview: str | None = None


class OnboardingStructuredResponse(BaseModel):
    type: str
    title: str
    summary: str
    candidate: dict[str, Any] = Field(default_factory=dict)
    steps: list[OnboardingStep] = Field(default_factory=list)
    documents: list[dict[str, Any]] = Field(default_factory=list)
    assets: list[dict[str, Any]] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)
    candidate_id: UUID | None = None
