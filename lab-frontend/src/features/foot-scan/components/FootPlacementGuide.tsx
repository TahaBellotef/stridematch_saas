"use client";

import Image from "next/image";

const EXAMPLE_IMAGE: Record<"left" | "right", string> = {
  left: "/footscanLeft.png",
  right: "/footscanRight.png",
};

/**
 * Real example photo shown in an upload slot before a photo is taken:
 * foot directly beside the A4 sheet, both flat, shot close-up from
 * directly above - the exact framing the measurement pipeline expects.
 */
export function FootPlacementGuide({ foot }: { foot: "left" | "right" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", width: "100%" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "150px",
          borderRadius: "10px",
          overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <Image
          src={EXAMPLE_IMAGE[foot]}
          alt={`${foot} foot placed beside the A4 paper, photographed from directly above`}
          fill
          style={{ objectFit: "contain" }}
        />
      </div>
      <span
        style={{
          color: "#D1D5DB",
          fontSize: "12px",
          fontWeight: 500,
          textAlign: "center",
          maxWidth: "240px",
          lineHeight: "16px",
        }}
      >
        Get close: just the foot beside the paper, no leg in frame
      </span>
    </div>
  );
}
