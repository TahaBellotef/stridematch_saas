"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { CaptureType } from "../services/session.service";

type Props = {
  captureType?: CaptureType | null;
  onSubmit: (file: File) => Promise<void> | void;
  onBack?: () => void;
  error?: string | null;
  maxSizeMb?: number;
};

export function VideoUploadStep({
  captureType,
  onSubmit,
  onBack,
  error,
  maxSizeMb = 50,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayedError = localError || error;
  const maxBytes = maxSizeMb * 1024 * 1024;

  const captureLabel = useMemo(() => {
    if (captureType === "rear") return "rear";
    if (captureType === "side") return "side";
    return "";
  }, [captureType]);

  /* -------------------------------------------------- */
  /* File handling */
  /* -------------------------------------------------- */

  function validateAndSet(f: File | null) {
    setLocalError(null);
    if (!f) return;

    if (!f.type.startsWith("video/")) {
      setLocalError("Please record or select a valid video.");
      return;
    }

    if (f.size > maxBytes) {
      setLocalError(`Maximum file size is ${maxSizeMb} MB.`);
      return;
    }

    setFile(f);
  }

  async function submit() {
    if (!file) {
      setLocalError("A video is required to continue.");
      return;
    }
    await onSubmit(file);
  }

  /* -------------------------------------------------- */

  return (
    <div className="mx-auto w-full max-w-5xl px-3 sm:px-0">
      {/* ================= Header ================= */}
      <header className="rounded-3xl border border-slate-700 bg-[#2D2B47] p-6 shadow-xl mb-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold text-white">
              Upload {captureLabel} view video 
            </h2>
            <p className="text-sm text-gray-300 max-w-2xl">
              Record or upload a video (5-10s) from the {captureLabel} view. Make sure your video is in 60hz.
            </p>
          </div>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-medium text-gray-300 hover:text-white"
            >
              ← Back
            </button>
          )}
        </div>
      </header>

      {displayedError && (
        <Alert title="Action required">{displayedError}</Alert>
      )}

      {/* ================= Hidden Inputs ================= */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        capture={captureType === "rear" ? "environment" : "user"}
        className="hidden"
        onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
      />

      {/* ================= Content ================= */}
      <section className="rounded-3xl border border-slate-700 bg-[#2D2B47] p-6 shadow-xl space-y-6">
        {/* Instruction + Actions */}
        <div className="flex flex-col gap-6">
          {/* Instruction */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">
              Recording instructions
            </p>
            <p className="text-sm text-gray-300">
              • Duration: 5–10 seconds<br />
              • View: {captureLabel} of the runner<br />
              • Ensure stable framing and consistent pace<br />
              • Make sure video is 60 frames per second
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 flex-col sm:flex-row">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 rounded-full bg-purple-600 px-6 py-4 text-base font-semibold text-white hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
            >
              <span>📷</span>
              <span>Use Camera</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 rounded-full border-2 border-gray-600 px-6 py-4 text-base font-semibold text-white hover:bg-gray-700/50 transition-all flex items-center justify-center gap-2"
            >
              <span>🖼️</span>
              <span>Use Gallery</span>
            </button>
          </div>
        </div>

        {/* Selected file */}
        {file && (
          <div className="rounded-2xl border border-purple-500/50 bg-purple-900/30 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white truncate">
                {file.name}
              </p>
              <p className="text-xs text-gray-300">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>

            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/50">
              Ready
            </span>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={!file}
            className="rounded-full px-8 py-4 text-base font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 transition-all"
          >
            Start Analysis
          </button>
        </div>
      </section>
    </div>
  );
}

/* ================= UI helper ================= */

function Alert({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-red-400 bg-red-900/30 p-4 text-red-200 mb-6">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}