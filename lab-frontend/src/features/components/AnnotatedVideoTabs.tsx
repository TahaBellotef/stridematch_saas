"use client";

import { useEffect, useRef, useState } from "react";

export type VideoTab = {
  type: "side" | "rear";
  label: string;
  videoUrl: string;
};

type Props = {
  videos: VideoTab[];

  /** Playback speed multiplier (0.2 | 0.5 | 1.0) */
  playbackRate?: 0.2 | 0.5 | 1.0;
};

export function AnnotatedVideoTabs({
  videos,
  playbackRate = 0.2,
}: Props) {
  const [active, setActive] = useState<VideoTab | null>(
    videos.length > 0 ? videos[0] : null
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);

  /* --------------------------------------------------
   * Apply playback speed (on load + on change)
   * -------------------------------------------------- */
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, active]);

  /* --------------------------------------------------
   * Safety: no videos
   * -------------------------------------------------- */
  if (!active) {
    return (
      <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
        No annotated video available.
      </div>
    );
  }

  /* --------------------------------------------------
   * Switch tab handler
   * -------------------------------------------------- */
  function switchTab(tab: VideoTab) {
    setActive(tab);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.load();
    }
  }

  return (
    <section className="space-y-4">
      {/* ===================================================== */}
      {/* Tabs */}
      {/* ===================================================== */}
      {videos.length > 1 && (
        <div className="flex gap-2">
          {videos.map((v) => {
            const isActive = active.type === v.type;

            return (
              <button
                key={v.type}
                type="button"
                onClick={() => switchTab(v)}
                aria-pressed={isActive}
                className={[
                  "px-4 py-2 rounded-full text-sm font-medium border transition",
                  isActive
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ===================================================== */}
      {/* Video player */}
      {/* ===================================================== */}
      <div className="overflow-hidden rounded-xl border bg-black">
        <video
          ref={videoRef}
          src={active.videoUrl}
          controls
          className="w-full aspect-video"
          onLoadedMetadata={() => {
            if (videoRef.current) {
              videoRef.current.playbackRate = playbackRate;
            }
          }}
        />
      </div>
    </section>
  );
}