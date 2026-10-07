"use client";

type TabType = "general" | "notes";

interface ProductDetailsTabsProps {
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
}

export default function ProductDetailsTabs({
  activeTab = "general",
  onTabChange,
}: ProductDetailsTabsProps) {
  const handleTabClick = (tab: TabType) => {
    onTabChange?.(tab);
  };

  return (
    <div className="px-6 py-6">
      {/* Tabs */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-full border"
        style={{ 
          backgroundColor: "#201C35",
          borderColor: "#1B1926",
          height: "40px"
        }}
      >
        <button
          onClick={() => handleTabClick("general")}
          className="px-4 py-2 rounded-full text-xs font-medium transition-colors whitespace-nowrap"
          style={{
            backgroundColor:
              activeTab === "general" ? "#3C3854" : "transparent",
            color: activeTab === "general" ? "#FFFFFF" : "#9CA3AF",
          }}
        >
          General Information
        </button>
        <button
          onClick={() => handleTabClick("notes")}
          className="px-4 py-2 rounded-full text-xs font-medium transition-colors hover:bg-opacity-10 hover:bg-white whitespace-nowrap"
          style={{
            backgroundColor: activeTab === "notes" ? "#3C3854" : "transparent",
            color: activeTab === "notes" ? "#FFFFFF" : "#9CA3AF",
          }}
        >
          Notes
        </button>
      </div>
    </div>
  );
}
