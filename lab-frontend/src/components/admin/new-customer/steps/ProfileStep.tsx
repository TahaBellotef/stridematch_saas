"use client";

import { useState } from "react";
import { Mail, ChevronUp, ChevronDown } from "lucide-react";
import { GenderNeuter, GenderMale, GenderFemale, CalendarHeart, IdentificationBadge, Barbell, Ruler } from "@phosphor-icons/react";

interface ProfileStepProps {
  onContinue: () => void;
  onClose: () => void;
}

type FieldErrors = Partial<Record<"firstName" | "lastName" | "email" | "sex" | "age" | "weight" | "weeklyDistance", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ProfileStep({ onContinue, onClose }: ProfileStepProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [sex, setSex] = useState<"Male" | "Female" | "Other" | null>(null);
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState(170);
  const [weeklyDistance, setWeeklyDistance] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const fieldClass =
    "w-full rounded-lg border border-[#3A335A] bg-[#1E1A34]/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50";
  const errorFieldClass = " border-red-500/70 focus:ring-red-500/50";

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};

    if (!firstName.trim()) next.firstName = "First name is required";
    if (!lastName.trim()) next.lastName = "Last name is required";

    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = "Enter a valid email address";
    }

    if (!sex) next.sex = "Sex is required";

    if (!age.trim()) {
      next.age = "Age is required";
    } else {
      const ageNum = Number(age);
      if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 120) {
        next.age = "Enter a valid age (1-120)";
      }
    }

    if (!weight) next.weight = "Weight is required";
    if (!weeklyDistance) next.weeklyDistance = "Weekly distance is required";

    return next;
  };

  const sexOptions = [
    { label: "Male", value: "Male" as const, color: "#6A47F4", icon: GenderMale },
    { label: "Female", value: "Female" as const, color: "#F472B6", icon: GenderFemale },
    { label: "Other", value: "Other" as const, color: "#94A3B8", icon: GenderNeuter },
  ];

  const weightOptions = [
    "40-50 kg",
    "50-60 kg",
    "60-70 kg",
    "70-80 kg",
    "80-90 kg",
    "90+ kg",
  ];

  const distanceOptions = [
    "0-10 km",
    "10-20 km",
    "20-30 km",
    "30-40 km",
    "40+ km",
  ];

  const handleContinue = () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const customerData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      sex,
      age,
      weight,
      height,
      weeklyDistance,
    };

    localStorage.setItem("__stridematch_newCustomer", JSON.stringify(customerData));
    onContinue();
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Fill the profile</h2>
        <button
          onClick={onClose}
          className="h-8 px-3 rounded-full text-sm text-white hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <div className="grid gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white mb-1 block">First Name *</label>
            <div className="relative">
              <IdentificationBadge className="w-4 h-4 text-white absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className={fieldClass + " pl-9" + (errors.firstName ? errorFieldClass : "")}
                placeholder="First name"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: undefined }));
                }}
              />
            </div>
            {errors.firstName && <p className="text-[11px] text-red-400 mt-1">{errors.firstName}</p>}
          </div>
          <div>
            <label className="text-xs text-white mb-1 block">Last Name *</label>
            <div className="relative">
              <IdentificationBadge className="w-4 h-4 text-white absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className={fieldClass + " pl-9" + (errors.lastName ? errorFieldClass : "")}
                placeholder="Last name"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: undefined }));
                }}
              />
            </div>
            {errors.lastName && <p className="text-[11px] text-red-400 mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <label className="text-xs text-white mb-1 block">Email *</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-white absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className={fieldClass + " pl-9" + (errors.email ? errorFieldClass : "")}
              type="email"
              placeholder="Type your email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
            />
          </div>
          {errors.email && <p className="text-[11px] text-red-400 mt-1">{errors.email}</p>}
        </div>

        <div>
          <label className="text-xs text-white mb-2 block">Sex *</label>
          <div className="grid grid-cols-3 gap-4">
            {sexOptions.map((option) => {
              const active = sex === option.value;
              const IconComponent = option.icon;
              // Convert hex color to rgba with 10% opacity for background
              const rgbaColor = option.color.replace('#', '').length === 6
                ? `rgba(${parseInt(option.color.slice(1, 3), 16)}, ${parseInt(option.color.slice(3, 5), 16)}, ${parseInt(option.color.slice(5, 7), 16)}, 0.1)`
                : "rgba(255,255,255,0.1)";
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setSex(option.value);
                    if (errors.sex) setErrors((prev) => ({ ...prev, sex: undefined }));
                  }}
                  style={{
                    backgroundColor: "#312D4B",
                    border: "1px solid rgba(0,0,0,0.5)",
                    boxShadow: active
                      ? `0 0 0 1px ${option.color}, 0 10px 20px rgba(0,0,0,0.35)`
                      : "0 10px 20px rgba(0,0,0,0.25)",
                  }}
                  className={`flex flex-col items-center justify-center rounded-2xl px-6 py-6 gap-2 transition-colors ${
                    active ? "text-white" : "text-slate-200 hover:text-white"
                  }`}
                >
                  <span
                    className="flex items-center justify-center rounded-lg p-2"
                    style={{ 
                      color: option.color,
                      backgroundColor: rgbaColor
                    }}
                  >
                    <IconComponent size={22} />
                  </span>
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
          {errors.sex && <p className="text-[11px] text-red-400 mt-1">{errors.sex}</p>}
        </div>

        <div>
          <label className="text-xs text-white mb-1 block">Age *</label>
          <div className="relative">
            <CalendarHeart className="w-4 h-4 text-white absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className={fieldClass + " pl-9" + (errors.age ? errorFieldClass : "")}
              type="text"
              inputMode="numeric"
              placeholder="Enter age"
              value={age}
              onChange={(e) => {
                const numericValue = e.target.value.replace(/[^0-9]/g, '');
                setAge(numericValue);
                if (errors.age) setErrors((prev) => ({ ...prev, age: undefined }));
              }}
            />
          </div>
          {errors.age && <p className="text-[11px] text-red-400 mt-1">{errors.age}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white mb-1 block">Weight *</label>
            <div className="relative">
              <Barbell className="w-4 h-4 text-white absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                className={`${fieldClass} bg-[#1E1A34]/80 pl-9` + (errors.weight ? errorFieldClass : "")}
                style={{ backgroundColor: "#1E1A34" }}
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  if (errors.weight) setErrors((prev) => ({ ...prev, weight: undefined }));
                }}
              >
                <option value="">Select weight</option>
                {weightOptions.map((opt) => (
                  <option key={opt} value={opt} className="bg-[#1E1A34] text-slate-100">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            {errors.weight && <p className="text-[11px] text-red-400 mt-1">{errors.weight}</p>}
          </div>
          <div>
            <label className="text-xs text-white mb-1 block">Height</label>
            <div
              style={{ backgroundColor: "#1E1A34" }}
              className="flex items-center justify-between rounded-lg border border-[#3A335A] px-3 py-2 h-10"
            >
              <button
                type="button"
                onClick={() => setHeight((prev) => Math.max(100, prev - 1))}
                className="w-8 h-8 rounded border border-[#3A335A] text-slate-200 flex items-center justify-center hover:bg-white/10 font-semibold"
              >
                −
              </button>
              <div className="text-sm text-white font-semibold">
                {height} cm
              </div>
              <button
                type="button"
                onClick={() => setHeight((prev) => Math.min(220, prev + 1))}
                className="w-8 h-8 rounded border border-[#3A335A] text-slate-200 flex items-center justify-center hover:bg-white/10 font-semibold"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-white mb-1 block">Distance Hebdomadaire *</label>
          <div className="relative">
            <Ruler className="w-4 h-4 text-white absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              className={`${fieldClass} bg-[#1E1A34]/80 pl-9` + (errors.weeklyDistance ? errorFieldClass : "")}
              style={{ backgroundColor: "#1E1A34" }}
              value={weeklyDistance}
              onChange={(e) => {
                setWeeklyDistance(e.target.value);
                if (errors.weeklyDistance) setErrors((prev) => ({ ...prev, weeklyDistance: undefined }));
              }}
            >
              <option value="">Select distance</option>
              {distanceOptions.map((opt) => (
                <option key={opt} value={opt} className="bg-[#1E1A34] text-slate-100">
                  {opt}
                </option>
              ))}
            </select>
          </div>
          {errors.weeklyDistance && <p className="text-[11px] text-red-400 mt-1">{errors.weeklyDistance}</p>}
        </div>

      </div>

      <div className="pt-2">
        <button
          onClick={handleContinue}
          className="w-full rounded-full bg-gradient-to-r from-[#6A47F4] to-[#6A47F4] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/40 hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
