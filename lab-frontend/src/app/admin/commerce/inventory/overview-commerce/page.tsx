"use client";

import { useEffect, useState } from "react";
import {
  ChartLineUp,
  CardsThree,
  Tray,
  HandDeposit,
  Trophy,
} from "@phosphor-icons/react";
import { MetricCard } from "@/app/admin/dashboard/MetricCard";
import { ChartCard } from "@/app/admin/dashboard/ChartCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { getCatalogOverview, type CatalogOverviewResponse } from "@/shared/api/catalog";

const DONUT_CIRCUMFERENCE = 2 * Math.PI * 90; // r=90

const GENDER_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  unisex: { bg: "#1C5D46", color: "#59C88B", label: "Unisex" },
  male: { bg: "#3A2D7B", color: "#7E64FF", label: "Male" },
  female: { bg: "#6A4B15", color: "#F5A524", label: "Female" },
  unspecified: { bg: "#3A3550", color: "#9CA3AF", label: "Unspecified" },
};

const STOCK_DONUT_COLORS = ["#4B21EF", "#D35C66"];

function getGenderStyle(gender: string | null) {
  return GENDER_COLORS[gender ?? "unspecified"] ?? GENDER_COLORS.unspecified;
}

export default function OverviewCommerce() {
  const [data, setData] = useState<CatalogOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getCatalogOverview()
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load catalog overview.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {error || "No catalog data available."}
      </div>
    );
  }

  const stats = [
    {
      icon: <Tray size={18} weight="regular" />,
      iconColor: "#60E497",
      title: "Total Products",
      value: data.total_products.toLocaleString(),
      subtitle: "in catalog",
    },
    {
      icon: <HandDeposit size={18} weight="regular" />,
      iconColor: "#6A5AF9",
      title: "Active Products",
      value: data.active_products.toLocaleString(),
      subtitle: `${data.inactive_products.toLocaleString()} inactive`,
    },
  ];

  const stockTotal = data.active_products + data.inactive_products || 1;
  const activeLength = (data.active_products / stockTotal) * DONUT_CIRCUMFERENCE;
  const inactiveLength = (data.inactive_products / stockTotal) * DONUT_CIRCUMFERENCE;

  const genderTotal = data.gender_breakdown.reduce((sum, g) => sum + g.count, 0) || 1;

  return (
    <div className="space-y-6">
      {/* Top Row: Catalog Status + Gender Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Catalog Status */}
        <ChartCard
          title="Catalog Status"
          icon={<ChartLineUp size={18} weight="regular" />}
          iconBgColor="#312D4B"
          iconColor="#4B21EF"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-8 h-full">
            <div className="flex items-center justify-center md:w-[45%]">
              <div className="relative w-48 h-48 sm:w-56 sm:h-56">
                <svg
                  className="transform -rotate-90"
                  viewBox="0 0 240 240"
                  width="100%"
                  height="100%"
                >
                  <circle cx="120" cy="120" r="90" fill="none" stroke="#28243D" strokeWidth="35" />
                  <circle
                    cx="120"
                    cy="120"
                    r="90"
                    fill="none"
                    stroke={STOCK_DONUT_COLORS[0]}
                    strokeWidth="35"
                    strokeDasharray={`${activeLength} ${DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset="0"
                    className="transition-all duration-1000"
                  />
                  <circle
                    cx="120"
                    cy="120"
                    r="90"
                    fill="none"
                    stroke={STOCK_DONUT_COLORS[1]}
                    strokeWidth="35"
                    strokeDasharray={`${inactiveLength} ${DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset={`-${activeLength}`}
                    className="transition-all duration-1000"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-white">
                    {data.total_products.toLocaleString()}
                  </div>
                  <div className="text-slate-400 text-sm mt-1">Total Products</div>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-4">
              {[
                { label: "Active Products", value: data.active_products, color: STOCK_DONUT_COLORS[0] },
                { label: "Inactive Products", value: data.inactive_products, color: STOCK_DONUT_COLORS[1] },
              ].map((level) => (
                <div key={level.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: level.color }}
                      />
                      <span className="text-slate-400 text-sm">{level.label}</span>
                    </div>
                    <span className="text-slate-300 text-sm">{level.value.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-[#211D31] rounded-full overflow-hidden" style={{ height: "8px" }}>
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${(level.value / stockTotal) * 100}%`,
                        backgroundColor: level.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* Gender Breakdown */}
        <ChartCard
          title="Catalog by Gender"
          icon={<CardsThree size={18} weight="regular" />}
          iconBgColor="#312D4B"
          iconColor="#4B21EF"
        >
          <div className="mb-4">
            <p className="text-slate-400 text-xs mb-2">Total products</p>
            <span className="text-2xl font-bold text-white">{data.total_products.toLocaleString()}</span>
          </div>

          <div className="space-y-2">
            {data.gender_breakdown.map((segment) => {
              const style = getGenderStyle(segment.gender);
              return (
                <div key={segment.gender} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-sm"
                      style={{ backgroundColor: style.color }}
                    />
                    <span className="text-slate-300 text-sm">{style.label}</span>
                  </div>
                  <span className="text-slate-400 text-sm">
                    {segment.count.toLocaleString()} products ({Math.round((segment.count / genderTotal) * 100)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      {/* Bottom Row: Small Cards + Top Brands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left side: 2x2 grid of stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {stats.map((stat, index) => (
            <MetricCard
              key={index}
              icon={stat.icon}
              iconColor={stat.iconColor}
              title={stat.title}
              value={stat.value}
              subtitle={stat.subtitle}
            />
          ))}
        </div>

        {/* Top Brands */}
        <ChartCard
          title="Top Brands"
          icon={<Trophy size={18} weight="regular" />}
          iconBgColor="#312D4B"
          iconColor="#4B21EF"
          noInnerCard={true}
        >
          {data.top_brands.map((brand) => {
            const style = getGenderStyle(brand.top_gender);
            return (
              <div
                key={brand.brand}
                className="rounded-lg p-4 border mb-3 last:mb-0"
                style={{
                  backgroundColor: "var(--sm-content)",
                  borderColor: "rgba(255,255,255,0.04)",
                }}
              >
                <div className="flex items-center gap-4">
                  {/* Brand Avatar */}
                  <div
                    className="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: "#1E1B2E" }}
                  >
                    <span className="text-white font-semibold text-sm">
                      {brand.brand.slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  {/* Brand Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium mb-2 text-base truncate">{brand.brand}</h4>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="px-3 rounded-md text-xs font-medium"
                        style={{
                          backgroundColor: "#48416E",
                          color: "#FFFFFF",
                          height: "20px",
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        {brand.product_count} Products
                      </span>

                      <span className="text-slate-600">•</span>

                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: style.bg, color: style.color }}
                      >
                        {style.label}
                      </span>

                      <span className="text-slate-600">•</span>

                      <span className="text-slate-400 text-xs text-white">
                        {brand.active_count} active
                      </span>

                      <span className="text-slate-600">•</span>

                      <span className="text-slate-400 text-xs text-white">
                        {brand.inactive_count} inactive
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </ChartCard>
      </div>
    </div>
  );
}
