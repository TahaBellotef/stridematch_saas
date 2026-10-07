import { AnalysisResult } from "@/features/lab/domain/analysis.types";
import { RunnerProfile } from "@/features/lab/domain/runner.types";

export type AdminSessionSummary = {
  id: string;
  created_at: string;
  status: string;
  customer_id?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_email?: string | null;
  active_analysis_job_id?: string | null;
};

export type AdminSessionListResponse = {
  total: number;
  sessions: AdminSessionSummary[];
};

export type AdminSessionDetail = {
  id: string;
  created_at: string;
  status: string;
  customer_id?: string | null;
  runner_profile: RunnerProfile;
  required_captures: string[];
  completed_captures: string[];
  inferred_pronation?: string | null;
  active_analysis_job_id?: string | null;
  rear_analysis_job_id?: string | null;
  rear_video_url?: string | null;
  client_session_key?: string | null;
  analysis_results?: AnalysisResult[];
};
