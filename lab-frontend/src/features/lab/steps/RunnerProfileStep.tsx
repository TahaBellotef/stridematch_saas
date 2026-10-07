"use client";

import { useMemo, useState, type ReactNode } from "react";
import { RunnerProfile } from "../domain/runner.types";

type Props = {
  onSubmit: (profile: RunnerProfile) => void;
  error?: string | null;
};

export function RunnerProfileStep({ onSubmit, error }: Props) {
  const [form, setForm] = useState<Partial<RunnerProfile>>({
    gender: "male",
    age: 35,
    level: "beginner",
    surface: "road",
    weightKg: 75,
    heightCm: 175,
    weeklyDistance: "lt_10",
    pronation: "unknown",
    preference: "comfort",
  });

  const [consent, setConsent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function update<K extends keyof RunnerProfile>(key: K, value: RunnerProfile[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function clampNumber(n: number, min: number, max: number) {
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function bumpNumber(
    key: "age" | "heightCm",
    delta: number,
    min: number,
    max: number
  ) {
    setForm((prev) => {
      const current = Number(prev[key] ?? 0) || 0;
      return { ...prev, [key]: clampNumber(current + delta, min, max) };
    });
  }

  const required: (keyof RunnerProfile)[] = [
    "gender",
    "age",
    "weightKg",
    "heightCm",
    "level",
    "surface",
    "weeklyDistance",
    "pronation",
    "preference",
  ];

  const missingRequired = useMemo(() => {
    for (const f of required) {
      const value = form[f];
      if (value === undefined || value === null) return true;
      if (typeof value === "number" && Number.isNaN(value)) return true;
    }
    return false;
  }, [form]);

  const canContinue = useMemo(() => {
    const age = Number(form.age ?? 0);
    return consent && !missingRequired && age >= 18;
  }, [consent, missingRequired, form.age]);

  const weightOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let start = 50; start <= 115; start += 5) {
      const end = start + 5;
      options.push({ value: String(start), label: `${start}kg - ${end}kg` });
    }
    return options;
  }, []);

  function submit() {
    setLocalError(null);

    if (!consent) {
      setLocalError("Consent is required to proceed.");
      return;
    }

    const age = Number(form.age ?? 0);
    if (!age || age < 18) {
      setLocalError("Runner must be at least 18 years old.");
      return;
    }

    for (const field of required) {
      const value = form[field];
      if (value === undefined || value === null) {
        setLocalError("Please complete all required fields.");
        return;
      }
      if (typeof value === "number" && Number.isNaN(value)) {
        setLocalError("Please complete all required fields.");
        return;
      }
    }

    onSubmit(form as RunnerProfile);
  }

  const displayedError = localError || error;

  return (
    <div className="mx-auto w-full max-w-5xl px-3 sm:px-0">
      <div className="space-y-6">
        {/* ===== Header ===== */}
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            Runner Profile
          </h2>
          <div className="mt-4 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-slate-900" />
          </div>
        </header>

        {/* ===== Error ===== */}
        {displayedError && (
          <Alert title="Fix one thing">{displayedError}</Alert>
        )}

        {/* ===== Form ===== */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-8">
          <Section title="Basics">
            <SelectField
              label="Gender"
              value={form.gender}
              onChange={(v) => update("gender", v as RunnerProfile["gender"])}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Rather not say" },
              ]}
            />

            <StepperField
              label="Age"
              value={Number(form.age ?? 35)}
              min={18}
              max={100}
              suffix="years"
              onChange={(v) => update("age", v)}
              onStep={(d) => bumpNumber("age", d, 18, 100)}
            />
          </Section>

          <Section title="Body">
            <SelectField
              label="Weight"
              value={String(form.weightKg ?? 75)}
              onChange={(v) => update("weightKg", Number(v))}
              options={weightOptions}
            />
            <StepperField
              label="Height"
              value={Number(form.heightCm ?? 175)}
              min={120}
              max={230}
              suffix="cm"
              onChange={(v) => update("heightCm", v)}
              onStep={(d) => bumpNumber("heightCm", d, 120, 230)}
            />
          </Section>

          <Section title="Training context">
            <SelectField
              label="Weekly distance"
              value={form.weeklyDistance}
              onChange={(v) =>
                update("weeklyDistance", v as RunnerProfile["weeklyDistance"])
              }
              options={[
                { value: "lt_10", label: "< 10 km" },
                { value: "10_25", label: "10–25 km" },
                { value: "25_50", label: "25–50 km" },
                { value: "gt_50", label: "> 50 km" },
              ]}
            />

            <SelectField
              label="Level"
              value={form.level}
              onChange={(v) => update("level", v as RunnerProfile["level"])}
              options={[
                { value: "beginner", label: "Beginner" },
                { value: "intermediate", label: "Intermediate" },
                { value: "advanced", label: "Advanced" },
              ]}
            />

            <SelectField
                label="Surface"
                value={form.surface}
                onChange={(v) =>
                update("surface", v as RunnerProfile["surface"])
              }
                options={[
                    { value: "road", label: "Road" },
                    { value: "trail", label: "Trail" },
                    { value: "treadmill", label: "Treadmill" },
                    { value: "mixed", label: "Mixed" },
                ]}
                />  
          </Section>

          <Section title="Preferences">
            <SelectField
              label="Pronation"
              value={form.pronation}
              onChange={(v) =>
                update("pronation", v as RunnerProfile["pronation"])
              }
              options={[
                { value: "neutral", label: "Neutral" },
                { value: "overpronation", label: "Overpronation" },
                { value: "underpronation", label: "Underpronation" },
                { value: "unknown", label: "I don’t know" },
              ]}
            />

            <SelectField
              label="Preference"
              value={form.preference}
              onChange={(v) => update("preference", v as RunnerProfile["preference"])}
              options={[
                { value: "comfort", label: "Comfort" },
                { value: "responsiveness", label: "Responsiveness" },
                { value: "stability", label: "Stability" },
                { value: "versatility",label: "Versatility"}
              ]}
            />
          </Section>

          {/* ===== Consent ===== */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 accent-slate-900"
              />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Video analysis & data protection
                </p>
                <p className="text-sm text-slate-600">
                  The video is analyzed to compute gait metrics. Results are
                  stored securely and used only for this fitting session.
                </p>
              </div>
            </label>
          </div>

          {/* ===== Actions ===== */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Used only for this session’s calibration
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={!canContinue}
              className={[
                "rounded-full px-6 py-3 text-sm font-semibold transition",
                canContinue
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "cursor-not-allowed bg-slate-200 text-slate-500",
              ].join(" ")}
            >
              {canContinue ? "Continue" : "Complete required fields"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ================= UI Helpers ================= */

function Alert({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50/60 p-5 space-y-5">
      <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h3>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function FieldShell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-800">{label}</label>
      {children}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <FieldShell label={label}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium focus:ring-4 focus:ring-slate-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function SegmentedChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <FieldShell label={label}>
      <div className="flex rounded-2xl border border-slate-200 bg-white p-1">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={[
                "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}

function StepperField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  onStep,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
  onStep: (delta: number) => void;
}) {
  return (
    <FieldShell label={label}>
      <div className="flex h-12 rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="w-12 border-r text-lg font-semibold hover:bg-slate-50"
        >
          –
        </button>
        <div className="flex flex-1 items-center justify-center gap-2">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={(e) =>
              onChange(
                clamp(Number(e.target.value), min, max)
              )
            }
            className="w-16 bg-transparent text-center text-base font-semibold outline-none"
          />
          {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
        </div>
        <button
          type="button"
          onClick={() => onStep(1)}
          className="w-12 border-l text-lg font-semibold hover:bg-slate-50"
        >
          +
        </button>
      </div>
    </FieldShell>
  );
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
