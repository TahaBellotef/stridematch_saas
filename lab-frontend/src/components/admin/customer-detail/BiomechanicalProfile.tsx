"use client";

import {
  Boot as BootIcon,
  CalendarBlank as CalendarBlankIcon,
  CubeFocus as CubeFocusIcon,
  Footprints as FootprintsIcon,
  Lightning as LightningIcon,
} from "@phosphor-icons/react";
import { BiomechanicalData } from "./types";

interface BiomechanicalProfileProps {
  data: BiomechanicalData;
}

export function BiomechanicalProfile({ data }: BiomechanicalProfileProps) {
  const items = [
    {
      icon: FootprintsIcon,
      label: "Pronation",
      value: data.pronation,
      color: "#987DFF",
      chipBg: "rgba(152, 125, 255, 0.1)",
    },
    {
      icon: BootIcon,
      label: "Size",
      value: data.size,
      color: "#71A5FF",
      chipBg: "rgba(113, 165, 255, 0.1)",
    },
    {
      icon: LightningIcon,
      label: "Number of Scans",
      value: data.numberOfScans,
      color: "#59C88B",
      chipBg: "rgba(89, 200, 139, 0.1)",
    },
    {
      icon: CalendarBlankIcon,
      label: "Last Scan Date",
      value: data.lastScanDate,
      color: "#FBBB00",
      chipBg: "rgba(251, 187, 0, 0.1)",
    },
  ];

  return (
    <div className="mb-8">
      <div
        style={{ backgroundColor: "#28243D", border: "1px solid #3A3556" }}
        className="rounded-2xl p-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              backgroundColor: "rgba(74, 67, 112, 0.5)",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CubeFocusIcon size={22} color="#7EA8FF" />
          </div>
          <h2 className="text-sm font-medium text-white">Biomechanical Profile</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: "#2B2744",
                  border: "1px solid #3A3556",
                }}
                className="rounded-xl p-2"
              >
                <div className="flex items-center gap-2 px-1 py-1 mb-2">
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "8px",
                      border: `1px solid ${item.color}`,
                      backgroundColor: item.chipBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={22} color={item.color} />
                  </div>
                  <p className="text-sm font-medium text-slate-200 tracking-tight">
                    {item.label}
                  </p>
                </div>
                <div
                  style={{
                    backgroundColor: "#312D4B",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  className="rounded-xl px-4 py-3"
                >
                  <p className="text-3xl font-semibold text-white leading-tight">{item.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
