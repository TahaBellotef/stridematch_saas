"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartCard } from "@/app/admin/dashboard/ChartCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import ProductDetailsDrawer from "./ProductDetailsDrawer";
import ProductsToolbar from "./ProductsToolbar";
import { fetchInventoryItems, InventoryItem } from "./catalogClient";

type ProductCard = {
  id: string;
  brand: string;
  name: string;
  route: string;
  price: string;
  priceValue?: number;
  imageUrl?: string;
};

export default function GridView() {
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(8);
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

  const products: ProductCard[] = useMemo(
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

      // Map to ProductCard format
      const mapped = filtered.map((item) => {
        const model =
          item.model ||
          item.metadata?.model_name ||
          item.metadata?.model ||
          "Unknown model";
        const terrain =
          item.terrain ||
          item.metadata?.category ||
          item.metadata?.terrain ||
          "Mixed";
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
          brand: item.brand || "Unknown brand",
          name: model,
          route: terrain,
          price,
          priceValue,
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

  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const pageProducts = products.slice((page - 1) * pageSize, page * pageSize);
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
        <ChartCard title="All Products" noInnerCard={true}>
        <div className="space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading && <LoadingSpinner />}

          {!loading && !products.length && !error && (
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
              No products found in inventory.
            </div>
          )}

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {pageProducts.map((product) => {
              const item = items.find(i => (i.id ?? i.model) === product.id);
              return (
              <div
                key={product.id}
                className="rounded-2xl border p-6 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => item && setSelectedProduct(item)}
                style={{
                  backgroundColor: "#312D4B",
                  borderColor: "rgba(255,255,255,0.06)",
                }}
              >
                {/* Route Badge */}
                <div className="mb-4">
                  <span
                    className="inline-block px-3 py-1.5 rounded-md text-xs font-medium border"
                    style={{
                      backgroundColor: "transparent",
                      borderColor: "#60E497",
                      color: "#60E497",
                    }}
                  >
                    {product.route}
                  </span>
                </div>

                {/* Product Image */}
                <div
                  className="rounded-xl mb-6 flex items-center justify-center overflow-hidden"
                  style={{
                    height: "200px",
                    backgroundColor: "#28243D",
                  }}
                >
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={`${product.brand} ${product.name}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xs text-slate-500">No image</span>
                  )}
                </div>

                {/* Product Info */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-white font-bold text-lg mb-1">
                      {product.brand}
                    </h3>
                    <p className="text-slate-400 text-sm">{product.name}</p>
                  </div>

                  <div
                    className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: "#48416E",
                      color: "#FFFFFF",
                    }}
                  >
                    • In stock
                  </div>

                  {/* Divider */}
                  <div
                    className="border-t"
                    style={{ borderColor: "rgba(255,255,255,0.1)" }}
                  />

                  {/* Price and Actions */}
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-white">
                      {product.price}
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="p-2.5 rounded-full transition hover:opacity-80"
                        style={{ backgroundColor: "#48416E" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          item && setSelectedProduct(item);
                        }}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="#FFFFFF"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                      <button
                        className="p-2.5 rounded-full transition hover:opacity-80"
                        style={{ backgroundColor: "#48416E" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="#FFFFFF"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )})}
          </div>


          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
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
                <option>8</option>
                <option>16</option>
                <option>32</option>
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
                );
              })}
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
