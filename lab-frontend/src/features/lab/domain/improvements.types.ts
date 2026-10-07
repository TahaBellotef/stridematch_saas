// src/features/analysis/domain/improvements.types.ts

export type ImprovementPriority = "high" | "medium" | "low";

export type ImprovementSource = "rule" | "ml";

export type Improvement = {
  
  title: string;
  rationale: string;
  first_step: string;
  priority: ImprovementPriority;
  source: ImprovementSource;
};