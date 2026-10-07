"use client";

import { useState } from "react";
import { Check, Sparkles, Zap, Shield, Target } from "lucide-react";

interface ShoeTypeStepProps {
  onContinue: () => void;
  onBack: () => void;
}

export function ShoeTypeStep({ onContinue, onBack }: ShoeTypeStepProps) {
  const options = [
    {
      title: "Cushioning Comfort",
      description:
        "Optimized cushioning to absorb impact and ensure lasting comfort, even over long distances",
      color: "#38BDF8",
      icon: Sparkles,
    },
    {
      title: "Performance and Speed",
      description:
        "Designed for efficient energy return and responsiveness to support faster, more dynamic running",
      color: "#34D399",
      icon: Zap,
    },
    {
      title: "Stability and Support",
      description:
        "Provides reliable foot guidance and structure to enhance control and reduce injury risk",
      color: "#F97316",
      icon: Shield,
    },
    {
      title: "Versatility and Everyday Use",
      description:
        "Balanced design suitable for daily training, mixed paces, and everyday running needs",
      color: "#F43F5E",
      icon: Target,
    },
  ];

  const [selected, setSelected] = useState<Record<string, boolean>>({
    "Cushioning Comfort": true,
  });
  const [error, setError] = useState<string | null>(null);

  const handleContinue = () => {
    const hasSelection = Object.values(selected).some(Boolean);
    if (!hasSelection) {
      setError("Select at least one shoe type");
      return;
    }

    const storedData = localStorage.getItem("__stridematch_newCustomer");
    const existing = storedData ? JSON.parse(storedData) : {};

    const updated = {
      ...existing,
      shoePreferences: selected,
    };

    localStorage.setItem("__stridematch_newCustomer", JSON.stringify(updated));
    onContinue();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-lg font-semibold text-white">
          What type of shoe are you looking for *
        </p>
        <p className="text-[11px] text-slate-500">You can select multiple</p>
        <div className="space-y-2.5">
          {options.map((opt) => {
            const active = !!selected[opt.title];
            const Icon = opt.icon;
            return (
              <button
                key={opt.title}
                onClick={() => {
                  setSelected((s) => ({ ...s, [opt.title]: !s[opt.title] }));
                  setError(null);
                }}
                className="w-full rounded-full border border-[#3A335A] bg-[#2B2743] px-4 py-3 text-left transition-colors hover:border-indigo-400/70"
                style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${opt.color}1A`, color: opt.color }}
                  >
                    <Icon className="h-4 w-4" style={{ color: opt.color }} />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold" style={{ color: opt.color }}>
                      {opt.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{opt.description}</p>
                  </div>
                  <span
                    className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${
                      active
                        ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                        : "border-slate-500 text-transparent"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>

      <div className="pt-2 flex justify-between gap-3">
        <button
          onClick={onBack}
          className="rounded-full border border-[#3A335A] px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          className="w-full md:w-48 rounded-full bg-gradient-to-r from-[#6A47F4] to-[#6A47F4] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/40 hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
