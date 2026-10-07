"use client";

import { ReactNode } from "react";

interface MetricCardProps {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  value: string;
  subtitle?: string;
  showProgress?: boolean;
  progressPercentage?: number;
  progressColor?: string;
  noBadge?: boolean;
}

export function MetricCard({
  icon,
  iconColor,
  title,
  value,
  subtitle = "",
  showProgress = false,
  progressPercentage = 0,
  progressColor = "#8b5cf6",
  noBadge = false,
}: MetricCardProps) {
  // Extract percentage and remaining text
  const percentageMatch = !noBadge ? subtitle.match(/([+-]?\d+%)/) : null;
  const percentage = percentageMatch ? percentageMatch[0] : "";
  const isPositive = percentage.startsWith("+");
  const percentageColor = isPositive ? "#59C88B" : "#BD3D44";
  const remainingText = subtitle.replace(percentage, "").trim();

  return (
    <div
      className="rounded-2xl border flex flex-col w-full"
      style={{
        backgroundColor: "var(--sm-fill)",
        borderColor: "#1B1926",
        height: "190px",
        padding: "16px 8px",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 pl-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center border"
            style={{ 
              backgroundColor: "#312D4B", 
              borderColor: `${iconColor}60`
            }}
          >
            <div style={{ color: iconColor }}>{icon}</div>
          </div>
          <span className="text-sm font-medium text-slate-300">{title}</span>
        </div>
        <button className="text-slate-500 hover:text-slate-300 transition">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
      <div
        className="rounded-2xl border flex flex-col w-full"
        style={{
          backgroundColor: "#312D4B",
          borderColor: "#201C35",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.03)",
          height: "128px",
          padding: "16px",
          gap: "8px",
        }}
      >
        <div className="text-2xl font-bold text-white leading-tight">{value}</div>
        {!showProgress && percentage && (
          <div className="flex items-center gap-2">
            <div
              className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: isPositive ? "rgba(89, 200, 139, 0.15)" : "rgba(189, 61, 68, 0.15)",
                color: percentageColor,
                fontSize: "10px",
              }}
            >
              {percentage}
            </div>
            <span className="text-xs text-slate-500">{remainingText}</span>
          </div>
        )}
        {!showProgress && !percentage && subtitle && (
          <span className="text-xs text-slate-500">{subtitle}</span>
        )}
        {showProgress && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-slate-500">{subtitle}</span>
            <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: "#1F1F1F" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPercentage}%`,
                  backgroundColor: progressColor,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
