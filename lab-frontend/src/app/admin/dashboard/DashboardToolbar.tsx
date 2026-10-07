"use client";

import { useState } from "react";
import { FunnelSimple, Export } from "@phosphor-icons/react";
import { NewScanModal } from "./NewScanModal";
import type { DashboardFilter } from "@/shared/api/dashboard";

type TabValue = "overview" | "insights" | "customers-dashboard";

type DashboardToolbarProps = {
  activeTab: TabValue;
  onTabChange: (tab: TabValue) => void;
  onFilterChange?: (filter: DashboardFilter) => void;
  onExport?: () => void | Promise<void>;
  exporting?: boolean;
};

type TimeFilter = "week" | "month" | "year";

export function DashboardToolbar({
  activeTab,
  onTabChange,
  onFilterChange,
  onExport,
  exporting,
}: DashboardToolbarProps) {
  const [showNewScanModal, setShowNewScanModal] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);

  const getTimeFilterLabel = () => {
    switch (timeFilter) {
      case "week":
        return "This Week";
      case "month":
        return "This Month";
      case "year":
        return "This Year";
    }
  };

  const applyRangePreset = (preset: TimeFilter) => {
    setTimeFilter(preset);
    setShowTimeDropdown(false);
    onFilterChange?.({ range: preset });
  };

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        {/* Dashboard title */}
        <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

        {/* Tabs and filters row */}
        <div className="flex items-center justify-between mb-6">
          {/* Tab navigation - Card style */}
          <div className="flex items-center gap-2 bg-[#201C35] rounded-full p-1" style={{ border: '1px solid #3C3854' }}>
            <button
              onClick={() => onTabChange("overview")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === "overview"
                  ? "bg-gradient-to-r from-[#3C3854] to-[#4B4474] text-white"
                  : "text-slate-400 hover:text-slate-300"
              }`}
              style={activeTab === "overview" ? { border: '1px solid #4B4474' } : {}}
            >
              Overview
            </button>
            <button
              onClick={() => onTabChange("insights")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === "insights"
                  ? "bg-gradient-to-r from-[#3C3854] to-[#4B4474] text-white"
                  : "text-slate-400 hover:text-slate-300"
              }`}
              style={activeTab === "insights" ? { border: '1px solid #4B4474' } : {}}
            >
              Insights
            </button>
            <button
              onClick={() => onTabChange("customers-dashboard")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === "customers-dashboard"
                  ? "bg-gradient-to-r from-[#3C3854] to-[#4B4474] text-white"
                  : "text-slate-400 hover:text-slate-300"
              }`}
              style={activeTab === "customers-dashboard" ? { border: '1px solid #4B4474' } : {}}
            >
              Customers
            </button>
          </div>

          {/* Right side filters and actions */}
          <div className="flex items-center gap-2">
            {/* Time filter dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowTimeDropdown(!showTimeDropdown)}
                className="rounded-lg bg-gradient-to-r from-[#3C3854] to-[#4B4474] hover:from-[#4A4562] hover:to-[#595282] text-white px-3 py-2 text-sm font-medium transition flex items-center gap-1.5"
              >
                <FunnelSimple size={16} weight="regular" />
                {getTimeFilterLabel()}
                <svg className={`w-4 h-4 transition-transform ${showTimeDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showTimeDropdown && (
                <div className="absolute top-full right-0 mt-2 w-40 rounded-lg bg-[#3C3254] border border-slate-700 shadow-xl z-50 overflow-hidden">
                  <button
                    onClick={() => applyRangePreset("week")}
                    className="w-full px-4 py-2.5 text-sm text-left text-slate-200 hover:bg-[#4C3F75] transition"
                  >
                    This Week
                  </button>
                  <button
                    onClick={() => applyRangePreset("month")}
                    className="w-full px-4 py-2.5 text-sm text-left text-slate-200 hover:bg-[#4C3F75] transition"
                  >
                    This Month
                  </button>
                  <button
                    onClick={() => applyRangePreset("year")}
                    className="w-full px-4 py-2.5 text-sm text-left text-slate-200 hover:bg-[#4C3F75] transition"
                  >
                    This Year
                  </button>
                </div>
              )}
            </div>

            {/* Export button */}
            {onExport && (
              <button
                type="button"
                onClick={() => onExport()}
                disabled={exporting}
                className="rounded-lg bg-gradient-to-r from-[#3C3854] to-[#4B4474] hover:from-[#4A4562] hover:to-[#595282] text-white px-3 py-2 text-sm font-medium transition flex items-center gap-1.5 disabled:opacity-60"
              >
                <Export size={16} weight="regular" />
                {exporting ? "Exporting…" : "Export"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* New Scan Modal */}
      {showNewScanModal && (
        <NewScanModal onClose={() => setShowNewScanModal(false)} />
      )}
    </>
  );
}
