"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartCard } from "@/app/admin/dashboard/ChartCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import ProductDetailsDrawer from "./ProductDetailsDrawer";
import ProductsToolbar from "./ProductsToolbar";
import { fetchInventoryItems, InventoryItem } from "./catalogClient";

type ListRow = {
  id: string;
  name: string;
  variants: string;
  category: string;
  usage: string;
  price: string;
  priceValue?: number;
  stock: string;
  status: string;
  imageUrl?: string;
};

export default function ListView() {
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<any>({});
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetchInventoryItems()
      .then((data) => {
        if (!mounted) return;
        setItems(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load inventory.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const rows: ListRow[] = useMemo(
    () => {
      let filtered = items;

      // Apply search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.brand?.toLowerCase().includes(query) ||
            item.model?.toLowerCase().includes(query) ||
            (item.metadata as any)?.model_name?.toLowerCase().includes(query)
        );
      }

      // Apply brand filter
      if (filters.brands?.length > 0) {
        filtered = filtered.filter((item) =>
          filters.brands.includes(item.brand)
        );
      }

      // Apply category filter
      if (filters.categories?.length > 0) {
        filtered = filtered.filter((item) => {
          const category = item.terrain || (item.metadata as any)?.category;
          return filters.categories.includes(category);
        });
      }

      // Map to ListRow format
      const mapped = filtered.map((item) => {
        const model =
          item.model ||
          item.metadata?.model_name ||
          item.metadata?.model ||
          "Unknown model";
        const brand = item.brand || "Unknown";
        const category =
          item.terrain ||
          item.metadata?.category ||
          item.metadata?.terrain ||
          "Mixed";
        const usage = item.metadata?.pace || "—";
        const priceValue = typeof item.price === "number" ? item.price : 0;
        const price = priceValue > 0 ? `$${priceValue.toFixed(0)}` : "—";
        const imageUrl =
          item.shoe_image_url ||
          item.metadata?.shoe_image_url ||
          item.metadata?.image_url ||
          item.metadata?.image ||
          undefined;

        return {
          id: item.id ?? model,
          name: model,
          variants: `${brand}`,
          category,
          usage,
          price,
          priceValue,
          stock: "—",
          status: "Active",
          imageUrl,
        };
      });

      // Apply sorting
      if (sortOrder) {
        mapped.sort((a, b) => {
          const priceA = a.priceValue || 0;
          const priceB = b.priceValue || 0;
          return sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
        });
      }

      return mapped;
    },
    [items, searchQuery, filters, sortOrder]
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const handleSortByPrice = () => {
    setSortOrder((prev) => {
      if (prev === null) return 'asc';
      if (prev === 'asc') return 'desc';
      return null;
    });
  };

  return (
    <>
      <div className="space-y-6">
        <ProductsToolbar
          onSearch={setSearchQuery}
          onFilterChange={setFilters}
          onSortByPrice={handleSortByPrice}
          sortOrder={sortOrder}
        />
        <ChartCard title="All Customers">
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading && <LoadingSpinner />}

          {!loading && !rows.length && !error && (
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
              No products found in inventory.
            </div>
          )}

          {/* Table */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: "#28243D",
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            {/* Table Header */}
            <div
              className="grid grid-cols-12 gap-4 px-6 py-4 text-xs font-medium"
              style={{
                backgroundColor: "rgba(255,255,255,0.02)",
                color: "#9CA3AF",
              }}
            >
              <div className="col-span-1 flex items-center">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                />
              </div>
              <div className="col-span-3">Product</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-1">Usage</div>
              <div className="col-span-1">Price</div>
              <div className="col-span-2">Stock</div>
              <div className="col-span-2">Status</div>
            </div>

            {/* Table Rows */}
            {pageRows.map((product) => {
              const item = items.find(i => (i.id ?? i.model) === product.id);
              return (
              <div
                key={product.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center border-t cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => item && setSelectedProduct(item)}
                style={{
                  borderColor: "rgba(255,255,255,0.04)",
                }}
              >
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                </div>
                <div className="col-span-3 flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center"
                  style={{ backgroundColor: "#1E1B2E" }}
                >
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-500">No image</span>
                  )}
                </div>
                  <div>
                    <div className="text-white text-sm font-medium">
                      {product.name}
                    </div>
                    <div className="text-slate-500 text-xs">{product.variants}</div>
                  </div>
                </div>
                <div className="col-span-2 text-slate-300 text-sm">
                  {product.category}
                </div>
                <div className="col-span-1 text-slate-300 text-sm">
                  {product.usage}
                </div>
                <div className="col-span-1 text-white text-sm font-medium">
                  {product.price}
                </div>
                <div className="col-span-2 text-slate-400 text-sm">
                  {product.stock}
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: "#10B98120",
                      color: "#10B981",
                    }}
                  >
                    • {product.status}
                  </span>
                  <button
                    className="text-slate-500 hover:text-slate-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                </div>
              </div>
            )})}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  const nextSize = Number(e.target.value);
                  setPageSize(nextSize);
                  setPage(1);
                }}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#9CA3AF",
                }}
              >
                <option>10</option>
                <option>25</option>
                <option>50</option>
              </select>
              <span className="text-slate-500 text-sm">Item per page</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-2 rounded-lg"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: canPrev ? "#9CA3AF" : "#4B5563",
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {[1, 2, 3, 4, 5].map((pageNumber) => {
                if (pageNumber > totalPages) return null;
                return (
                <button
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: pageNumber === page ? "#6F41E8" : "transparent",
                    color: pageNumber === page ? "#FFFFFF" : "#9CA3AF",
                  }}
                >
                  {pageNumber}
                </button>
              )})}
              {totalPages > 5 && (
                <span className="px-2 text-sm text-slate-500">…</span>
              )}
              {totalPages > 5 && (
                <button
                  onClick={() => setPage(totalPages)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: page === totalPages ? "#6F41E8" : "transparent",
                    color: page === totalPages ? "#FFFFFF" : "#9CA3AF",
                  }}
                >
                  {totalPages}
                </button>
              )}
              <button
                disabled={!canNext}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-2 rounded-lg"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: canNext ? "#9CA3AF" : "#4B5563",
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </ChartCard>
      </div>

      <ProductDetailsDrawer
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        product={selectedProduct}
      />
    </>
  );
}
