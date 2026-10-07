from pydantic import BaseModel, Field, ConfigDict
from typing import Literal


class RunnerProfile(BaseModel):
    """
    Represents the physiological and contextual profile of a runner.
    This is NOT motion data.
    """

    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
    )

    gender: Literal["male", "female"]

    age: int = Field(..., ge=18, le=100)
    weight_kg: float = Field(..., alias="weightKg")
    height_cm: float = Field(..., alias="heightCm")

    level: Literal["beginner", "intermediate", "advanced"]

    surface: Literal["road", "trail", "mixed","treadmill"]
    weekly_distance: Literal["lt_10", "10_25", "25_50", "gt_50"] = Field(
        ..., alias="weeklyDistance"
    )

    pronation: Literal[
        "neutral",
        "pronation",
        "supination",
        "unknown",
    ]

    preference: Literal[
        "comfort",
        "responsiveness",
        "stability",
        "versatility",
        "unknown",
    ]