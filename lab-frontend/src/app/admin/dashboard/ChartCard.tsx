"use client";

import { ReactNode, CSSProperties } from "react";

interface ChartCardProps {
  icon?: ReactNode;
  iconBgColor?: string;
  iconColor?: string;
  title: string;
  children: ReactNode;
  colSpan?: 1 | 2;
  style?: CSSProperties;
  noInnerCard?: boolean;
  headerAction?: ReactNode;
  width?: string;
  height?: string;
  innerWidth?: string;
  innerHeight?: string;
}

export function ChartCard({
  icon,
  iconBgColor,
  iconColor,
  title,
  children,
  colSpan = 1,
  style,
  noInnerCard = false,
  headerAction,
  width,
  height,
  innerWidth,
  innerHeight,
}: ChartCardProps) {
  return (
    <div
      className={`${colSpan === 2 ? 'lg:col-span-2' : 'lg:col-span-1'} rounded-2xl border flex flex-col`}
      style={{
        backgroundColor: "#28243D",
        borderColor: "#1B1926",
        width: width,
        height: height,
        padding: "16px 8px",
        ...style,
      }}
    >
      {/* Header with title and menu */}
      <div className="flex items-center justify-between mb-4">
        {icon ? (
          <div className="flex items-center gap-3 pl-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{ 
                backgroundColor: iconBgColor, 
                borderColor: `${iconColor}60`
              }}
            >
              <div style={{ color: iconColor }}>{icon}</div>
            </div>
            <span className="text-sm font-medium text-slate-300">{title}</span>
          </div>
        ) : (
          <span className="text-sm font-medium text-white pl-2">{title}</span>
        )}
        {headerAction ? (
          headerAction
        ) : (
          <button className="text-slate-500 hover:text-slate-300 transition">
            <svg
              className="h-5 w-5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
        )}
      </div>

      {/* Conditionally render inner card wrapper */}
      {noInnerCard ? (
        children
      ) : (
        <div
          className="rounded-2xl border w-full flex-1"
          style={{
            backgroundColor: "#312D4B",
            borderColor: "#201C35",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.03)",
            width: innerWidth,
            height: innerHeight,
            padding: "16px"
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
