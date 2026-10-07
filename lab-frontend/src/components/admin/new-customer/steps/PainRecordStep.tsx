"use client";

import { useState } from "react";
import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
import { Command } from "@phosphor-icons/react";

interface PainRecordStepProps {
  onContinue: () => void;
  onBack: () => void;
}

const painOptions = [
  "Achilles Tendonitis",
  "Plantar Fasciitis",
  "Patellar Tendinopathy",
  "Iliotibial Band Syndrome",
  "Shin Splints",
  "Stress Fracture",
  "Runner's Knee",
  "Tibial Tendonitis",
  "Achilles Rupture",
];

export function PainRecordStep({ onContinue, onBack }: PainRecordStepProps) {
  const [hasPain, setHasPain] = useState<"yes" | "no" | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const storedData = localStorage.getItem("__stridematch_newCustomer");
    if (!storedData) return;
    try {
      const parsed = JSON.parse(storedData);
      if (parsed.painInPastYear === "yes" || parsed.painInPastYear === "no") {
        setHasPain(parsed.painInPastYear);
      }
      if (Array.isArray(parsed.painAreas)) {
        setSelectedAreas(parsed.painAreas);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const toggleSelection = (value: string) => {
    setSelectedAreas((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
    setError(null);
  };

  const handleContinue = () => {
    if (!hasPain) {
      setError("Please answer the question above");
      return;
    }
    if (hasPain === "yes" && selectedAreas.length === 0) {
      setError("Select at least one pain area");
      return;
    }

    const storedData = localStorage.getItem("__stridematch_newCustomer");
    const existing = storedData ? JSON.parse(storedData) : {};

    const updated = {
      ...existing,
      painInPastYear: hasPain,
      painAreas: hasPain === "yes" ? selectedAreas : [],
    };

    localStorage.setItem("__stridematch_newCustomer", JSON.stringify(updated));
    onContinue();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-white">
          1. Have you experienced any running-related pain in the past year? *
        </p>
        <div className="grid grid-cols-2 gap-3">
          {["yes", "no"].map((value) => {
            const active = hasPain === value;
            return (
              <button
                key={value}
                onClick={() => {
                  setHasPain(value as "yes" | "no");
                  setError(null);
                }}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                  active
                    ? "border-indigo-400 bg-[#211B3C] text-white"
                    : "border-[#3A335A] bg-[#1E1A34]/60 text-slate-200 hover:border-indigo-400/70 hover:text-white"
                }`}
              >
                <span
                  className={`h-3.5 w-3.5 rounded-full border ${
                    active ? "border-indigo-400" : "border-slate-500"
                  }`}
                />
                {value === "yes" ? "Yes" : "No"}
              </button>
            );
          })}
        </div>
      </div>

      {hasPain === "yes" && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">2. Where did you get pain?</p>
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Pain area</label>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="w-full rounded-lg border border-[#3A335A] bg-[#1E1A34]/60 px-3 py-2 text-left text-sm text-slate-200"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 flex-wrap">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#4B4474]/20 text-white">
                    <Command size={22} className="text-white" />
                  </span>
                  {selectedAreas.length === 0 ? (
                    <span className="text-slate-500">Select pain area</span>
                  ) : (
                    selectedAreas.map((area) => (
                      <span
                        key={area}
                        className="flex items-center gap-1 rounded-full bg-[#2F2B4A] px-2 py-1 text-xs text-slate-200"
                      >
                        {area}
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelection(area);
                          }}
                          className="text-slate-400 hover:text-white"
                        >
                          ×
                        </span>
                      </span>
                    ))
                  )}
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </div>
            </button>

            {dropdownOpen && (
              <div className="rounded-lg border border-[#3A335A] bg-[#2A2544] p-3 shadow-[0_10px_20px_rgba(0,0,0,0.35)]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {painOptions.map((option) => {
                    const active = selectedAreas.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleSelection(option)}
                        className="flex items-center justify-between rounded-lg border border-transparent px-2 py-2 text-left text-xs text-slate-200 hover:bg-[#221F3A]"
                      >
                        <span>{option}</span>
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            active ? "border-indigo-400 bg-indigo-500/20 text-indigo-200" : "border-slate-500"
                          }`}
                        >
                          {active && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}

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
