"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { CustomerSelectionStep } from "@/features/lab/steps/CustomerSelectionStep";
import { MethodSelectionStep } from "@/features/lab/steps/MethodSelectionStep";
import { MethodDetailStep } from "@/features/lab/steps/MethodDetailStep";
import { ProcessingStep } from "@/features/lab/steps/ProcessingStep";
import { AnalysisCompleteStep } from "@/features/lab/steps/AnalysisCompleteStep";
import { ResultStep } from "@/features/lab/steps/ResultStep";
import { LabStep } from "@/features/lab/domain/labStep.enum";
import { useLabFlow } from "@/features/lab/hooks/useLabFlow";
import type { CustomerProfile } from "@/features/lab/services/customer.service";

const PENDING_CUSTOMER_KEY = "lab:pendingCustomer";

export default function NewAnalysisPage() {
  const router = useRouter();
  const {
    step,
    selectedCustomer,
    selectedMethod,
    analysis,
    currentCapture,
    loading,
    selectCustomer,
    selectMethod,
    prepareUpload,
    submitVideo,
    resetLab,
    goBack,
  } = useLabFlow();

  useEffect(() => {
    if (analysis && step === LabStep.Result) {
      try {
        sessionStorage.setItem(
          `analysis:${analysis.job_id}`,
          JSON.stringify(analysis)
        );
      } catch {
        // Ignore storage failures (private mode / quotas)
      }
      router.replace(`/admin/analysis/reports/${analysis.job_id}`);
    }
  }, [analysis, step, router]);

  useEffect(() => {
    if (step !== LabStep.CustomerSelection) return;
    if (typeof window === "undefined") return;

    const rawPendingCustomer = sessionStorage.getItem(PENDING_CUSTOMER_KEY);
    if (!rawPendingCustomer) return;

    try {
      const pendingCustomer = JSON.parse(rawPendingCustomer) as CustomerProfile;
      if (pendingCustomer?.id) {
        selectCustomer(pendingCustomer);
      }
    } catch {
      // Ignore malformed storage payloads.
    } finally {
      sessionStorage.removeItem(PENDING_CUSTOMER_KEY);
    }
  }, [step, selectCustomer]);

  const handleAnalysisCompleteContinue = () => {
    if (analysis) {
      try {
        sessionStorage.setItem(
          `analysis:${analysis.job_id}`,
          JSON.stringify(analysis)
        );
      } catch {
        // Ignore storage failures
      }
      router.replace(`/admin/analysis/reports/${analysis.job_id}`);
      return;
    }
    resetLab();
    router.replace("/admin/analysis");
  };

  return (
    <div className="w-full">
      {step === LabStep.CustomerSelection && (
        <CustomerSelectionStep
          onSelectCustomer={selectCustomer}
          onClose={() => router.push("/admin/analysis")}
        />
      )}

      {step === LabStep.MethodSelection && (
        <MethodSelectionStep onSelect={selectMethod} onBack={goBack} />
      )}

      {step === LabStep.MethodDetail && selectedMethod && (
        <MethodDetailStep
          method={selectedMethod}
          captureType={currentCapture}
          onPrepareUpload={prepareUpload}
          onSubmitCapture={submitVideo}
          onBack={goBack}
        />
      )}

      {step === LabStep.Processing && <ProcessingStep isLoading={loading} />}

      {step === LabStep.AnalysisComplete && (
        <AnalysisCompleteStep onContinue={handleAnalysisCompleteContinue} />
      )}

      {step === LabStep.Result && analysis && (
        <ResultStep analysis={analysis} onNewAnalysis={resetLab} />
      )}

      {step === LabStep.Result && !analysis && (
        <div className="mx-auto w-full max-w-xl rounded-2xl border border-red-200/50 bg-red-900/20 p-5 text-center text-red-300">
          <h2 className="text-lg font-semibold">No analysis available</h2>
          <p className="mt-2 text-sm text-red-300/80">
            Run the analysis in the previous step.
          </p>
        </div>
      )}
    </div>
  );
}
