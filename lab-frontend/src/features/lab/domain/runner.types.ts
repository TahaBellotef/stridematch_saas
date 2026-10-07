export type RunnerProfile = {
  gender: "male" | "female";
  age: number;          
  weightKg: number;     
  heightCm: number;     
  level: Level
  surface: Surface
  weeklyDistance: WeeklyDistance
  pronation: Pronation
  preference: Preference
};

export type Surface = 
| "road"
| "trail"
| "mixed"
| "treadmill";

export type Level = 
| "beginner"
| "intermediate"
| "advanced";

export type Preference =
| "comfort"
| "responsiveness"
| "stability"
| "versatility";

export type WeeklyDistance = 
| "lt_10"
| "10_25"
| "25_50"
| "gt_50";

export type Pronation =
| "neutral"
| "overpronation"
| "underpronation"
| "unknown"