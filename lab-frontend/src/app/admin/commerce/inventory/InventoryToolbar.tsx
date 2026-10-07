"use client";

import { useState } from "react";
import { SquaresFour, Rows, Export } from "@phosphor-icons/react";
import { fetchInventoryItems } from "./products-commerce/catalogClient";

type TabType = "overview" | "products";
type ViewType = "grid" | "list";

interface InventoryToolbarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  viewType?: ViewType;
  onViewChange?: (view: ViewType) => void;
}

export default function InventoryToolbar({
  activeTab,
  onTabChange,
  viewType = "grid",
  onViewChange
}: InventoryToolbarProps) {
  const [exporting, setExporting] = useState(false);

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const items = await fetchInventoryItems(1000);
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventory-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export inventory:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Inventory</h1>
      </div>

      {/* Combined Tab navigation and Actions */}
      <div className="flex items-center justify-between mb-6">
        {/* Tab navigation - Card style matching Dashboard */}
        <div className="flex items-center gap-2 bg-[#201C35] rounded-full p-1">
          <button
            onClick={() => onTabChange("overview")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === "overview"
                ? "bg-gradient-to-r from-[#3C3854] to-[#4B4474] text-white"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => onTabChange("products")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === "products"
                ? "bg-gradient-to-r from-[#3C3854] to-[#4B4474] text-white"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            Products
          </button>
        </div>

        {/* Actions based on active tab */}
        {activeTab === "products" && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-[#201C35] p-1">
              <button
                onClick={() => onViewChange?.("grid")}
                className={`p-2 rounded-full transition ${
                  viewType === "grid"
                    ? "bg-gradient-to-r from-[#3C3854] to-[#4B4474] text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <SquaresFour size={16} weight="regular" />
              </button>
              <button
                onClick={() => onViewChange?.("list")}
                className={`p-2 rounded-full transition ${
                  viewType === "list"
                    ? "bg-gradient-to-r from-[#3C3854] to-[#4B4474] text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Rows size={16} weight="regular" />
              </button>
            </div>
            <button
              onClick={handleExportJson}
              disabled={exporting}
              className="rounded-lg bg-gradient-to-r from-[#3C3854] to-[#4B4474] hover:from-[#4A4562] hover:to-[#595282] text-white px-3 py-2 text-sm font-medium transition flex items-center gap-1.5 disabled:opacity-60"
            >
              <Export size={16} weight="regular" />
              {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
