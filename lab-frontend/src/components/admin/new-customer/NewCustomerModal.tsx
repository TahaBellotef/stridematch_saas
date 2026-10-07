"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Stepper } from "@/components/admin/new-customer/Stepper";
import { ProfileStep } from "@/components/admin/new-customer/steps/ProfileStep";
import { RunningHabitsStep } from "@/components/admin/new-customer/steps/RunningHabitsStep";
import { PainRecordStep } from "@/components/admin/new-customer/steps/PainRecordStep";
import { ShoeTypeStep } from "@/components/admin/new-customer/steps/ShoeTypeStep";
import { SizeStep } from "@/components/admin/new-customer/steps/SizeStep";

type StepKey = "profile" | "running" | "pain" | "shoe" | "size";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "running", label: "Running Habits" },
  { key: "pain", label: "Pain Record" },
  { key: "shoe", label: "Shoe Type" },
  { key: "size", label: "Size" },
];

interface NewCustomerModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewCustomerModal({ open, onClose }: NewCustomerModalProps) {
  const [current, setCurrent] = useState<number>(0);

  const closeAndReset = () => {
    setCurrent(0);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0B0A14]/70 backdrop-blur-sm px-4 py-10">
      <div className="relative w-full max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-white">Create New Customer</h1>
          <button
            onClick={closeAndReset}
            className="flex items-center gap-2 rounded-full border border-[#3A335A] bg-[#1E1A34]/80 px-3 py-1.5 text-sm text-slate-200 hover:bg-[#262043]"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>

        <div style={{ backgroundColor: "#28243D" }} className="rounded-2xl p-10 shadow-2xl">
          <Stepper steps={STEPS} currentIndex={current} />

          <div className="mt-4 max-w-2xl mx-auto">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">New Customer</h2>
            </div>
            <div className="rounded-2xl border border-[#1B1934] bg-[#2A2544] p-8 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
            {STEPS[current].key === "profile" && (
              <ProfileStep onContinue={() => setCurrent(1)} onClose={closeAndReset} />
            )}
            {STEPS[current].key === "running" && (
              <RunningHabitsStep
                onBack={() => setCurrent(0)}
                onContinue={() => setCurrent(2)}
              />
            )}
            {STEPS[current].key === "pain" && (
              <PainRecordStep
                onBack={() => setCurrent(1)}
                onContinue={() => setCurrent(3)}
              />
            )}
            {STEPS[current].key === "shoe" && (
              <ShoeTypeStep onBack={() => setCurrent(2)} onContinue={() => setCurrent(4)} />
            )}
            {STEPS[current].key === "size" && (
              <SizeStep onBack={() => setCurrent(3)} onClose={closeAndReset} />
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
