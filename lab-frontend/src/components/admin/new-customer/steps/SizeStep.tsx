"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCustomer,
  createCustomerProfile,
  fetchCustomers,
} from "@/features/lab/services/customer.service";

const PENDING_CUSTOMER_KEY = "lab:pendingCustomer";

interface SizeStepProps {
  onBack: () => void;
  onClose: () => void;
}

const sizeTabs = ["EU", "UK", "US"];
const buildHalfStepSizes = (start: number, end: number): string[] => {
  const result: string[] = [];
  for (let i = Math.round(start * 2); i <= Math.round(end * 2); i += 1) {
    const value = i / 2;
    result.push(Number.isInteger(value) ? String(value) : value.toFixed(1));
  }
  return result;
};

const sizeOptionsByTab: Record<string, string[]> = {
  EU: buildHalfStepSizes(35, 55),
  UK: buildHalfStepSizes(3, 21),
  US: buildHalfStepSizes(4, 22),
};

export function SizeStep({ onBack, onClose }: SizeStepProps) {
  const router = useRouter();
  const [knowsSize, setKnowsSize] = useState<boolean | null>(null);
  const [tab, setTab] = useState<string>("EU");
  const [selectedSizeByTab, setSelectedSizeByTab] = useState<Record<string, string | null>>({
    EU: "35",
    UK: "3",
    US: "4",
  });
  const [submitting, setSubmitting] = useState(false);
  const [startingFootScan, setStartingFootScan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Creates the Cognito user + profile from the data collected across the wizard. Returns the new profile id, or null on failure (error state is already set). */
  const createCustomerRecord = async (): Promise<string | null> => {
    // Get stored customer data from ProfileStep (using localStorage for persistence)
    const storedData = localStorage.getItem("__stridematch_newCustomer");
    if (!storedData) {
      setError("Customer data not found. Please start over.");
      console.error("[SizeStep] ❌ Customer data not found in localStorage");
      return null;
    }

    let customerData;
    try {
      customerData = JSON.parse(storedData);
    } catch (parseErr) {
      console.error("[SizeStep] ❌ Failed to parse JSON:", parseErr);
      setError("Invalid customer data format. Please start over.");
      return null;
    }

    const updatedData = {
      ...customerData,
      shoeSize: knowsSize ? selectedSizeByTab[tab] : undefined,
      shoeSizeUnit: knowsSize ? tab : undefined,
    };

    localStorage.setItem("__stridematch_newCustomer", JSON.stringify(updatedData));

    const given_name = customerData.firstName?.trim();
    const family_name = customerData.lastName?.trim() || undefined;
    const email = customerData.email?.trim();

    if (!given_name || !email) {
      console.error("[SizeStep] ❌ Missing required profile data");
      setError("Customer data is incomplete. Please start over.");
      return null;
    }

    const full_name = [given_name, family_name].filter(Boolean).join(" ");

    // Create customer in AWS Cognito via backend
    await createCustomer({ email, given_name, family_name });

    const surfaces = updatedData.surfaces || {};
    const shoePreferences = updatedData.shoePreferences || {};

    const parseWeightKg = (raw?: string): number | undefined => {
      if (!raw) return undefined;
      const range = raw.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
      if (range) {
        return (Number(range[1]) + Number(range[2])) / 2;
      }
      const plus = raw.match(/(\d+(?:\.\d+)?)\+/);
      if (plus) return Number(plus[1]);
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const profilePayload = {
      email,
      given_name,
      family_name,
      full_name,
      sex: updatedData.sex ? String(updatedData.sex).trim().toLowerCase() : undefined,
      age: updatedData.age ? Number(updatedData.age) : undefined,
      height:
        updatedData.height !== undefined && updatedData.height !== null
          ? Number(updatedData.height)
          : undefined,
      weight: parseWeightKg(updatedData.weight),
      weekly_distance: updatedData.weeklyDistance || undefined,
      preferred_surfaces: Object.keys(surfaces).filter((key) => surfaces[key]),
      running_duration: updatedData.runningDuration || undefined,
      runs_per_week: updatedData.timesPerWeek || undefined,
      distance_per_week: updatedData.kmsPerWeek || undefined,
      shoe_preferences: Object.keys(shoePreferences).filter((key) => shoePreferences[key]),
      shoe_size: updatedData.shoeSize || undefined,
      shoe_size_unit: updatedData.shoeSizeUnit || undefined,
    };

    const profileResult = await createCustomerProfile(profilePayload);

    // Clear stored data
    localStorage.removeItem("__stridematch_newCustomer");

    if (profileResult?.id) {
      return profileResult.id;
    }

    // The create call didn't hand back an id — give the write a moment to
    // land, then resolve it by email instead of trusting an empty response.
    console.warn("[SizeStep] customer-profile response had no id, retrying lookup by email");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const allCustomers = await fetchCustomers();
      const match = allCustomers.find((c) => c.email.toLowerCase() === email.toLowerCase());
      if (match?.id) {
        return match.id;
      }
    }

    setError("Customer was created, but its ID could not be retrieved. Please select them manually from the customer list.");
    return null;
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const id = await createCustomerRecord();
      if (!id) return;
      onClose();
    } catch (err: any) {
      console.error("[SizeStep] ❌ Error creating customer:", err);
      setError(err.message || "Failed to create customer");
    } finally {
      setSubmitting(false);
    }
  };

  /** Unknown size — create the customer now, then send them straight into a
   * 3D foot scan so their size gets measured instead of guessed. */
  const handleStartFootScan = async () => {
    try {
      setStartingFootScan(true);
      setError(null);
      const id = await createCustomerRecord();
      if (!id) return;
      try {
        sessionStorage.setItem(PENDING_CUSTOMER_KEY, JSON.stringify({ id }));
      } catch {
        // Ignore storage failures and continue flow.
      }
      onClose();
      router.push("/foot-scan-steps");
    } catch (err: any) {
      console.error("[SizeStep] ❌ Error creating customer:", err);
      setError(err.message || "Failed to create customer");
    } finally {
      setStartingFootScan(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Create New Customer</h2>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-white">Do you know your shoe size? *</p>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setKnowsSize(true)}
            className={`rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${
              knowsSize === true
                ? "border-indigo-400 bg-[#211B3C] text-white"
                : "border-[#3A335A] bg-[#1E1A34]/60 text-slate-200 hover:border-indigo-400/70 hover:text-white"
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => setKnowsSize(false)}
            className={`rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${
              knowsSize === false
                ? "border-indigo-400 bg-[#211B3C] text-white"
                : "border-[#3A335A] bg-[#1E1A34]/60 text-slate-200 hover:border-indigo-400/70 hover:text-white"
            }`}
          >
            No
          </button>
        </div>

        {knowsSize === true && (
          <div className="space-y-2 pt-2">
            <p className="text-sm font-semibold text-white">Select Shoe Size</p>

            <div className="grid grid-cols-3 gap-1 rounded-full border border-[#3A335A] bg-[#1E1A34]/70 p-1 text-sm text-slate-200">
              {sizeTabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full py-2 text-sm font-medium transition-colors ${
                    tab === t
                      ? "border border-[#6F68A0] bg-[#5A537F] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-slate-400 hover:bg-[#211B3C]/60 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-2 mt-2">
              {sizeOptionsByTab[tab].map((size, index) => {
                const active = selectedSizeByTab[tab] === size;
                return (
                  <button
                    key={`${tab}-${index}`}
                    onClick={() =>
                      setSelectedSizeByTab((current) => ({
                        ...current,
                        [tab]: size,
                      }))
                    }
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      active
                        ? "border-indigo-400 bg-[#211B3C] text-white"
                        : "border-[#3A335A] bg-[#1E1A34]/60 text-slate-200 hover:border-indigo-400/70 hover:text-white"
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {knowsSize === false && (
          <div className="space-y-2 pt-2">
            <div className="rounded-lg border border-[#3A335A] bg-[#1E1A34]/60 px-4 py-3 text-sm text-slate-300">
              No problem — create the customer now and measure their feet with a 3D foot scan instead of guessing.
            </div>
            <button
              onClick={handleStartFootScan}
              disabled={submitting || startingFootScan}
              className="w-full rounded-full border border-indigo-400 bg-[#211B3C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2A2350] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {startingFootScan ? "Creating customer…" : "3D Foot Scan"}
            </button>
          </div>
        )}
      </div>

      <div className="pt-2 flex justify-between gap-3">
        <button
          onClick={onBack}
          disabled={submitting || startingFootScan}
          className="rounded-full border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || startingFootScan || knowsSize === null}
          className="w-full md:w-48 rounded-full bg-gradient-to-r from-[#6A47F4] to-[#6A47F4] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/40 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Creating..." : "Create Customer"}
        </button>
      </div>
    </div>
  );
}