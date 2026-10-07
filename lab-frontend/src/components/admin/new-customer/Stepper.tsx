"use client";

import { Check } from "lucide-react";

interface StepperProps {
  steps: { key: string; label: string }[];
  currentIndex: number;
}

export function Stepper({ steps, currentIndex }: StepperProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
      {steps.map((step, idx) => {
        const isActive = idx === currentIndex;
        const isComplete = idx < currentIndex;
        return (
          <div key={step.key} className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors border ${
                isActive
                  ? "border-indigo-400/70 bg-indigo-500/15 text-indigo-200 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.4)]"
                  : isComplete
                  ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200"
                  : "border-[#3A335A] bg-[#1E1A34]/60 text-slate-300"
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
                {isComplete ? <Check className="w-3 h-3" /> : idx + 1}
              </span>
              <span>{step.label}</span>
            </div>
            {idx !== steps.length - 1 && (
              <span className="h-px w-4 md:w-8 bg-[#3A335A]/70" />
            )}
          </div>
        );
      })}
    </div>
  );
}
