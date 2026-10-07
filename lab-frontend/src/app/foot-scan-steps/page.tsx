"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

const steps = [
  {
    number: 1,
    title: "Now, let's learn about your feet",
    subtitle: "Get ready to scan your feet.",
    image: "/images/foot-scan/step_1.png",
  },
  {
    number: 2,
    title: "Remove your shoes",
    subtitle: "Take off your shoes.",
    image: "/images/foot-scan/step_2.png",
  },
  {
    number: 3,
    title: "Roll up pants. Go barefoot",
    subtitle: "Roll up your pants and stand barefoot.",
    image: "/images/foot-scan/step_3.png",
  },
  {
    number: 4,
    title: "Now, let's learn about your feet",
    subtitle: "Put a paper sheet on the floor.",
    image: "/images/foot-scan/step_4.png",
  },
  {
    number: 5,
    title: "Extend arm for angles.",
    subtitle: "Hold your phone out to get the right angle.",
    image: "/images/foot-scan/step_5.png",
  },
  {
    number: 6,
    title: "Scan one foot at a time.",
    subtitle: "Place only the foot being scanned beside the paper - keep your other foot and leg out of frame.",
    image: "/images/foot-scan/step_6.png",
  },
  {
    number: 7,
    title: "Photograph from directly above.",
    subtitle: "Shoot straight down so only the foot (ankle and below) and the paper are visible, as shown.",
    image: "/images/foot-scan/step_7.png",
  },
];

export default function FootScanStepsPage() {
  const router = useRouter();

  return (
    <div
      style={{
        backgroundColor: "#28243D",
        minHeight: "100vh",
        fontFamily: "'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "0",
      }}
    >
      {/* Top Navigation Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          backgroundColor: "#28243D",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          padding: "12px 40px",
          height: "64px",
        }}
      >
        {/* Back Button */}
        <button
          onClick={() => router.push("/admin/analysis")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#9CA3AF",
            display: "flex",
            alignItems: "center",
            padding: "4px 8px",
            borderRadius: "6px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.color = "#FFFFFF";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#9CA3AF";
          }}
        >
          <ChevronLeft size={20} />
        </button>
      </div>

      {/* Page Content */}
      <div
        style={{
          padding: "40px 40px 40px 40px",
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Title Container */}
        <div>
          <h1 style={{ fontSize: "32px", fontWeight: "bold", color: "#FFFFFF", margin: "0" }}>
            3D Foot Scan
          </h1>
        </div>

        {/* Main Steps Container */}
        <div
          style={{
            backgroundColor: "#28243D",
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
          }}
        >
          {/* Inner Container */}
          <div
            style={{
              backgroundColor: "#312D4B",
              borderRadius: "12px",
              padding: "32px",
            }}
          >
            {/* Steps Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px" }}>
              {steps.map((step, index) => (
                <div
                  key={step.number}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {/* Step Number with Arrow */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0",
                      marginBottom: "4px",
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    {/* Left Dotted Line */}
                    {index % 4 !== 0 && (
                      <div
                        style={{
                          flex: 1,
                          height: "2px",
                          borderTop: "2px dotted rgba(255, 255, 255, 0.2)",
                        }}
                      />
                    )}

                    {/* Step Badge */}
                    <span
                      style={{
                        backgroundColor: "#3C3854",
                        color: "#FFFFFF",
                        borderRadius: "9999px",
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        margin: "0 8px",
                      }}
                    >
                      Step {step.number}
                    </span>
                    
                    {/* Right Dotted Line with Arrow - show for all except last step */}
                    {index < steps.length - 1 && (
                      <>
                        <div
                          style={{
                            flex: 1,
                            height: "2px",
                            borderTop: "2px dotted rgba(255, 255, 255, 0.2)",
                          }}
                        />
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#A0A8B5"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            marginLeft: "8px",
                            flexShrink: 0,
                          }}
                        >
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </>
                    )}

                    {/* If it's the last step, add a line to the right to balance */}
                    {index === steps.length - 1 && (
                      <div
                        style={{
                          flex: 1,
                          height: "2px",
                          borderTop: "2px dotted rgba(255, 255, 255, 0.2)",
                        }}
                      />
                    )}
                  </div>

                  {/* Image Container */}
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "200px",
                      borderRadius: "12px",
                      overflow: "hidden",
                      backgroundColor: "#1A1828",
                    }}
                  >
                    <Image src={step.image} alt={`Step ${step.number}`} fill style={{ objectFit: "cover" }} />
                  </div>

                  {/* Text Container */}
                  <div>
                    <p style={{ color: "#FFFFFF", fontSize: "13px", fontWeight: 600, margin: "0 0 6px 0" }}>
                      {step.title}
                    </p>
                    <p style={{ color: "#A0A8B5", fontSize: "12px", margin: 0 }}>
                      {step.subtitle}
                    </p>
                  </div>
                </div>
              ))}

              {/* Start Now Cell */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "4px",
                    position: "relative",
                    width: "100%",
                    height: "20px",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      width: "calc(50% - 28px)",
                      height: "2px",
                      borderTop: "2px dotted rgba(255, 255, 255, 0.2)",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#A0A8B5"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <span
                      style={{
                        backgroundColor: "#3C3854",
                        color: "#FFFFFF",
                        borderRadius: "9999px",
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Start
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    width: "100%",
                    height: "200px",
                    borderRadius: "12px",
                    backgroundColor: "#312D4B",
                    border: "1px solid rgba(255, 255, 255, 0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <button
                    style={{
                      padding: "10px 24px",
                      borderRadius: "9999px",
                      fontSize: "13px",
                      fontWeight: 600,
                      backgroundColor: "#6A47F4",
                      color: "#FFFFFF",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.3s",
                    }}
                    onClick={() => router.push("/foot-scan-start")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#7D5AF8";
                      e.currentTarget.style.transform = "scale(1.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#6A47F4";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    Start Now
                  </button>
                </div>

                <p style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 600, margin: 0, textAlign: "center" }}>
                  You're all set, start the scan!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
