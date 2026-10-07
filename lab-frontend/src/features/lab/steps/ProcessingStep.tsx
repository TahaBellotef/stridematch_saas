"use client";

import { useEffect, useMemo, useState } from "react";

const PROCESSING_STEPS = [
  "Calibrating motion model",
  "Extracting joint trajectories",
  "Measuring cadence and symmetry",
  "Estimating ground contact time",
  "Analyzing knee extension",
  "Classifying gait pattern",
  "Finalizing biomechanical report",
];

type ProcessingStepProps = {
  isLoading: boolean;
};

export function ProcessingStep({ isLoading }: ProcessingStepProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) return;

    setStepIndex(0);

    const interval = setInterval(() => {
      setStepIndex((prev) =>
        prev < PROCESSING_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 1100);

    return () => clearInterval(interval);
  }, [isLoading]);

  const progressPct = useMemo(() => {
    return Math.round(
      ((stepIndex + 1) / PROCESSING_STEPS.length) * 100
    );
  }, [stepIndex]);

  return (
    <div className="w-full flex flex-col" style={{ backgroundColor: "#2D2B47",  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)", }}>
      {/* Gait Analysis Header */}
      <div style={{ height: "40px" }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          margin: "0 auto",
          width: "90%",
          maxWidth: "700px",
        }}
      >
        <h1 className="font-bold text-white" style={{ fontSize: "28px" }}>
          Gait Analysis
        </h1>
      </div>

      {/* Spacing between header and card */}
      <div style={{ height: "24px" }} />

      {/* Card */}
      <div
        style={{
          maxWidth: "700px",
          margin: "0 auto",
          width: "90%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            borderRadius: "20px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            backgroundColor: "#312D4B",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <h2 className="text-xl font-semibold text-white">
            Hold tight, we analyze your biomechanics
          </h2>

        <div
          style={{
            position: "relative",
            borderRadius: "16px",
            overflow: "hidden",
            aspectRatio: "16/9",
            backgroundColor: "rgba(0,0,0,0.2)",
          }}
        >
          <img
            src="/images/gait-methods/analysis.jpg"
            alt="Gait analysis in progress"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {/* Animated horizontal line */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: "2px",
              background: "linear-gradient(90deg, transparent, #9f7aea, transparent)",
              opacity: 0.9,
              top: "10%",
              animation: "lineFloat 2.6s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          {/* Animated flowing strings overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 20% 30%, rgba(154, 85, 255, 0.25), transparent 45%)," +
                "radial-gradient(circle at 80% 60%, rgba(118, 69, 255, 0.25), transparent 45%)",
              mixBlendMode: "screen",
              pointerEvents: "none",
              opacity: 0.8,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(120deg, rgba(111, 66, 193, 0.25) 25%, transparent 25%, transparent 50%, rgba(111, 66, 193, 0.25) 50%, rgba(111, 66, 193, 0.25) 75%, transparent 75%, transparent)",
              backgroundSize: "200% 200%",
              mixBlendMode: "screen",
              animation: "waveMove 5s ease-in-out infinite",
              opacity: 0.7,
              pointerEvents: "none",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            backgroundColor: "rgba(14, 165, 233, 0.08)",
            border: "1px solid rgba(34, 197, 94, 0.35)",
            borderRadius: "10px",
            padding: "14px",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="#22C55E" strokeWidth="2" />
            <path d="M12 8v5" stroke="#22C55E" strokeWidth="2" />
            <circle cx="12" cy="15.5" r="1" fill="#22C55E" />
          </svg>
          <p className="text-sm" style={{ color: "#9AE6B4", lineHeight: 1.5 }}>
            This analysis provides insights into your stride, movement patterns, and biomechanics. It delivers precise data to help you understand your unique running style and determine the best shoe for your needs.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            paddingTop: "4px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              className="animate-pulse"
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "999px",
                backgroundColor: "#A855F7",
              }}
            />
            <span className="text-sm" style={{ color: "#E2E8F0" }}>
              {PROCESSING_STEPS[stepIndex]}…
            </span>
          </div>
          <span className="text-xs" style={{ color: "#CBD5E1" }}>
            {progressPct}% complete
          </span>
        </div>

          <div
            style={{
              width: "100%",
              height: "6px",
              borderRadius: "999px",
              overflow: "hidden",
              backgroundColor: "#475569",
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                borderRadius: "999px",
                background: "linear-gradient(90deg, #6A47F4 0%, #A855F7 100%)",
                transition: "width 0.6s ease",
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ height: "30px" }} />

      <style jsx>{`
        @keyframes lineFloat {
          0% { top: 10%; }
          50% { top: 90%; }
          100% { top: 10%; }
        }
        @keyframes waveMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}