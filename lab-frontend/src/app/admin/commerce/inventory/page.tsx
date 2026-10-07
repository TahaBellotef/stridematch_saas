"use client";

import { useState } from "react";
import InventoryToolbar from "./InventoryToolbar";
import OverviewCommerce from "./overview-commerce/page";
import GridView from "./products-commerce/GridView";
import ListView from "./products-commerce/ListView";

type TabType = "overview" | "products";
type ViewType = "grid" | "list";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [viewType, setViewType] = useState<ViewType>("grid");

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "var(--sm-fill)" }}>
      {/* Toolbar with tabs */}
      <InventoryToolbar 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        viewType={viewType}
        onViewChange={setViewType}
      />

      {/* Tab Content */}
      <div className="mx-auto w-full max-w-7xl px-6">
        {activeTab === "overview" && <OverviewCommerce />}
        {activeTab === "products" && (
          <>
            {viewType === "grid" ? <GridView /> : <ListView />}
          </>
        )}
      </div>
    </div>
  );
}
