"use client";

import { CustomerSelectionStep } from "@/features/lab/steps/CustomerSelectionStep";
import { MethodSelectionStep } from "@/features/lab/steps/MethodSelectionStep";
import { MethodDetailStep } from "@/features/lab/steps/MethodDetailStep";
import { ProcessingStep } from "@/features/lab/steps/ProcessingStep";
import { AnalysisCompleteStep } from "@/features/lab/steps/AnalysisCompleteStep";
import { ResultStep } from "@/features/lab/steps/ResultStep";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LabStep } from "@/features/lab/domain/labStep.enum";
import { useLabFlow } from "@/features/lab/hooks/useLabFlow";

type GaitAnalysisModalProps = {
  onClose: () => void;
};

export function GaitAnalysisModal({ onClose }: GaitAnalysisModalProps) {
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
      const key = analysis.job_id
        ? `analysis:${analysis.job_id}`
        : "analysis:last";
      try {
        sessionStorage.setItem(key, JSON.stringify(analysis));
      } catch {
        // ignore storage issues
      }
      if (selectedCustomer) {
        const profileKey = analysis.job_id
          ? `analysisProfile:${analysis.job_id}`
          : "analysisProfile:last";
        try {
          sessionStorage.setItem(profileKey, JSON.stringify(selectedCustomer));
          sessionStorage.setItem("analysisProfile:last", JSON.stringify(selectedCustomer));
        } catch {
          // ignore storage issues
        }
      }
      resetLab();
      onClose();
      router.push(`/admin/analysis/reports/${analysis.job_id}`);
    }
  }, [analysis, step, onClose, resetLab, router, selectedCustomer]);

  const handleClose = () => {
    resetLab();
    onClose();
  };

  const handleAnalysisCompleteContinue = () => {
    if (analysis) {
      const key = analysis.job_id
        ? `analysis:${analysis.job_id}`
        : "analysis:last";
      try {
        sessionStorage.setItem(key, JSON.stringify(analysis));
      } catch {
        // ignore storage issues
      }
      resetLab();
      onClose();
      router.push(`/admin/analysis/reports/${analysis.job_id}`);
      return;
    }
    resetLab();
    onClose();
    router.push("/admin/analysis");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Modal container */}
      <div 
        className="relative rounded-3xl bg-slate-950 border border-slate-700 shadow-2xl overflow-hidden flex flex-col"
        style={{ width: "90%", maxWidth: "1000px", maxHeight: "90vh" }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-white transition z-10"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {/* ============ Customer Selection ============ */}
          {step === LabStep.CustomerSelection && (
            <CustomerSelectionStep onSelectCustomer={selectCustomer} />
          )}

          {/* ============ Method Selection ============ */}
          {step === LabStep.MethodSelection && (
            <MethodSelectionStep onSelect={selectMethod} onBack={goBack} />
          )}

          {/* ============ Method Detail ============ */}
          {step === LabStep.MethodDetail && selectedMethod && (
            <MethodDetailStep
              method={selectedMethod}
              captureType={currentCapture}
              onPrepareUpload={prepareUpload}
              onSubmitCapture={submitVideo}
              onBack={goBack}
            />
          )}

          {/* ============ Processing ============ */}
          {step === LabStep.Processing && (
            <ProcessingStep isLoading={loading} />
          )}

          {/* ============ Analysis Complete ============ */}
          {step === LabStep.AnalysisComplete && (
            <AnalysisCompleteStep onContinue={handleAnalysisCompleteContinue} />
          )}

          {/* ============ Result ============ */}
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
      </div>
    </div>
  );
}
