export type InsightLevel = "good" | "warning" | "critical" | "info" | "focus";

export type Insight = {
  id: string;
  title: string;
  message: string;
  level: InsightLevel;
  metric?: string;
  value?: number | string;
  unit?: string;
};