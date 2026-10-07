"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LabStep } from "../domain/labStep.enum";
import { RunnerProfile } from "../domain/runner.types";
import { AnalysisResult } from "../domain/analysis.types";
import { runAnalysis, triggerAnalysisRun } from "../services/analysis.service";
import { waitForSessionCompletion } from "@/shared/analysis/waitForSessionCompletion";
import {
  AnalysisSession,
  createSession,
  getSession,
  getNextCapture,
  CaptureType,
} from "../services/session.service";
import { AnalysisMethod } from "../steps/MethodSelectionStep";
import { Surface, Pronation } from "../domain/runner.types";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  company?: string;
  status: "Online" | "Offline";
  initials: string;
  // Runner profile data
  age: number;
  gender: "male" | "female" | "other";
  heightCm: number;
  weightKg: number;
  level: "beginner" | "intermediate" | "advanced";
  surface: "road" | "trail" | "mixed" | "treadmill";
  weeklyDistance: "lt_10" | "10_25" | "25_50" | "gt_50";
  pronation: "neutral" | "overpronation" | "underpronation" | "unknown";
  preference: "comfort" | "responsiveness" | "stability" | "versatility";
}

// Static profile data - used instead of form
const STATIC_PROFILE: RunnerProfile = {
  gender: "male",
  age: 30,
  weightKg: 75,
  heightCm: 175,
  level: "intermediate",
  surface: "road",
  weeklyDistance: "25_50",
  pronation: "unknown",
  preference: "comfort",
};

export function useLabFlow() {
  const router = useRouter();
  /* --------------------------------------------------
   * Core state
   * -------------------------------------------------- */
  const [step, setStep] = useState<LabStep>(LabStep.CustomerSelection);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<AnalysisMethod | null>(null);
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const analysisTypeFromMethod = useCallback(
    (method: AnalysisMethod | null): "rear" | "side" | undefined => {
      if (!method) return undefined;
      if (method === "treadmill-rear") return "rear";
      if (method === "treadmill-side" || method === "overground-side") return "side";
      return undefined;
    },
    []
  );

  // Derive profile from selected customer
  // Derive surface/pronation from selected method; fall back to customer/default for rest
  const derivedSurface: Surface | undefined = (() => {
    switch (selectedMethod) {
      case "overground-side":
        return "road"; // backend accepts: road, trail, mixed, treadmill
      case "treadmill-side":
      case "treadmill-rear":
        return "treadmill";
      default:
        return undefined;
    }
  })();

  const derivedPronation: Pronation | undefined = (() => {
    switch (selectedMethod) {
      case "overground-side":
      case "treadmill-side":
        return "neutral"; // known
      case "treadmill-rear":
        return "unknown";
      default:
        return undefined;
    }
  })();

  const normalizeGender = (gender: Customer["gender"]): RunnerProfile["gender"] =>
    gender === "male" || gender === "female" ? gender : "male";

  const normalizeAge = (age: number): number =>
    Number.isFinite(age) && age >= 18 ? age : 18;

  const profile: RunnerProfile = selectedCustomer
    ? {
        age: normalizeAge(selectedCustomer.age),
        gender: normalizeGender(selectedCustomer.gender),
        heightCm: selectedCustomer.heightCm || STATIC_PROFILE.heightCm,
        weightKg: selectedCustomer.weightKg || STATIC_PROFILE.weightKg,
        level: selectedCustomer.level,
        surface: derivedSurface ?? selectedCustomer.surface,
        weeklyDistance: selectedCustomer.weeklyDistance,
        pronation: derivedPronation ?? selectedCustomer.pronation,
        preference: selectedCustomer.preference,
      }
    : {
        ...STATIC_PROFILE,
        surface: derivedSurface ?? STATIC_PROFILE.surface,
        pronation: derivedPronation ?? STATIC_PROFILE.pronation,
      };

  /* --------------------------------------------------
   * Capture state (DERIVED, not guessed)
   * -------------------------------------------------- */
  const [currentCapture, setCurrentCapture] = useState<CaptureType | null>(null);

  /* --------------------------------------------------
   * UI state
   * -------------------------------------------------- */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If analysis is available, ensure we show results immediately.
  useEffect(() => {
    if (analysis && step !== LabStep.Result) {
      setStep(LabStep.Result);
    }
  }, [analysis, step]);

  /* ==================================================
   * STEP 0 — Customer Selection
   * ================================================== */
  const selectCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    setStep(LabStep.MethodSelection);
  }, []);

  /* ==================================================
   * STEP 1 — Method Selection
   * ================================================== */
  const selectMethod = useCallback((method: AnalysisMethod) => {
    setSelectedMethod(method);
    setStep(LabStep.MethodDetail);
  }, []);

  /* ==================================================
   * STEP 2 — Method Detail → Create Session
   * ================================================== */
  const prepareUpload = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      let activeSession = session;
      let nextCapture = currentCapture;

      if (!activeSession) {
        const newSession = await createSession(
          profile,
          selectedCustomer?.id,
          analysisTypeFromMethod(selectedMethod)
        );
        activeSession = newSession;
        setSession(newSession);
        nextCapture = getNextCapture(newSession);
        setCurrentCapture(nextCapture);

        console.log("[prepareUpload] session created", {
          sessionId: newSession.id,
          required: newSession.required_captures,
          completed: newSession.completed_captures,
          next: nextCapture,
        });
      }

      if (!nextCapture) {
        nextCapture = getNextCapture(activeSession);
        setCurrentCapture(nextCapture);
      }

      if (!nextCapture) {
        throw new Error("No capture expected for this session.");
      }

      return nextCapture;
    } catch (err) {
      console.error("[prepareUpload] ERROR", err);
      setError(
        err instanceof Error ? err.message : "Failed to start analysis session"
      );
      throw err;
    } finally {
      setLoading(false);
    }
  }, [session, currentCapture, profile]);

  /* ==================================================
   * STEP 3 — Submit ONE capture (authoritative)
   * ================================================== */
  const submitVideo = useCallback(
    async (file: File) => {
      console.log("[submitVideo] START", {
        sessionId: session?.id,
        currentCapture,
        file: { name: file?.name, type: file?.type, size: file?.size },
      });

      setError(null);
      setLoading(true);
      let activeSession = session;
      let activeCapture = currentCapture;

      try {
        if (!activeSession || !activeCapture) {
          if (!profile) {
            console.log("[submitVideo] MISSING PROFILE");
            setError("Complete the Profile tab to start analysis.");
            setStep(LabStep.Video);
            return;
          }

          console.log("[submitVideo] CREATING SESSION FOR UPLOAD");
          const newSession = await createSession(
            profile,
            selectedCustomer?.id,
            analysisTypeFromMethod(selectedMethod)
          );
          const next = getNextCapture(newSession);

          setSession(newSession);
          setCurrentCapture(next);

          activeSession = newSession;
          activeCapture = next;
        }

        if (!activeSession || !activeCapture) {
          console.log("[submitVideo] NO CAPTURE AVAILABLE");
          setError("No capture is available for this session yet.");
          setStep(LabStep.Video);
          return;
        }

        setStep(LabStep.Processing);
        const { s3Key } = await runAnalysis({
          sessionId: activeSession.id,
          captureType: activeCapture,
          file,
          analysisType: analysisTypeFromMethod(selectedMethod),
        });

        await triggerAnalysisRun({
          sessionId: activeSession.id,
          captureType: activeCapture,
          s3Key,
          analysisType: analysisTypeFromMethod(selectedMethod),
        });

        const sessionStatus = await waitForSessionCompletion(activeSession.id);
        const jobId = sessionStatus.active_analysis_job_id;
        if (jobId) {
          router.replace(`/admin/analysis/reports/${jobId}`);
          return;
        }

        router.replace("/admin/analysis/reports?warning=missing-job");
        return;
      } catch (err) {
        console.error("[submitVideo] ERROR", err);

        // Optional: refresh session from backend on ordering errors
        // (prevents “stuck on rear” if client got out of sync)
        try {
          if (session?.id) {
            const fresh = await getSession(session.id);
            const next = getNextCapture(fresh);
            console.log("[submitVideo] refreshed session", {
              required: fresh.required_captures,
              completed: fresh.completed_captures,
              next,
            });
            setSession(fresh);
            setCurrentCapture(next);
          }
        } catch (refreshErr) {
          console.error("[submitVideo] session refresh failed", refreshErr);
        }

        setError(
          err instanceof Error ? err.message : "Failed to process analysis"
        );
        setStep(LabStep.Video);
      } finally {
        setLoading(false);
        console.log("[submitVideo] END", { currentCapture });
      }
    },
    [session, currentCapture, profile, selectedMethod, selectedCustomer, router]
  );

  /* ==================================================
   * STEP 4 — Analysis Complete → Show Results
   * ================================================== */
  const showResults = useCallback(() => {
    setStep(LabStep.Result);
  }, []);

  /* ==================================================
   * RESET
   * ================================================== */
  const resetLab = useCallback(() => {
    setSelectedMethod(null);
    setSession(null);
    setAnalysis(null);
    setCurrentCapture(null);
    setError(null);
    setLoading(false);
    setStep(LabStep.MethodSelection);
  }, []);

  /* ==================================================
   * BACK NAVIGATION
   * ================================================== */
  const goBack = useCallback(() => {
    if (step === LabStep.MethodDetail) {
      setStep(LabStep.MethodSelection);
    } else if (step === LabStep.Video) {
      setStep(LabStep.MethodDetail);
    } else if (step === LabStep.MethodSelection) {
      setStep(LabStep.CustomerSelection);
    }
  }, [step]);

  /* ==================================================
   * TAB NAVIGATION
   * ================================================== */
  const goToStep = useCallback(
    (target: LabStep) => {
      if (loading) return;

      if (target === LabStep.MethodSelection) {
        resetLab();
        return;
      }

      if (target === LabStep.Video || target === LabStep.Result) {
        setStep(target);
      }
    },
    [loading, resetLab]
  );

  return {
    step,
    selectedCustomer,
    selectedMethod,
    profile,
    session,
    analysis,

    currentCapture,

    loading,
    error,

    selectCustomer,
    selectMethod,
    prepareUpload,
    submitVideo,
    showResults,
    resetLab,
    goBack,
    goToStep,
  };
}
