"use client";

import {
  ArrowLineRight,
  PencilSimple,
  CopySimple,
  DotsThree,
} from "@phosphor-icons/react";

interface ProductDetailsTopBarProps {
  onClose: () => void;
  isActive?: boolean;
  onToggleActive?: () => void;
  onEdit?: () => void;
  onClone?: () => void;
}

export default function ProductDetailsTopBar({
  onClose,
  isActive = true,
  onToggleActive,
  onEdit,
  onClone,
}: ProductDetailsTopBarProps) {
  return (
    <>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-6">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
          style={{
            backgroundColor: "#3C3854",
          }}
        >
          <ArrowLineRight size={20} weight="regular" color="#FFFFFF" />
        </button>

        <div className="flex items-center gap-3">
          {/* Active Toggle */}
          <div className="flex items-center gap-2">
            <div className="relative inline-block w-11 h-6" onClick={onToggleActive}>
              <div
                className="w-11 h-6 rounded-full transition-colors cursor-pointer"
                style={{
                  backgroundColor: isActive ? "#60E497" : "#3C3854",
                }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                  style={{
                    backgroundColor: "#28243D",
                    left: isActive ? "auto" : "2px",
                    right: isActive ? "2px" : "auto",
                  }}
                />
              </div>
            </div>
            <span className="text-sm font-medium text-white">Active</span>
          </div>

          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: "#3C3854",
              color: "#FFFFFF",
            }}
          >
            <PencilSimple size={16} weight="regular" />
            Edit
          </button>
          <button
            onClick={onClone}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: "#3C3854",
              color: "#FFFFFF",
            }}
          >
            <CopySimple size={16} weight="regular" />
            Clone
          </button>
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ backgroundColor: "#3C3854" }}
          >
            <DotsThree size={20} weight="bold" color="#FFFFFF" />
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t" style={{ borderColor: "#1F1F1F" }} />
    </>
  );
}
