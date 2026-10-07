"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  createCustomerProfile,
  type CustomerRow,
  type CreateCustomerProfilePayload,
} from "@/features/lab/services/customer.service";
import { useToast } from "@/components/shared/Toast";

interface EditCustomerModalProps {
  open: boolean;
  customer: CustomerRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const RUNNING_DURATION_OPTIONS = [
  "Less than 6 months",
  "6 months to 1 year",
  "1 year to 3 years",
  "More than 3 years",
];

const RUNS_PER_WEEK_OPTIONS = ["One", "2 to 3", "4 to 5", "Everyday"];

const DISTANCE_PER_WEEK_OPTIONS = ["<10", "10 to 20", "20 to 30", ">30"];

const WEEKLY_DISTANCE_OPTIONS = [
  "0-10 km",
  "10-20 km",
  "20-30 km",
  "30-40 km",
  "40+ km",
];

const SURFACE_OPTIONS = ["Treadmill", "Route", "Trail", "Piste"];

const SHOE_PREFERENCE_OPTIONS = [
  "Cushioning Comfort",
  "Performance and Speed",
  "Stability and Support",
  "Versatility and Everyday Use",
];

const SHOE_SIZE_UNITS = ["EU", "UK", "US"];

const emptyForm = (): CreateCustomerProfilePayload => ({
  email: "",
  given_name: "",
  family_name: "",
  full_name: "",
  sex: "",
  age: undefined,
  height: undefined,
  weight: undefined,
  weekly_distance: "",
  preferred_surfaces: [],
  running_duration: "",
  runs_per_week: "",
  distance_per_week: "",
  shoe_preferences: [],
  shoe_size: "",
  shoe_size_unit: "",
});

function normalizeSex(value?: string | null): string {
  if (!value) return "";
  const lower = value.trim().toLowerCase();
  if (lower === "male" || lower === "female" || lower === "other") {
    return lower;
  }
  return "";
}

function profileToForm(customer: CustomerRow): CreateCustomerProfilePayload {
  const p = customer.profile;
  return {
    email: p.email,
    customer_id: p.customer_id || p.id,
    given_name: p.given_name || "",
    family_name: p.family_name || "",
    full_name: p.full_name || customer.name,
    sex: normalizeSex(p.sex),
    age: p.age ?? undefined,
    height: p.height ?? undefined,
    weight: p.weight ?? undefined,
    weekly_distance: p.weekly_distance || "",
    preferred_surfaces: p.preferred_surfaces || [],
    running_duration: p.running_duration || "",
    runs_per_week: p.runs_per_week || "",
    distance_per_week: p.distance_per_week || "",
    shoe_preferences: p.shoe_preferences || [],
    shoe_size: p.shoe_size || "",
    shoe_size_unit: p.shoe_size_unit || "",
  };
}

export function EditCustomerModal({
  open,
  customer,
  onClose,
  onSaved,
}: EditCustomerModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateCustomerProfilePayload>(emptyForm);
  const { showToast } = useToast();

  useEffect(() => {
    if (!customer) return;
    setForm(profileToForm(customer));
    setError(null);
  }, [customer]);

  if (!open || !customer) return null;

  const toggleArrayValue = (
    key: "preferred_surfaces" | "shoe_preferences",
    value: string
  ) => {
    const current = form[key] || [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    setForm({ ...form, [key]: next });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const full_name =
        form.full_name?.trim() ||
        [form.given_name, form.family_name].filter(Boolean).join(" ").trim() ||
        undefined;

      await createCustomerProfile({
        ...form,
        full_name,
        sex: normalizeSex(form.sex) || undefined,
        age: form.age !== undefined && form.age !== null ? Number(form.age) : undefined,
        height:
          form.height !== undefined && form.height !== null ? Number(form.height) : undefined,
        weight:
          form.weight !== undefined && form.weight !== null ? Number(form.weight) : undefined,
        preferred_surfaces: form.preferred_surfaces?.length
          ? form.preferred_surfaces
          : undefined,
        shoe_preferences: form.shoe_preferences?.length ? form.shoe_preferences : undefined,
      });
      onSaved();
      onClose();
      showToast("success", "Customer updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update customer";
      setError(message);
      showToast("error", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0A14]/70 backdrop-blur-sm px-4 py-6">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[#1F1F1F] shadow-2xl"
        style={{ backgroundColor: "#28243D" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#1F1F1F] px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Edit Customer</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#3A335A] p-2 text-slate-300 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            <Section title="Identity">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First name">
                  <input
                    value={form.given_name || ""}
                    onChange={(e) => setForm({ ...form, given_name: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Last name">
                  <input
                    value={form.family_name || ""}
                    onChange={(e) => setForm({ ...form, family_name: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Full name">
                <input
                  value={form.full_name || ""}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Email">
                <input value={form.email} disabled className={`${inputClass} opacity-60`} />
              </Field>
            </Section>

            <Section title="Body profile">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Age">
                  <input
                    type="number"
                    min={0}
                    value={form.age ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        age: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Sex">
                  <select
                    value={form.sex || ""}
                    onChange={(e) => setForm({ ...form, sex: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Height (cm)">
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={form.height ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        height: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Weight (kg)">
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={form.weight ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        weight: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Running habits">
              <Field label="Weekly distance">
                <select
                  value={form.weekly_distance || ""}
                  onChange={(e) => setForm({ ...form, weekly_distance: e.target.value })}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {WEEKLY_DISTANCE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="How long have you been running?">
                <select
                  value={form.running_duration || ""}
                  onChange={(e) => setForm({ ...form, running_duration: e.target.value })}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {RUNNING_DURATION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Runs per week">
                  <select
                    value={form.runs_per_week || ""}
                    onChange={(e) => setForm({ ...form, runs_per_week: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {RUNS_PER_WEEK_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Distance per week (km)">
                  <select
                    value={form.distance_per_week || ""}
                    onChange={(e) => setForm({ ...form, distance_per_week: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {DISTANCE_PER_WEEK_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <CheckboxGroup
                label="Preferred surfaces"
                options={SURFACE_OPTIONS}
                selected={form.preferred_surfaces || []}
                onToggle={(value) => toggleArrayValue("preferred_surfaces", value)}
              />
            </Section>

            <Section title="Shoe preferences">
              <CheckboxGroup
                label="Shoe type preferences"
                options={SHOE_PREFERENCE_OPTIONS}
                selected={form.shoe_preferences || []}
                onToggle={(value) => toggleArrayValue("shoe_preferences", value)}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Shoe size">
                  <input
                    value={form.shoe_size || ""}
                    onChange={(e) => setForm({ ...form, shoe_size: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Size unit">
                  <select
                    value={form.shoe_size_unit || ""}
                    onChange={(e) => setForm({ ...form, shoe_size_unit: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {SHOE_SIZE_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Section>
          </div>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="sticky bottom-0 mt-6 flex justify-end gap-3 border-t border-[#1F1F1F] bg-[#28243D] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-[#2F2B4A] bg-[#262243] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-300">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function CheckboxGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <span className="mb-2 block text-xs font-medium text-slate-400">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                  : "border-[#3A335A] bg-[#1E1A34]/60 text-slate-300 hover:border-indigo-400/50"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
