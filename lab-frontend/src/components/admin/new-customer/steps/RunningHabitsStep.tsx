"use client";

import { useState } from "react";
import { RoadHorizon, Mountains, Snowflake, Waves } from "@phosphor-icons/react";

interface RunningHabitsStepProps {
  onContinue: () => void;
  onBack: () => void;
}

const cardBase =
  "rounded-lg border border-[#3A335A] bg-[#1E1A34]/60 px-4 py-3 text-sm text-slate-200 hover:border-indigo-400/70 hover:text-white";

export function RunningHabitsStep({ onContinue, onBack }: RunningHabitsStepProps) {
  const [runningDuration, setRunningDuration] = useState<string | null>(null);
  const [timesPerWeek, setTimesPerWeek] = useState<string | null>(null);
  const [kmsPerWeek, setKmsPerWeek] = useState<string | null>(null);
  const [surfaces, setSurfaces] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<{
    runningDuration?: string;
    timesPerWeek?: string;
    kmsPerWeek?: string;
    surfaces?: string;
  }>({});

  const block = (
    title: string,
    options: string[],
    selected: string | null,
    onSelect: (val: string) => void,
    errorMessage?: string
  ) => (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-white">{title} *</p>
      <p className="text-[11px] text-slate-500">Select one answer</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {options.map((opt) => {
          const active = selected === opt;
          return (
            <button
              key={opt}
              onClick={() => onSelect(opt)}
              className={`${cardBase} ${
                active ? "ring-1 ring-indigo-400 bg-[#211B3C]" : ""
              } ${errorMessage ? "border-red-500/70" : ""}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {errorMessage && <p className="text-[11px] text-red-400">{errorMessage}</p>}
    </div>
  );

  const surfaceOptions = [
    { label: "Treadmill", icon: Waves, color: "#6A47F4" },
    { label: "Route", icon: RoadHorizon, color: "#34D399" },
    { label: "Trail", icon: Mountains, color: "#F59E0B" },
    { label: "Piste", icon: Snowflake, color: "#F472B6" },
  ];

  const toggleSurface = (label: string) => {
    setSurfaces((current) => ({ ...current, [label]: !current[label] }));
    if (errors.surfaces) setErrors((prev) => ({ ...prev, surfaces: undefined }));
  };

  const handleContinue = () => {
    const hasSurface = Object.values(surfaces).some(Boolean);
    const validationErrors: typeof errors = {};
    if (!runningDuration) validationErrors.runningDuration = "Required";
    if (!timesPerWeek) validationErrors.timesPerWeek = "Required";
    if (!kmsPerWeek) validationErrors.kmsPerWeek = "Required";
    if (!hasSurface) validationErrors.surfaces = "Select at least one running surface";

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const storedData = localStorage.getItem("__stridematch_newCustomer");
    const existing = storedData ? JSON.parse(storedData) : {};

    const updated = {
      ...existing,
      runningDuration,
      timesPerWeek,
      kmsPerWeek,
      surfaces,
    };

    localStorage.setItem("__stridematch_newCustomer", JSON.stringify(updated));
    onContinue();
  };

  const handleSelect = (
    key: "runningDuration" | "timesPerWeek" | "kmsPerWeek",
    setter: (val: string) => void
  ) => (val: string) => {
    setter(val);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Create New Customer</h2>

      <div className="space-y-4">
        {block(
          "How long have you been running for?",
          [
          "Less than 6 months",
          "1 year to 3 years",
          "6 months to 1 year",
          "More than 3 years",
          ],
          runningDuration,
          handleSelect("runningDuration", setRunningDuration),
          errors.runningDuration
        )}

        {block(
          "How many times do you run each week?",
          ["One", "4 to 5", "2 to 3", "Everyday"],
          timesPerWeek,
          handleSelect("timesPerWeek", setTimesPerWeek),
          errors.timesPerWeek
        )}

        {block(
          "How many kilometers do you run per week?",
          ["<10", "20 to 30", "10 to 20", ">30"],
          kmsPerWeek,
          handleSelect("kmsPerWeek", setKmsPerWeek),
          errors.kmsPerWeek
        )}
      </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">Surface Principle *</p>
            <p className="text-[11px] text-slate-500">Select one or more running surfaces</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {surfaceOptions.map((option) => {
                const active = !!surfaces[option.label];
                const Icon = option.icon;
                return (
                  <button
                    key={option.label}
                    onClick={() => toggleSurface(option.label)}
                    style={{
                      backgroundColor: "#312D4B",
                      border: "1px solid rgba(0,0,0,0.5)",
                      boxShadow: active
                        ? `0 0 0 1px ${option.color}, 0 12px 20px rgba(0,0,0,0.35)`
                        : "0 10px 20px rgba(0,0,0,0.25)",
                    }}
                    className={`flex flex-col items-center justify-center rounded-2xl px-6 py-6 gap-2 ${
                      active ? "text-white" : "text-slate-200 hover:text-white"
                    }`}
                  >
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${option.color}1A` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: option.color }} />
                    </span>
                    <span className="text-xs font-semibold">{option.label}</span>
                  </button>
                );
              })}
            </div>
            {errors.surfaces && <p className="text-[11px] text-red-400">{errors.surfaces}</p>}
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
