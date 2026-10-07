"use client";

import { useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";

export type AnalysisMethod =
  | "overground-side"
  | "treadmill-side"
  | "treadmill-rear"
  | "feet-only";

type Props = {
  onSelect: (method: AnalysisMethod) => void;
  onBack?: () => void;
};

export function MethodSelectionStep({ onSelect, onBack }: Props) {
  const [selectedMethod, setSelectedMethod] = useState<AnalysisMethod | null>(null);

  const methods: Array<{
    id: AnalysisMethod;
    title: string;
    image: string;
  }> = [
    {
      id: "overground-side",
      title: "Overground - Side View Running",
      image: "/images/gait-methods/overground.jpg",
    },
    {
      id: "treadmill-side",
      title: "On Treadmill - Side View Running",
      image: "/images/gait-methods/treadmill-side.jpg",
    },
    {
      id: "treadmill-rear",
      title: "On Treadmill - Back View Running",
      image: "/images/gait-methods/treadmill-rear.jpg",
    },
    {
      id: "feet-only",
      title: "Feet Only (coming soon)",
      image: "/images/gait-methods/feet-only.jpg",
    },
  ];

  return (
    <div className="w-full flex flex-col" style={{ backgroundColor: "#2D2B47",  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)", }}>
      {/* Gait Analysis Header */}
      <div style={{ height: "40px" }} />
      
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          margin: "0 auto",
          width: "90%",
          maxWidth: "700px",
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "999px",
              backgroundColor: "#2D2B47",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={18} color="#FFFFFF" />
          </button>
        )}
        <h1 className="font-bold text-white" style={{ fontSize: "28px" }}>
          Gait Analysis
        </h1>
      </div>

      {/* Spacing between header and card */}
      <div style={{ height: "24px" }} />

      {/* Method selection container */}
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
            padding: "0px",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#312D4B",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {/* Title - "Choose the method" */}
          <div style={{ paddingLeft: "32px", paddingRight: "32px", paddingTop: "32px" }}>
            <h2 className="text-xl font-semibold text-white">
              Choose the method
            </h2>
          </div>

        {/* Spacing between title and images */}
        <div style={{ height: "20px" }} />

        {/* Grid of 2x2 options */}
        <div 
          style={{ 
            paddingLeft: "32px", 
            paddingRight: "32px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          {methods.map((method) => (
            <button
              key={method.id}
              onClick={() => method.id !== "feet-only" && setSelectedMethod(method.id)}
              style={{
                width: "100%",
                aspectRatio: "1.4",
                position: "relative",
                borderRadius: "12px",
                overflow: "hidden",
                border: selectedMethod === method.id ? "3px solid #A78BFA" : "3px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                transform: selectedMethod === method.id ? "scale(1.02)" : "scale(1)",
                padding: 0,
                backgroundColor: "transparent",
              }}
              className="hover:border-purple-400/50"
            >
              {/* Image */}
              <img
                src={method.image}
                alt={method.title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />

              {/* Label Overlay */}
              <div 
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: "rgba(0, 0, 0, 0.7)",
                  backdropFilter: "blur(4px)",
                  padding: "10px",
                }}
              >
                <p className="text-white text-xs font-medium text-center">
                  {method.title}
                </p>
              </div>
            </button>
          ))}
        </div>

          {/* Spacing between cards and button */}
          <div style={{ height: "20px" }} />

          {/* Continue Button */}
          <div style={{ paddingLeft: "32px", paddingRight: "32px", paddingBottom: "32px" }}>
            <button
              onClick={() => selectedMethod && onSelect(selectedMethod)}
              disabled={!selectedMethod}
              style={{
                width: "100%",
                height: "40px",
                borderRadius: "9999px",
                fontWeight: "600",
                fontSize: "14px",
                transition: "all 0.3s",
                border: "none",
                cursor: selectedMethod ? "pointer" : "not-allowed",
                backgroundColor: selectedMethod ? "#6A47F4" : "#4B5563",
                color: selectedMethod ? "#FFFFFF" : "#A0A8B5",
              }}
              onMouseEnter={(e) => selectedMethod && (e.currentTarget.style.backgroundColor = "#7D56FF")}
              onMouseLeave={(e) => selectedMethod && (e.currentTarget.style.backgroundColor = "#6A47F4")}
            >
              Continue
            </button>
          </div>
        </div>
      </div>

      {/* Bottom spacing */}
      <div style={{ height: "30px" }} />
    </div>
  );
}

