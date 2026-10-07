"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FootScanResult } from "@/features/foot-scan/domain/footScan.types";
import { useFootScanModels } from "@/features/foot-scan/hooks/useFootScanModels";
import { detectA4Quad } from "@/features/foot-scan/utils/a4Detection";
import { computeConfidence } from "@/features/foot-scan/utils/confidence";
import {
  cleanFootMask,
  maskFromCategory,
  measureFoot,
} from "@/features/foot-scan/utils/footMetrics";
import {
  cropImageData,
  toGrayscale,
  varianceOfLaplacian,
  resizeMask,
} from "@/features/foot-scan/utils/imageOps";
import { computeHomography, warpMask } from "@/features/foot-scan/utils/homography";
import { convertSizing } from "@/features/foot-scan/utils/shoeSizing";

const TARGET_PX_PER_MM = 4;
const A4_PORTRAIT = { widthMm: 210, heightMm: 297 };
const A4_LANDSCAPE = { widthMm: 297, heightMm: 210 };

type Step = "setup" | "scan" | "result";

type QualityCheck = {
  label: string;
  ok: boolean;
  note: string;
};

const initialChecks: Record<string, QualityCheck> = {
  lighting: { label: "Lighting", ok: false, note: "Waiting for camera" },
  paper: { label: "A4 visible", ok: false, note: "Detecting paper" },
  foot: { label: "Foot visible", ok: false, note: "Detecting foot" },
  angle: { label: "Camera angle", ok: false, note: "Checking perspective" },
};

type CaptureFrame = {
  imageData: ImageData;
  dataUrl: string;
  width: number;
  height: number;
};

const StatusPill = ({ ok, label, note }: QualityCheck) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm shadow-sm">
    <div>
      <p className="font-medium text-slate-900">{label}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
    <span
      className={[
        "h-3 w-3 rounded-full",
        ok ? "bg-emerald-500" : "bg-amber-400",
      ].join(" ")}
      aria-hidden
    />
  </div>
);

export default function FootScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rectifiedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [step, setStep] = useState<Step>("setup");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capture, setCapture] = useState<CaptureFrame | null>(null);
  const [result, setResult] = useState<FootScanResult | null>(null);
  const [rectifiedMask, setRectifiedMask] = useState<{
    mask: Uint8Array;
    width: number;
    height: number;
  } | null>(null);
  const [status, setStatus] = useState<"idle" | "analyzing" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qualityChecks, setQualityChecks] =
    useState<Record<string, QualityCheck>>(initialChecks);
  const [qualityWarnings, setQualityWarnings] = useState<string[]>([]);

  const { status: modelStatus, segmenter, detector } = useFootScanModels();

  const canCapture =
    modelStatus === "ready" &&
    Object.values(qualityChecks).filter((check) => check.ok).length >= 3;

  const startCamera = async () => {
    if (stream) return;
    if (!window.isSecureContext) {
      throw new Error("Camera requires HTTPS or localhost.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera not supported");
    }
    const media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "environment" },
    });
    setStream(media);
  };

  const stopCamera = () => {
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) return null;
    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return { imageData, dataUrl, width, height };
  };

  const drawDebugOverlay = (frame: CaptureFrame, quad?: [number, number][]) => {
    const canvas = debugCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new Image();
    image.onload = () => {
      canvas.width = frame.width;
      canvas.height = frame.height;
      ctx.drawImage(image, 0, 0, frame.width, frame.height);
      if (!quad) return;
      ctx.strokeStyle = "#11C1C4";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(quad[0][0], quad[0][1]);
      ctx.lineTo(quad[1][0], quad[1][1]);
      ctx.lineTo(quad[2][0], quad[2][1]);
      ctx.lineTo(quad[3][0], quad[3][1]);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = "rgba(17, 193, 196, 0.15)";
      ctx.fill();
    };
    image.src = frame.dataUrl;
  };

  const drawRectifiedMask = (maskData: {
    mask: Uint8Array;
    width: number;
    height: number;
  }) => {
    const canvas = rectifiedCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = maskData.width;
    canvas.height = maskData.height;
    const image = ctx.createImageData(maskData.width, maskData.height);
    for (let i = 0; i < maskData.mask.length; i += 1) {
      const v = maskData.mask[i] ? 255 : 0;
      image.data[i * 4] = 20;
      image.data[i * 4 + 1] = 193;
      image.data[i * 4 + 2] = 196;
      image.data[i * 4 + 3] = v;
    }
    ctx.putImageData(image, 0, 0);
  };

  const analyzeCapture = async (frame: CaptureFrame) => {
    if (!segmenter) {
      throw new Error("Segmenter not ready");
    }

    const detectionFromModel = async () => {
      if (!detector || !captureCanvasRef.current) return null;
      const detections = detector.detect(captureCanvasRef.current);
      if (!detections?.length) return null;
      const best = detections[0];
      if (!best?.boundingBox) return null;
      const padding = 0.12;
      const roiX = Math.max(
        0,
        Math.round(best.boundingBox.originX - best.boundingBox.width * padding)
      );
      const roiY = Math.max(
        0,
        Math.round(best.boundingBox.originY - best.boundingBox.height * padding)
      );
      const roiW = Math.min(
        frame.width - roiX,
        Math.round(best.boundingBox.width * (1 + padding * 2))
      );
      const roiH = Math.min(
        frame.height - roiY,
        Math.round(best.boundingBox.height * (1 + padding * 2))
      );
      const roiImage = cropImageData(frame.imageData, roiX, roiY, roiW, roiH);
      const a4 = detectA4Quad(roiImage);
      if (!a4) return null;
      const corners = a4.corners.map(
        ([x, y]) => [x + roiX, y + roiY] as [number, number]
      );
      return {
        ...a4,
        corners,
      };
    };

    const a4 = (await detectionFromModel()) ?? detectA4Quad(frame.imageData);
    if (!a4) {
      throw new Error("A4 sheet not detected");
    }

    const orientation = a4.orientation;
    const dims = orientation === "portrait" ? A4_PORTRAIT : A4_LANDSCAPE;
    const widthPx = Math.round(dims.widthMm * TARGET_PX_PER_MM);
    const heightPx = Math.round(dims.heightMm * TARGET_PX_PER_MM);
    const pxPerMm = widthPx / dims.widthMm;
    const dstQuad: [number, number][] = [
      [0, 0],
      [widthPx - 1, 0],
      [widthPx - 1, heightPx - 1],
      [0, heightPx - 1],
    ];

    const homography = computeHomography(a4.corners, dstQuad);
    if (!homography) {
      throw new Error("Perspective transform failed");
    }

    if (!captureCanvasRef.current) {
      throw new Error("Capture canvas missing");
    }
    const segmentResult = await segmenter.segment(captureCanvasRef.current);
    const categoryMask = segmentResult?.categoryMask?.getAsUint8Array?.();
    if (!categoryMask) {
      throw new Error("Segmentation failed");
    }
    const maskWidth = segmentResult?.categoryMask?.width ?? frame.width;
    const maskHeight = segmentResult?.categoryMask?.height ?? frame.height;
    let rawMask = maskFromCategory(categoryMask, maskWidth, maskHeight);
    if (maskWidth !== frame.width || maskHeight !== frame.height) {
      rawMask = resizeMask(rawMask, maskWidth, maskHeight, frame.width, frame.height);
    }
    const rectifiedMask = warpMask(
      rawMask,
      frame.width,
      frame.height,
      homography,
      widthPx,
      heightPx
    );
    const cleanedMask = cleanFootMask(rectifiedMask, widthPx, heightPx);
    const metrics = measureFoot(cleanedMask, widthPx, heightPx, pxPerMm);
    if (!metrics) {
      throw new Error("Foot not found on paper");
    }

    const gray = toGrayscale(frame.imageData);
    const blur = varianceOfLaplacian(gray, frame.width, frame.height);
    const confidence = computeConfidence({
      quad: a4.corners,
      imageWidth: frame.width,
      imageHeight: frame.height,
      rectifiedMask: cleanedMask,
      rectifiedWidth: widthPx,
      rectifiedHeight: heightPx,
      blurVariance: blur,
    });

    const lengthCm = Number(metrics.lengthCm.toFixed(1));
    const widthCm = Number(metrics.widthCm.toFixed(1));
    const sizes = convertSizing(lengthCm);

    const analysis: FootScanResult = {
      lengthCm,
      widthCm,
      euSize: sizes.euSize,
      usMen: sizes.usMen,
      usWomen: sizes.usWomen,
      confidence: confidence.score,
      debug: {
        a4Corners: a4.corners,
        orientation,
        pxPerMm,
        warnings: confidence.warnings,
      },
    };
    return {
      analysis,
      rectified: {
        mask: cleanedMask,
        width: widthPx,
        height: heightPx,
      },
    };
  };

  const runCapture = async () => {
    const frame = captureFrame();
    if (!frame) return;
    setStatus("analyzing");
    setErrorMessage(null);
    setCapture(frame);
    try {
      const analysis = await analyzeCapture(frame);
      setResult(analysis.analysis);
      setRectifiedMask(analysis.rectified);
      setQualityWarnings(analysis.analysis.debug?.warnings ?? []);
      setStep("result");
      setStatus("idle");
    } catch (error) {
      console.error(error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Scan failed"
      );
    }
  };

  const resetFlow = () => {
    setResult(null);
    setCapture(null);
    setRectifiedMask(null);
    setQualityWarnings([]);
    setStatus("idle");
    setErrorMessage(null);
    setStep("scan");
    void startCamera().catch((error) => {
      console.error("Camera error", error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Camera access failed."
      );
    });
  };

  useEffect(() => {
    if (step !== "scan") {
      stopCamera();
    }
  }, [step]);

  useEffect(() => {
    const video = videoRef.current;
    if (step !== "scan" || !video || !stream) return;
    video.srcObject = stream;
    video.play().catch((error) => {
      console.error("Video playback error", error);
      setStatus("error");
      setErrorMessage("Unable to start video preview.");
    });
  }, [stream, step]);

  useEffect(() => {
    if (step !== "scan") return;
    let timer: ReturnType<typeof setInterval>;
    let active = true;
    let inFlight = false;
    const analyzePreview = async () => {
      if (inFlight) return;
      const video = videoRef.current;
      const previewCanvas = previewCanvasRef.current;
      if (!video || !previewCanvas || !active) return;
      inFlight = true;
      const width = 360;
      const height = Math.round((video.videoHeight / video.videoWidth) * width);
      previewCanvas.width = width;
      previewCanvas.height = height;
      const ctx = previewCanvas.getContext("2d");
      if (!ctx) {
        inFlight = false;
        return;
      }
      try {
        ctx.drawImage(video, 0, 0, width, height);
        const frame = ctx.getImageData(0, 0, width, height);
        const gray = toGrayscale(frame);
        const avg =
          gray.reduce((acc, value) => acc + value, 0) /
          Math.max(gray.length, 1);
        const lightingOk = avg > 70;

        const detection = detectA4Quad(frame);
        let paperOk = Boolean(detection);
        let paperNote = "Place A4 fully in view";
        let angleOk = false;
        if (detection) {
          const margin = Math.round(Math.min(width, height) * 0.05);
          const xs = detection.corners.map((corner) => corner[0]);
          const ys = detection.corners.map((corner) => corner[1]);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          paperOk =
            minX > margin &&
            minY > margin &&
            maxX < width - margin &&
            maxY < height - margin;
          paperNote = paperOk ? "Sheet detected" : "A4 is clipped";
          const top = Math.hypot(
            detection.corners[1][0] - detection.corners[0][0],
            detection.corners[1][1] - detection.corners[0][1]
          );
          const bottom = Math.hypot(
            detection.corners[2][0] - detection.corners[3][0],
            detection.corners[2][1] - detection.corners[3][1]
          );
          const left = Math.hypot(
            detection.corners[3][0] - detection.corners[0][0],
            detection.corners[3][1] - detection.corners[0][1]
          );
          const right = Math.hypot(
            detection.corners[2][0] - detection.corners[1][0],
            detection.corners[2][1] - detection.corners[1][1]
          );
          const widthSkew =
            Math.max(top, bottom) / Math.max(1, Math.min(top, bottom));
          const heightSkew =
            Math.max(left, right) / Math.max(1, Math.min(left, right));
          angleOk = widthSkew <= 1.25 && heightSkew <= 1.25;
        }

        let footOk = false;
        let footNote = "Detecting foot";
        if (segmenter && modelStatus === "ready") {
          const segmentResult = await segmenter.segment(previewCanvas);
          const categoryMask = segmentResult?.categoryMask?.getAsUint8Array?.();
          if (categoryMask) {
            const maskWidth =
              segmentResult?.categoryMask?.width ?? width;
            const maskHeight =
              segmentResult?.categoryMask?.height ?? height;
            let mask = maskFromCategory(categoryMask, maskWidth, maskHeight);
            if (maskWidth !== width || maskHeight !== height) {
              mask = resizeMask(mask, maskWidth, maskHeight, width, height);
            }
            footOk = mask.reduce((acc, value) => acc + value, 0) > 3000;
            footNote = footOk ? "Foot detected" : "Place foot on paper";
          }
        } else {
          footNote = "Model loading";
          footOk = false;
        }

        setQualityChecks({
          lighting: {
            label: "Lighting",
            ok: lightingOk,
            note: lightingOk ? "Good brightness" : "Needs more light",
          },
          paper: {
            label: "A4 visible",
            ok: paperOk,
            note: paperNote,
          },
          foot: {
            label: "Foot visible",
            ok: footOk,
            note: footNote,
          },
          angle: {
            label: "Camera angle",
            ok: paperOk && angleOk,
            note:
              paperOk && angleOk
                ? "Angle looks good"
                : "Hold phone more overhead",
          },
        });
      } finally {
        inFlight = false;
      }
    };

    timer = setInterval(() => {
      analyzePreview().catch((error) => console.error(error));
    }, 1200);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [step, segmenter, modelStatus]);

  useEffect(() => {
    if (!capture || !result?.debug) return;
    drawDebugOverlay(capture, result.debug.a4Corners);
  }, [capture, result]);

  useEffect(() => {
    if (rectifiedMask) {
      drawRectifiedMask(rectifiedMask);
    }
  }, [rectifiedMask]);

  const steps = useMemo(
    () => [
      { key: "setup", label: "Setup" },
      { key: "scan", label: "Live Scan" },
      { key: "result", label: "Results" },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              StrideMatch Lab
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              FootScan A4 Calibration
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              Capture a top-down photo with an A4 sheet to measure foot length
              and estimate shoe size. All inference stays on-device.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {steps.map((item, index) => {
              const active =
                steps.findIndex((stepItem) => stepItem.key === step) === index;
              return (
                <div
                  key={item.key}
                  className={[
                    "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-500",
                  ].join(" ")}
                >
                  <span className="text-[10px] uppercase tracking-[0.2em]">
                    {index + 1}
                  </span>
                  {item.label}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1.2fr_1fr]">
        <section className="space-y-6">
          {step === "setup" && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">
                Before you start
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>
                  Place a clean A4 sheet on the floor (portrait or landscape).
                </li>
                <li>
                  Stand or sit with one foot centered on the paper.
                </li>
                <li>
                  Hold your phone overhead, lens facing straight down.
                </li>
                <li>
                  Ensure even lighting and avoid strong shadows.
                </li>
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20"
                  >
                    Start live scan
                  </button>
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="rounded-full border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600"
                  >
                    Skip tips
                  </button>
              </div>
            </div>
          )}

          {step === "scan" && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Live scan
                  </h2>
                  <p className="text-sm text-slate-500">
                    Align the paper and foot inside the guide.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                  {modelStatus === "ready"
                    ? "Models ready"
                    : "Loading models"}
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="aspect-[3/4] h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="relative h-[78%] w-[64%] rounded-[28px] border-2 border-dashed border-white/70">
                      <div className="absolute inset-6 rounded-[22px] border border-white/30" />
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-8">
                    <div className="rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                      Align A4 + foot inside the guide
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  {Object.values(qualityChecks).map((check) => (
                    <StatusPill key={check.label} {...check} />
                  ))}
                  <button
                    type="button"
                    onClick={runCapture}
                    disabled={status === "analyzing" || !canCapture}
                    className={[
                      "mt-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-lg",
                      status === "analyzing" || !canCapture
                        ? "bg-slate-300"
                        : "bg-slate-900 shadow-slate-900/20",
                    ].join(" ")}
                  >
                    {status === "analyzing" ? "Analyzing..." : "Capture scan"}
                  </button>
                  <p className="text-xs text-slate-500">
                    Need at least 3 green checks to capture.
                  </p>
                  {status === "error" && errorMessage && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {errorMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === "result" && result && capture && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Results
                  </h2>
                  <p className="text-sm text-slate-500">
                    Confidence {result.confidence}%
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Save result
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Foot length
                    </p>
                    <p className="text-3xl font-semibold text-slate-900">
                      {result.lengthCm} cm
                    </p>
                    <p className="text-sm text-slate-500">
                      Width {result.widthCm ?? "-"} cm (ball)
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-3">
                      <p className="text-xs text-slate-400">EU</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {result.euSize}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-3">
                      <p className="text-xs text-slate-400">US Men</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {result.usMen}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-3">
                      <p className="text-xs text-slate-400">US Women</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {result.usWomen}
                      </p>
                    </div>
                  </div>
                  {qualityWarnings.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <p className="font-medium">Quality notes</p>
                      <ul className="mt-2 space-y-1">
                        {qualityWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <canvas
                      ref={debugCanvasRef}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Rectified mask
                    </p>
                    <canvas
                      ref={rectifiedCanvasRef}
                      className="mt-3 h-40 w-full rounded-lg border border-slate-200 bg-white object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              Scan checklist
            </h3>
            <ul className="mt-3 space-y-3 text-sm text-slate-600">
              <li>Keep the paper flat, no curls or folds.</li>
              <li>Make sure the full A4 sheet is visible.</li>
              <li>Avoid shadows across the foot.</li>
              <li>Keep the phone lens centered over the page.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              How sizing is estimated
            </h3>
            <p className="mt-3 text-sm text-slate-600">
              We convert length in cm to EU / US size using standard Brannock
              approximations with a 1.5 cm toe allowance. Edit this mapping in
              sizing utilities as needed.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
            <h3 className="text-sm font-semibold">Debug overlay</h3>
            <p className="mt-3 text-sm text-white/70">
              Corners, mask, and warnings are available in the output for
              tuning. Use these signals to improve A4 detection or model choice.
            </p>
          </div>
        </aside>
      </main>

      <canvas ref={captureCanvasRef} className="hidden" />
      <canvas ref={previewCanvasRef} className="hidden" />
    </div>
  );
}
