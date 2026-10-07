"use client";

import { useState, useEffect, useRef } from "react";
import { getCatalogInventory } from "@/shared/api/catalog";
import { useAuth } from "@/shared/auth";

interface ProductsToolbarProps {
  onSearch?: (value: string) => void;
  onFilterChange?: (filters: any) => void;
  onSortByPrice?: () => void;
  sortOrder?: 'asc' | 'desc' | null;
}

export default function ProductsToolbar({ onSearch, onFilterChange, onSortByPrice, sortOrder }: ProductsToolbarProps) {
  const { token } = useAuth();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedGender, setSelectedGender] = useState<string>("");
  
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);

  // Close all dropdowns
  const closeAllDropdowns = () => {
    setShowBrandDropdown(false);
    setShowCategoryDropdown(false);
    setShowSizeDropdown(false);
    setShowGenderDropdown(false);
  };

  // Handle click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        closeAllDropdowns();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch unique brands, categories, sizes from database
  useEffect(() => {
    async function fetchFilters() {
      try {
        const response = await getCatalogInventory(1000);
        const items = response.items;

        // Extract unique brands
        const uniqueBrands = [...new Set(items.map(item => item.brand).filter(Boolean))];
        setBrands(uniqueBrands as string[]);

        // Extract unique categories - check both terrain and metadata fields
        const uniqueCategories = [...new Set(items.map(item => {
          const meta = item.metadata as any;
          return item.terrain || meta?.category;
        }).filter(Boolean))];
        setCategories(uniqueCategories as string[]);

        // Generate sizes from 30 to 50
        const sizeRange = Array.from({ length: 21 }, (_, i) => (30 + i).toString());
        setSizes(sizeRange);
      } catch (err) {
        console.error("Failed to fetch filters:", err);
      }
    }
    if (token) {
      fetchFilters();
    }
  }, [token]);

  // Notify parent component when filters change
  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({
        brands: selectedBrands,
        categories: selectedCategories,
        sizes: selectedSizes,
        gender: selectedGender,
      });
    }
  }, [selectedBrands, selectedCategories, selectedSizes, selectedGender, onFilterChange]);

  const hasActiveFilters = selectedBrands.length > 0 || selectedCategories.length > 0 || selectedSizes.length > 0 || selectedGender;

  const removeFilter = (type: string, value?: string) => {
    if (type === "brand" && value) {
      setSelectedBrands(prev => prev.filter(b => b !== value));
    } else if (type === "category" && value) {
      setSelectedCategories(prev => prev.filter(c => c !== value));
    } else if (type === "size" && value) {
      setSelectedSizes(prev => prev.filter(s => s !== value));
    } else if (type === "gender") {
      setSelectedGender("");
    }
  };

  return (
    <div ref={toolbarRef}>
      {/* Main Toolbar Card - Expands when filters are active */}
      <div
        className="rounded-xl transition-all duration-300"
        style={{
          width: "1213px",
          padding: hasActiveFilters ? "24px" : "16px 24px",
          backgroundColor: "#312D4B",
        }}
      >
        <div className="flex items-center gap-4">
          {/* Search Field - 312x40 */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search"
              onChange={(e) => onSearch?.(e.target.value)}
              className="pl-10 pr-4 rounded-lg text-sm outline-none"
              style={{
                width: "312px",
                height: "40px",
                backgroundColor: "#28243D",
                color: "#9CA3AF",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </div>

        {/* Filter Text */}
        <span className="text-sm text-slate-400">Filter</span>

        {/* Divider */}
        <div
          className="w-px h-6"
          style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
        />

        {/* Filter Buttons */}
        <div className="flex items-center gap-3">
          {/* Brand Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                if (showBrandDropdown) {
                  closeAllDropdowns();
                } else {
                  closeAllDropdowns();
                  setShowBrandDropdown(true);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "#312D4B",
                color: "#9CA3AF",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Brand
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showBrandDropdown && brands.length > 0 && (
              <div
                className="absolute top-full mt-2 rounded-lg p-2 min-w-[200px] max-h-[300px] overflow-y-auto z-10"
                style={{ backgroundColor: "#28243D", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {brands.map(brand => (
                  <label key={brand} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBrands.includes(brand)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBrands([...selectedBrands, brand]);
                        } else {
                          setSelectedBrands(selectedBrands.filter(b => b !== brand));
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-slate-300">{brand}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Category Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                if (showCategoryDropdown) {
                  closeAllDropdowns();
                } else {
                  closeAllDropdowns();
                  setShowCategoryDropdown(true);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "#312D4B",
                color: "#9CA3AF",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Category
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showCategoryDropdown && categories.length > 0 && (
              <div
                className="absolute top-full mt-2 rounded-lg p-2 min-w-[200px] max-h-[300px] overflow-y-auto z-10"
                style={{ backgroundColor: "#28243D", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {categories.map(category => (
                  <label key={category} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCategories([...selectedCategories, category]);
                        } else {
                          setSelectedCategories(selectedCategories.filter(c => c !== category));
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-slate-300">{category}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Size Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                if (showSizeDropdown) {
                  closeAllDropdowns();
                } else {
                  closeAllDropdowns();
                  setShowSizeDropdown(true);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "#312D4B",
                color: "#9CA3AF",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Size
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSizeDropdown && sizes.length > 0 && (
              <div
                className="absolute top-full mt-2 rounded-lg p-2 min-w-[200px] max-h-[300px] overflow-y-auto z-10"
                style={{ backgroundColor: "#28243D", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {sizes.map(size => (
                  <label key={size} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSizes.includes(size)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSizes([...selectedSizes, size]);
                        } else {
                          setSelectedSizes(selectedSizes.filter(s => s !== size));
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-slate-300">{size}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Gender Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                if (showGenderDropdown) {
                  closeAllDropdowns();
                } else {
                  closeAllDropdowns();
                  setShowGenderDropdown(true);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "#312D4B",
                color: "#9CA3AF",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Gender
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showGenderDropdown && (
              <div
                className="absolute top-full mt-2 rounded-lg p-2 min-w-[150px] z-10"
                style={{ backgroundColor: "#28243D", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {["Man", "Woman"].map(gender => (
                  <label key={gender} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      checked={selectedGender === gender}
                      onChange={() => setSelectedGender(gender)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-slate-300">{gender}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div
          className="w-px h-6"
          style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
        />

        {/* Sort by Price - Clickable Text */}
        <button
          onClick={onSortByPrice}
          className="flex items-center gap-2 text-sm transition-opacity hover:opacity-70 cursor-pointer"
          style={{
            color: sortOrder ? "#60E497" : "#9CA3AF",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={sortOrder === 'desc' 
                ? "M3 4h13M3 8h9m-9 4h6m4 0l4 4m0 0l4-4m-4 4v-12"
                : "M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"}
            />
          </svg>
          Sort by Price {sortOrder === 'asc' ? '↑' : sortOrder === 'desc' ? '↓' : ''}
        </button>
      </div>

      {/* Active Filters - Inside the card when filters are selected */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <span className="text-sm text-slate-400">Active:</span>
          
          {/* Brand Filters */}
          {selectedBrands.map(brand => (
            <div
              key={brand}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "#9CA3AF",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Brand: {brand}
              <button onClick={() => removeFilter("brand", brand)} className="hover:opacity-70 transition-opacity">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* Category Filters */}
          {selectedCategories.map(category => (
            <div
              key={category}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "#9CA3AF",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Category: {category}
              <button onClick={() => removeFilter("category", category)} className="hover:opacity-70 transition-opacity">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* Size Filters */}
          {selectedSizes.length > 0 && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "#9CA3AF",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Size: {selectedSizes.join(", ")}
              {selectedSizes.map(size => (
                <button key={size} onClick={() => removeFilter("size", size)} className="hover:opacity-70 transition-opacity">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Gender Filter */}
          {selectedGender && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "#9CA3AF",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Gender: {selectedGender}
              <button onClick={() => removeFilter("gender")} className="hover:opacity-70 transition-opacity">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
