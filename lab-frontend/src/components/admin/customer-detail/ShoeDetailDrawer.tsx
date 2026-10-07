"use client";

import Image from "next/image";
import {
  X,
  Sneaker,
  Wind,
  ThumbsUp,
  ThumbsDown,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { ShoeRecommendation } from "./types";

interface ShoeDetailDrawerProps {
  shoe: ShoeRecommendation | null;
  onClose: () => void;
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: "#28243D", border: "1px solid #1B1926" }}>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{ width: "36px", height: "36px", backgroundColor: "#2B2643", border: "1px solid #59C88B" }}
        >
          {icon}
        </div>
        <h3 className="text-white text-base font-medium">{title}</h3>
      </div>
      <div className="rounded-xl p-4 w-full" style={{ backgroundColor: "#2B2643", border: "1px solid #1B1926" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <p className="text-slate-500 text-sm">{label}</p>
      <p className="text-white text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}

function splitList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function ShoeDetailDrawer({ shoe, onClose }: ShoeDetailDrawerProps) {
  if (!shoe) return null;

  const meta = shoe.metadata || {};
  const pros = splitList(meta.pros);
  const cons = splitList(meta.cons);
  const category = meta.category || shoe.terrain;
  const archSupport = meta.arch_support;
  const cushioningLevel = meta.cushioning_level || shoe.stability;
  const breathability = meta.breathability_score;
  const energyReturn = meta.energy_return_pct;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />

      <div
        className="fixed right-0 top-0 bottom-0 w-[600px] max-w-full z-50 overflow-y-auto"
        style={{ backgroundColor: "#1E1B30" }}
      >
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid #2F2B49" }}>
          <h2 className="text-white text-lg font-semibold">Shoe Details</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <X size={18} color="#E2E8F0" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Image + header */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#28243D", border: "1px solid #1B1926" }}>
            <div
              className="rounded-xl flex items-center justify-center relative overflow-hidden mb-4"
              style={{ height: "220px", backgroundColor: "#201C35" }}
            >
              <Image
                src={shoe.imageUrl || "/shoe.png"}
                alt={shoe.model || "Shoe"}
                fill
                className="object-contain p-4"
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-white font-semibold text-xl leading-tight">{shoe.brand || "—"}</h3>
                <p className="text-slate-300 text-lg leading-tight">{shoe.model || "—"}</p>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-400/20 text-emerald-300 border border-emerald-400/50 whitespace-nowrap">
                ⦿ {shoe.matchPercentage}% MATCH
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              {category && (
                <span className="px-2 py-1 rounded-md text-xs text-slate-200 bg-[#4A4669] border border-white/10">
                  {category}
                </span>
              )}
              {shoe.gender && (
                <span className="px-2 py-1 rounded-md text-xs text-slate-200 bg-[#4A4669] border border-white/10">
                  {shoe.gender}
                </span>
              )}
            </div>
          </div>

          {/* Main features */}
          <SectionCard icon={<Sneaker size={20} weight="bold" color="#59C88B" />} title="Main Features">
            <div className="space-y-4">
              <Row label="Weight" value={shoe.weightG != null ? `${shoe.weightG} g` : null} />
              <Row label="Drop" value={shoe.dropMm != null ? `${shoe.dropMm} mm` : null} />
              <Row label="Stack" value={shoe.stackMm != null ? `${shoe.stackMm} mm` : null} />
              <Row label="Terrain" value={shoe.terrain} />
            </div>
          </SectionCard>

          {/* Cushioning & fit */}
          {(cushioningLevel || archSupport || breathability || energyReturn) && (
            <SectionCard icon={<Wind size={20} weight="bold" color="#59C88B" />} title="Cushioning & Fit">
              <div className="space-y-4">
                <Row label="Cushioning" value={cushioningLevel} />
                <Row label="Arch Support" value={archSupport} />
                <Row label="Breathability" value={breathability ? `${breathability} / 10` : null} />
                <Row label="Energy Return" value={energyReturn ? `${energyReturn}%` : null} />
              </div>
            </SectionCard>
          )}

          {/* Pros */}
          {pros.length > 0 && (
            <SectionCard icon={<ThumbsUp size={20} weight="bold" color="#59C88B" />} title="What Runners Like">
              <ul className="space-y-2">
                {pros.map((pro, idx) => (
                  <li key={idx} className="text-slate-300 text-sm flex gap-2">
                    <span className="text-emerald-400">•</span>
                    {pro}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* Cons */}
          {cons.length > 0 && (
            <SectionCard icon={<ThumbsDown size={20} weight="bold" color="#59C88B" />} title="Worth Knowing">
              <ul className="space-y-2">
                {cons.map((con, idx) => (
                  <li key={idx} className="text-slate-300 text-sm flex gap-2">
                    <span className="text-amber-400">•</span>
                    {con}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* Price + link */}
          <div className="flex items-center justify-between">
            <p className="text-3xl font-semibold text-emerald-400">
              {shoe.price != null ? `$${shoe.price}` : "—"}
            </p>
            <a
              href={shoe.productUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                backgroundColor: "#3B3658",
                border: "1px solid #7B75A5",
                pointerEvents: shoe.productUrl ? "auto" : "none",
                opacity: shoe.productUrl ? 1 : 0.5,
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm hover:bg-[#34304E] transition-colors flex-shrink-0"
            >
              <ArrowSquareOut size={14} />
              View Product
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
