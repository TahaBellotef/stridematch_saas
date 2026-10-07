"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, ImageSquare, Question } from "@phosphor-icons/react";
import { type AnalysisMethod } from "./MethodSelectionStep";
import { type CaptureType } from "../services/session.service";

type Props = {
  method: AnalysisMethod;
  captureType?: CaptureType | null;
  onPrepareUpload: () => Promise<CaptureType | void> | void;
  onSubmitCapture: (file: File) => Promise<void> | void;
  onBack: () => void;
};

const methodDetails: Record<
  AnalysisMethod,
  {
    title: string;
    image: string;
    description: string;
    note: string;
    warningSteps?: string[];
    setupSteps?: string[];
    warningStepsStep2?: string[];
    setupStepsStep2?: string[];
    setupStepsStep3?: string[];
  }
> = {
  "overground-side": {
    title: "Overground - Side View Running",
    image: "/images/gait-methods/overground.jpg",
    description:
      "This analysis will study your entire running posture. It will give you the keys to understand your strengths and weaknesses, as well as metrics and data.",
    note: "Make sure your video uploads in 60hz",
    warningSteps: [
      "The camera must not move",
      "The person must be visible from head to toe",
    ],
    setupSteps: [
      "Place the camera on tripod or in someone's hands",
      "Runner's distance : able to film 5 strides",
    ],
    warningStepsStep2: [
      "The camera must not move",
      "The person must be visible from head to toe",
    ],
    setupStepsStep2: [
      "At your usual jogging place",
      "Landscape format",
    ],
    setupStepsStep3: [
      "Crop your video to maximum length of 10 seconds",
      "Discover your results",
    ],
  },
  "treadmill-side": {
    title: "On Treadmill - Side View Running",
    image: "/images/gait-methods/treadmill-side.jpg",
    description:
      "This analysis will study your entire running posture. It will give you the keys to understand your strengths and weaknesses, as well as metrics and data.",
    note: "Make sure your video uploads in 60hz",
    warningSteps: [
      "The camera must not move",
      "The person must be visible form head to toe",
    ],
    setupSteps: [
      "Place the camera on tripod or in someone's hands",
      "Runner's distance : able to film 5 strides",
    ],
    warningStepsStep2: [
      "The camera must not move",
      "The person must be visible from head to toe",
    ],
    setupStepsStep2: [
      "At your usual jogging place",
      "Landscape format",
    ],
    setupStepsStep3: [
      "Crop your video to maximum length of 10 seconds",
      "Discover your results",
    ],
  },
  "treadmill-rear": {
    title: "On Treadmill - Back View Running",
    image: "/images/gait-methods/treadmill-rear.jpg",
    description:
      "This analysis will study your entire running posture. It will give you the keys to understand your strengths and weaknesses, as well as metrics and data.",
    note: "Make sure your video uploads in 60fps",
    warningSteps: [
      "The camera must not move",
      "The person must be visible from head to toe",
    ],
    setupSteps: [
      "Place the camera on tripod or in someone's hands",
      "Runner's distance : able to film 5 strides",
    ],
    warningStepsStep2: [
      "The camera must not move",
      "The person must be visible from head to toe",
    ],
    setupStepsStep2: [
      "At your usual jogging place",
      "Landscape format",
    ],
    setupStepsStep3: [
      "Crop your video to maximum length of 10 seconds",
      "Discover your results",
    ],
  },
  "feet-only": {
    title: "Feet Only",
    image: "/images/gait-methods/feet-only.jpg",
    description:
      "This analysis will study your entire running posture. It will give you the keys to understand your strengths and weaknesses, as well as metrics and data.",
    note: "Make sure your video uploads in 60hz",
    warningSteps: [
      "The camera must not move",
      "The person must be visible form head to toe",
    ],
    setupSteps: [
      "Place the camera on tripod or in someone's hands",
      "Runner's distance : able to film 5 strides",
    ],
    warningStepsStep2: [
      "The camera must not move",
      "The person must be visible from head to toe",
    ],
    setupStepsStep2: [
      "At your usual jogging place",
      "Landscape format",
    ],
    setupStepsStep3: [
      "Crop your video to maximum length of 10 seconds",
      "Discover your results",
    ],
  },
};

export function MethodDetailStep({ method, captureType, onPrepareUpload, onSubmitCapture, onBack }: Props) {
  const details = methodDetails[method];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [infoStep, setInfoStep] = useState(1);

  const captureLabel = useMemo(() => {
    if (captureType === "rear") return "rear";
    if (captureType === "side") return "side";
    // fallback before session is created
    if (method === "treadmill-rear") return "rear";
    return "side";
  }, [captureType, method]);

  const handleUploadClick = () => {
    try {
      void onPrepareUpload();
      fileInputRef.current?.click();
    } catch (err) {
      // upstream handles errors
    }
  };

  const handleFileChange = async (evt: ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files?.[0];
    if (!file) return;
    await onSubmitCapture(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const infoImageByMethod: Record<AnalysisMethod, string> = {
    "overground-side": "/images/gait-methods/info/overground_first.png",
    "treadmill-side": "/images/gait-methods/info/ontreadmile_first.png",
    "treadmill-rear": "/images/gait-methods/info/ontreadmileback_first.png",
    "feet-only": "/images/gait-methods/info/feetonly_first.png",
  };

  const step2ImageByMethod: Record<AnalysisMethod, string> = {
    "overground-side": "/images/gait-methods/info/overground_second.png",
    "treadmill-side": "/images/gait-methods/info/ontreadmile_second.png",
    "treadmill-rear": "/images/gait-methods/info/ontreadmileback_second.png",
    "feet-only": "/images/gait-methods/info/feetonly_second.png",
  };

  const step3ImageByMethod: Record<AnalysisMethod, string> = {
    "overground-side": "/images/gait-methods/info/overground_third.png",
    "treadmill-side": "/images/gait-methods/info/ontreadmile_third.png",
    "treadmill-rear": "/images/gait-methods/info/ontreadmileback_third.png",
    "feet-only": "/images/gait-methods/info/feetonly_third.png",
  };

  const methodTabs: Array<{ id: AnalysisMethod; label: string }> = [
    { id: "overground-side", label: "Overground" },
    { id: "treadmill-side", label: "On Treadmill" },
    { id: "treadmill-rear", label: "On Treadmill (Back)" },
    { id: "feet-only", label: "Feet Only" },
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
        <h1 className="font-bold text-white" style={{ fontSize: "28px" }}>
          Gait Analysis
        </h1>
      </div>

      {/* Spacing between header and card */}
      <div style={{ height: "24px" }} />

      {/* Card Container */}
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
          {/* Method Title */}
          <div
            style={{
              paddingLeft: "32px",
              paddingRight: "32px",
              paddingTop: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <h2 className="text-xl font-semibold text-white">
                {details.title}
              </h2>
              <p className="text-sm text-gray-300 mt-2">
                Next required capture: <span className="font-semibold text-white">{captureLabel}</span> view
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowInfo(true)}
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
              <Question size={32} color="#FFFFFF" />
            </button>
          </div>

        {/* Spacing between title and image */}
        <div style={{ height: "20px" }} />

        {/* Video Image */}
        <div 
          style={{
            paddingLeft: "32px",
            paddingRight: "32px",
          }}
        >
          <div 
            style={{
              position: "relative",
              borderRadius: "12px",
              overflow: "hidden",
              aspectRatio: "16/9",
              backgroundColor: "rgba(0,0,0,0.2)",
            }}
          >
            <img
              src={details.image}
              alt={details.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
        </div>

          {/* Spacing between image and text */}
          <div style={{ height: "20px" }} />

          {/* Info text */}
          <div style={{ paddingLeft: "32px", paddingRight: "32px" }}>
            <p className="text-gray-300" style={{ fontSize: "13px", marginBottom: "12px" }}>
              This is a video to show what your {captureLabel} capture should look like.
            </p>

            <p className="text-gray-300" style={{ fontSize: "13px", marginBottom: "20px" }}>
              {details.description}
            </p>
          </div>

          {/* Warning note */}
          <div
            style={{
              marginLeft: "32px",
              marginRight: "32px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              backgroundColor: "rgba(124, 58, 12, 0.3)",
              border: "1px solid rgba(249, 115, 22, 0.5)",
              borderRadius: "8px",
              padding: "12px",
              marginBottom: "20px",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M12 2L2 20h20L12 2z" stroke="#F97316" strokeWidth="2" fill="none" />
              <path d="M12 9v4" stroke="#F97316" strokeWidth="2" />
              <circle cx="12" cy="17" r="1" fill="#F97316" />
            </svg>
            <p className="text-orange-300" style={{ fontSize: "13px" }}>{details.note}</p>
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingLeft: "32px",
              paddingRight: "32px",
              paddingBottom: "32px",
            }}
          >
            <button
              onClick={handleUploadClick}
              style={{
                padding: "13px 20px",
                borderRadius: "999px",
                fontWeight: "600",
                fontSize: "14px",
                background: "linear-gradient(90deg, #3C3854 0%, #4B4474 100%)",
                color: "#FFFFFF",
                border: "1.5px solid rgba(0, 0, 0, 0.5)",
                cursor: "pointer",
                transition: "all 0.3s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow:
                  "0 6px 16px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
            >
              <ImageSquare size={20} />
              <span>Use Gallery</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom spacing */}
      <div style={{ height: "30px" }} />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={handleFileChange}
      />

      {showInfo && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="relative rounded-3xl bg-slate-950 border border-slate-700 shadow-2xl overflow-hidden flex flex-col"
            style={{ width: "90%", maxWidth: "900px", maxHeight: "90vh" }}
          >
            <button
              onClick={() => {
                setShowInfo(false);
                setInfoStep(1);
              }}
              className="absolute top-6 right-6 text-slate-400 hover:text-white transition z-10"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <div className="flex-1 overflow-y-auto">
              <div className="w-full flex flex-col" style={{ backgroundColor: "#2D2B47" }}>
                <div style={{ height: "32px" }} />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    margin: "0 auto",
                    width: "90%",
                    maxWidth: "700px",
                  }}
                >
                  <h1 className="font-bold text-white" style={{ fontSize: "24px" }}>
                    Gait Analysis
                  </h1>
                </div>

                <div style={{ height: "16px" }} />

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
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: "8px",
                      padding: "4px",
                      borderRadius: "999px",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      backgroundColor: "rgba(0, 0, 0, 0.3)",
                    }}
                  >
                    {methodTabs.map((tab) => (
                      <div
                        key={tab.id}
                        style={{
                          textAlign: "center",
                          padding: "8px 12px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          color: tab.id === method ? "#FFFFFF" : "#CBD5E1",
                          ...(tab.id === method
                            ? {
                                backgroundImage: "linear-gradient(90deg, #3C3854 0%, #4B4474 100%)",
                                border: "1.5px solid #1E1C2B",
                                fontWeight: "600",
                              }
                            : {
                                backgroundColor: "transparent",
                                border: "1px solid transparent",
                                fontWeight: "400",
                              }),
                        }}
                      >
                        {tab.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ height: "18px" }} />

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
                      padding: "20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      backgroundColor: "#312D4B",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                    }}
                  >
                    <div>
                      <div className="text-xs" style={{ color: "#CBD5E1" }}>
                        STEP {infoStep}
                      </div>
                      <h2 className="text-lg font-semibold text-white" style={{ marginTop: "6px" }}>
                        {infoStep === 1 ? "Set up your recording setup" : infoStep === 2 ? "Run and Film" : "Upload your video from your gallery"}
                      </h2>
                    </div>

                    <div
                      style={{
                        position: "relative",
                        borderRadius: "16px",
                        overflow: "hidden",
                        aspectRatio: "16/6",
                        backgroundColor: "rgba(0,0,0,0.2)",
                      }}
                    >
                      <img
                        src={infoStep === 1 ? infoImageByMethod[method] : infoStep === 2 ? step2ImageByMethod[method] : step3ImageByMethod[method]}
                        alt={infoStep === 1 ? "Setup guidance" : infoStep === 2 ? "Run and film" : "Upload video"}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {infoStep !== 3 && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            backgroundColor: "rgba(236, 194, 89, 0.1)",
                            border: "1px solid rgba(236, 194, 89, 0.2)",
                            borderRadius: "8px",
                            padding: "10px",
                          }}
                        >
                          {(infoStep === 1 ? details.warningSteps : details.warningStepsStep2)?.map((step, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                gap: "8px",
                                fontSize: "12px",
                                color: "#ECC259",
                              }}
                            >
                              <span style={{ color: "#ECC259", minWidth: "20px", fontWeight: "600" }}>{idx + 1}</span>
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          backgroundColor: "rgba(106, 250, 165, 0.1)",
                          border: "1px solid rgba(106, 250, 165, 0.2)",
                          borderRadius: "8px",
                          padding: "10px",
                        }}
                      >
                        {(infoStep === 1 ? details.setupSteps : infoStep === 2 ? details.setupStepsStep2 : details.setupStepsStep3)?.map((step, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              gap: "8px",
                              fontSize: "12px",
                              color: "#6AFAA5",
                            }}
                          >
                            <span style={{ color: "#6AFAA5", minWidth: "20px", fontWeight: "600" }}>{idx + 1}</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ color: "#D1D5DB", fontSize: "13px" }}>
                      {details.description}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr",
                        gap: "12px",
                      }}
                    >
                      <button
                        onClick={() => {
                          if (infoStep > 1) {
                            setInfoStep(infoStep - 1);
                          } else {
                            setShowInfo(false);
                          }
                        }}
                        style={{
                          padding: "12px 16px",
                          borderRadius: "999px",
                          fontWeight: "600",
                          fontSize: "14px",
                          backgroundColor: "rgba(255, 255, 255, 0.1)",
                          color: "#FFFFFF",
                          border: "1px solid rgba(255, 255, 255, 0.18)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                      </button>
                      <button
                        onClick={() => {
                          if (infoStep < 3) {
                            setInfoStep(infoStep + 1);
                          } else {
                            setShowInfo(false);
                            setInfoStep(1);
                          }
                        }}
                        style={{
                          padding: "12px 18px",
                          borderRadius: "999px",
                          fontWeight: "600",
                          fontSize: "14px",
                          background: "linear-gradient(90deg, #6A47F4 0%, #8F6BFF 50%, #6A47F4 100%)",
                          color: "#FFFFFF",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {infoStep === 3 ? "Finish" : "Continue"}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ height: "28px" }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
