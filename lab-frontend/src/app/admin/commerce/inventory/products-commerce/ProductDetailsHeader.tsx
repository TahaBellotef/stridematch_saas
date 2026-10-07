"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";

interface ProductDetailsHeaderProps {
  modelName: string;
  category: string;
  brand: string;
  releaseYear: string;
  onPrevious?: () => void;
  onNext?: () => void;
}

export default function ProductDetailsHeader({
  modelName,
  category,
  brand,
  releaseYear,
  onPrevious,
  onNext,
}: ProductDetailsHeaderProps) {
  return (
    <>
      {/* Header Section */}
      <div className="px-6 py-6">
        {/* Model Name with Navigation */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-2xl font-bold">{modelName}</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={onPrevious}
              className="hover:opacity-80 transition-opacity"
            >
              <CaretLeft size={24} weight="bold" color="#FFFFFF" />
            </button>
            <button
              onClick={onNext}
              className="hover:opacity-80 transition-opacity"
            >
              <CaretRight size={24} weight="bold" color="#FFFFFF" />
            </button>
          </div>
        </div>

        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-2">
            {/* Category Card */}
            <span
              className="inline-block px-3 py-1 rounded text-sm font-medium"
              style={{
                backgroundColor: "#353D51",
                color: "#59C88B",
                border: "1px solid #59C88B",
              }}
            >
              {category}
            </span>
            <span className="text-slate-500 text-sm">•</span>
            <span className="text-slate-400 text-sm">{brand}</span>
            <span className="text-slate-500 text-sm">•</span>
            <span className="text-slate-400 text-sm">{releaseYear}</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t" style={{ borderColor: "#1F1F1F" }} />
    </>
  );
}
