"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Drop, Eye, Barbell, Ruler, Star, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { fetchCustomerRecommendations, CatalogItem } from "@/features/lab/services/customer.service";
import { ShoeRecommendation } from "./types";
import { ShoeDetailDrawer } from "./ShoeDetailDrawer";

interface RecommendedShoesProps {
  customerId: string;
}

const PAGE_SIZE = 2;

function mapCatalogItem(item: CatalogItem): ShoeRecommendation {
  return {
    brand: item.brand ?? null,
    model: item.model ?? null,
    matchPercentage: item.score_pct,
    price: item.price ?? null,
    imageUrl: item.image_url ?? null,
    terrain: item.terrain ?? null,
    stability: item.stability ?? null,
    gender: item.gender ?? null,
    dropMm: item.drop_mm ?? null,
    weightG: item.weight_g ?? null,
    stackMm: item.stack_mm ?? null,
    productUrl: item.product_url ?? null,
    metadata: item.metadata ?? null,
  };
}

export function RecommendedShoes({ customerId }: RecommendedShoesProps) {
  const [shoes, setShoes] = useState<ShoeRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selectedShoe, setSelectedShoe] = useState<ShoeRecommendation | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!customerId) {
      setShoes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchCustomerRecommendations(customerId)
      .then((items) => {
        if (isMounted) {
          setShoes(items.map(mapCatalogItem));
          setPage(0);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [customerId]);

  const pageCount = Math.ceil(shoes.length / PAGE_SIZE);
  const visibleShoes = shoes.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div
      style={{ backgroundColor: "#28243D", border: "1px solid #3A3556" }}
      className="rounded-2xl p-4 h-full"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              border: "1px solid rgba(251, 187, 0, 0.55)",
              backgroundColor: "rgba(251, 187, 0, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Star size={16} color="#FBBB00" />
          </div>
          <h2 className="text-sm font-medium text-white">Shoe Recommendation</h2>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="w-7 h-7 flex items-center justify-center rounded-full text-white disabled:opacity-30"
              style={{ backgroundColor: "#3B3658", border: "1px solid #7B75A5" }}
            >
              <CaretLeft size={12} />
            </button>
            <span className="text-xs text-slate-400">
              {page + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="w-7 h-7 flex items-center justify-center rounded-full text-white disabled:opacity-30"
              style={{ backgroundColor: "#3B3658", border: "1px solid #7B75A5" }}
            >
              <CaretRight size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {loading && <p className="text-slate-400 text-sm px-1">Loading recommendations…</p>}
        {!loading && shoes.length === 0 && (
          <p className="text-slate-400 text-sm px-1">
            No recommendations yet — this customer has no completed analysis.
          </p>
        )}
        {visibleShoes.map((shoe, idx) => (
          <div
            key={`${shoe.brand}-${shoe.model}-${idx}`}
            onClick={() => setSelectedShoe(shoe)}
            style={{ backgroundColor: "#312D4B", border: "1px solid #3E3960", cursor: "pointer" }}
            className="rounded-2xl p-4"
          >
            <div className="flex gap-4">
              <div
                style={{ backgroundColor: "#2A2642", border: "1px solid #3E3960" }}
                className="relative w-28 h-28 rounded-xl overflow-hidden flex-shrink-0"
              >
                <Image
                  src={shoe.imageUrl || "/shoe.png"}
                  alt={shoe.model || "Shoe"}
                  fill
                  style={{ objectFit: "contain" }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-white font-semibold text-[18px] leading-tight">
                      {shoe.brand || "—"}
                    </h3>
                    <p className="text-[22px] text-slate-300 leading-tight max-md:text-base">
                      {shoe.model || "—"}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-400/20 text-emerald-300 border border-emerald-400/50 whitespace-nowrap">
                    ⦿ {shoe.matchPercentage}% MATCH
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-3 mb-3">
                  {shoe.terrain && (
                    <span className="px-2 py-1 rounded-md text-xs text-slate-200 bg-[#4A4669] border border-white/10">
                      {shoe.terrain}
                    </span>
                  )}
                  {shoe.stability && (
                    <span className="px-2 py-1 rounded-md text-xs text-slate-200 bg-[#4A4669] border border-white/10">
                      {shoe.stability}
                    </span>
                  )}
                </div>

                {(shoe.dropMm != null || shoe.weightG != null || shoe.stackMm != null) && (
                  <>
                    <div className="h-px bg-white/15 my-3" />
                    <div className="flex items-center gap-4 text-slate-300 text-sm mb-3">
                      {shoe.dropMm != null && (
                        <div className="flex items-center gap-2">
                          <Drop size={14} />
                          <span>{shoe.dropMm}mm drop</span>
                        </div>
                      )}
                      {shoe.weightG != null && (
                        <div className="flex items-center gap-2">
                          <Barbell size={14} />
                          <span>{shoe.weightG}g</span>
                        </div>
                      )}
                      {shoe.stackMm != null && (
                        <div className="flex items-center gap-2">
                          <Ruler size={14} />
                          <span>{shoe.stackMm}mm stack</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="h-px bg-white/15 my-3" />

                <div className="flex items-center justify-between">
                  {shoe.price != null ? (
                    <p className="text-3xl font-semibold text-emerald-400">${shoe.price}</p>
                  ) : (
                    <p className="text-sm text-slate-500">Price unavailable</p>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedShoe(shoe);
                    }}
                    style={{
                      backgroundColor: "#3B3658",
                      border: "1px solid #7B75A5",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm hover:bg-[#34304E] transition-colors flex-shrink-0"
                  >
                    <Eye size={14} />
                    Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ShoeDetailDrawer shoe={selectedShoe} onClose={() => setSelectedShoe(null)} />
    </div>
  );
}
