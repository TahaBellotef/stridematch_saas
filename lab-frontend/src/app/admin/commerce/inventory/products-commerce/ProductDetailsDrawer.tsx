"use client";

import { useState } from "react";
import { ChartCard } from "@/app/admin/dashboard/ChartCard";
import type { InventoryItem } from "./catalogClient";
import Image from "next/image";
import ProductDetailsTopBar from "./ProductDetailsTopBar";
import ProductDetailsHeader from "./ProductDetailsHeader";
import ProductDetailsTabs from "./ProductDetailsTabs";
import { CardsThree, CaretCircleDoubleDown, CaretDown, CodepenLogo, Sneaker, UserFocus, Van, VectorThree, Waveform } from "@phosphor-icons/react";

interface ProductDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product: InventoryItem | null;
}

interface Note {
  id: string;
  author: string;
  date: string;
  content: string;
  category?: string;
}

function NotesContent() {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("date");

  // Sample notes data
  const [notes] = useState<Note[]>([
    {
      id: "1",
      author: "John Doe",
      date: "2026-02-08",
      content: "Customer reported excellent cushioning and comfort during long runs. The shoe performed well on both road and light trail surfaces.",
      category: "Feedback"
    },
    {
      id: "2",
      author: "Sarah Smith",
      date: "2026-02-07",
      content: "Stock levels running low. Need to reorder by end of week to maintain inventory levels.",
      category: "Inventory"
    },
    {
      id: "3",
      author: "Mike Johnson",
      date: "2026-02-05",
      content: "Quality issue reported with batch #2024-03. Investigating potential manufacturing defect in heel counter.",
      category: "Quality"
    },
    {
      id: "4",
      author: "Emily Chen",
      date: "2026-02-03",
      content: "Price adjustment approved. New pricing will be effective from March 1st, 2026.",
      category: "Pricing"
    },
    {
      id: "5",
      author: "David Lee",
      date: "2026-02-01",
      content: "New supplier confirmed for next quarter. Expecting improved delivery times and reduced costs.",
      category: "Inventory"
    },
    {
      id: "6",
      author: "Rachel Green",
      date: "2026-01-28",
      content: "Multiple positive reviews mentioning durability and traction. Consider highlighting these features in marketing materials.",
      category: "Feedback"
    }
  ]);

  const filteredNotes = filterCategory === "all" 
    ? notes 
    : notes.filter(note => note.category?.toLowerCase() === filterCategory.toLowerCase());

  return (
    <div className="px-6 pb-6">
      {/* Inner card container */}
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: "#312D4B" }}
      >
        {/* Search and Filters */}
        <div className="flex items-center gap-3 mb-6">
        <div className="relative" style={{ width: "312px" }}>
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: "#28243D",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#E7E3FC",
            }}
          />
        </div>
        
        <div style={{ position: "relative", width: "110px" }}>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="py-2 rounded-full text-sm outline-none"
            style={{
              width: "100%",
              paddingLeft: "16px",
              paddingRight: "28px",
              backgroundColor: "#312D4B",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#E7E3FC",
              boxShadow: "none",
              appearance: "none",
            }}
            onFocus={(e) => e.target.style.border = "1px solid rgba(255,255,255,0.1)"}
          >
            <option value="all">Type</option>
            <option value="feedback">Feedback</option>
            <option value="inventory">Inventory</option>
            <option value="quality">Quality</option>
            <option value="pricing">Pricing</option>
          </select>
          <CaretDown 
            size={16} 
            weight="bold" 
            style={{
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "#E7E3FC"
            }} 
          />
        </div>

        <div style={{ position: "relative", width: "110px" }}>
          <select
            className="py-2 rounded-full text-sm outline-none"
            style={{
              width: "100%",
              paddingLeft: "16px",
              paddingRight: "28px",
              backgroundColor: "#312D4B",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#E7E3FC",
              boxShadow: "none",
              appearance: "none",
            }}
            onFocus={(e) => e.target.style.border = "1px solid rgba(255,255,255,0.1)"}
          >
            <option>Priority</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <CaretDown 
            size={16} 
            weight="bold" 
            style={{
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "#E7E3FC"
            }} 
          />
        </div>

        <div style={{ position: "relative", width: "110px" }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="py-2 rounded-full text-sm outline-none"
            style={{
              width: "100%",
              paddingLeft: "16px",
              paddingRight: "28px",
              backgroundColor: "#312D4B",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#E7E3FC",
              boxShadow: "none",
              appearance: "none",
            }}
            onFocus={(e) => e.target.style.border = "1px solid rgba(255,255,255,0.1)"}
          >
            <option value="date">Sort</option>
            <option value="date">Date</option>
            <option value="author">Author</option>
            <option value="category">Category</option>
          </select>
          <CaretDown 
            size={16} 
            weight="bold" 
            style={{
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "#E7E3FC"
            }} 
          />
        </div>
      </div>

      {/* Notes Container */}
      <div 
        className="rounded-lg p-4"
        style={{ backgroundColor: "#28243D" }}
      >
        {/* Notes Title */}
        <h2 className="text-sm font-semibold text-white mb-4">Notes</h2>

        {/* Notes List */}
        {filteredNotes.length > 0 ? (
          <div className="space-y-3">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="rounded-lg p-4"
                style={{ backgroundColor: "#312D4B" }}
              >
                {/* Category Badge */}
                {note.category && (
                  <span
                    className="inline-block px-3 py-1 rounded text-xs font-medium mb-3"
                    style={{
                      backgroundColor: "rgba(96, 228, 151, 0.2)",
                      color: "#60E497",
                      border: "1px solid #60E497",
                    }}
                  >
                    {note.category}
                  </span>
                )}
                
                {/* Note Content */}
                <p className="text-sm text-slate-300 leading-relaxed mb-4">
                  {note.content}
                </p>
                
                {/* Author Info at Bottom */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                    style={{
                      backgroundColor: "#6F41E8",
                      color: "#FFFFFF",
                    }}
                  >
                    {note.author.split(" ").map(n => n[0]).join("")}
                  </div>
                  <p className="text-xs text-slate-400">
                    {note.author} • {new Date(note.date).getFullYear()}
                  </p>
                </div>
              </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-slate-400 text-sm">
            No notes found
          </p>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

export default function ProductDetailsDrawer({
  isOpen,
  onClose,
  product,
}: ProductDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"general" | "notes">("general");
  
  if (!isOpen || !product) return null;

  // Helper functions to extract data
  const getImageUrl = (product: InventoryItem): string => {
    if (product.shoe_image_url) return product.shoe_image_url;
    if (product.metadata) {
      const meta = product.metadata as Record<string, any>;
      const imageUrl = meta.shoe_image_url || meta.image_url || meta.image || meta.img || meta.picture || meta.photo || meta.url;
      if (imageUrl) return imageUrl;
    }
    return "/shoe.png"; // Default fallback
  };

  const getModelName = (product: InventoryItem): string => {
    const meta = product.metadata as Record<string, any> | null;
    return meta?.model_name || product.model || "Unknown Model";
  };

  const getCategory = (product: InventoryItem): string => {
    const meta = product.metadata as Record<string, any> | null;
    return meta?.category || product.terrain || "Unknown";
  };

  const getPace = (product: InventoryItem): string => {
    const meta = product.metadata as Record<string, any> | null;
    return meta?.pace || "N/A";
  };

  const getPrice = (product: InventoryItem): number => {
    const meta = product.metadata as Record<string, any> | null;
    return meta?.price_usd || product.price || 0;
  };

  const getReleaseYear = (product: InventoryItem): string => {
    const meta = product.metadata as Record<string, any> | null;
    return meta?.release_year?.toString() || "N/A";
  };

    const getForefootWidth = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const width = meta?.midsole_width_forefoot_mm;
      return width ? `${width}` : "N/A";
    };

    const getMidfootWidth = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const width = meta?.midsole_width_heel_mm;
      return width ? `${width}` : "N/A";
    };

    const getWeight = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.weight_g ?? (product as any)?.weight_g;
      return value !== undefined && value !== null ? `${value}` : "N/A";
    };

    const getDrop = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.drop_mm ?? (product as any)?.drop_mm;
      return value !== undefined && value !== null ? `${value}` : "N/A";
    };

    const getStackHeel = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.stack_heel_mm ?? (product as any)?.stack_heel_mm;
      return value !== undefined && value !== null ? `${value}` : "N/A";
    };

    const getStackForefoot = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.stack_forefoot_mm ?? (product as any)?.stack_forefoot_mm;
      return value !== undefined && value !== null ? `${value}` : "N/A";
    };

    const getStrikePattern = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.strike_pattern ?? (product as any)?.strike_pattern;
      return value || "N/A";
    };

    const getArchSupport = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.arch_support ?? (product as any)?.arch_support;
      return value || "N/A";
    };

    const getPaceList = (product: InventoryItem): string[] => {
      const pace = getPace(product);
      return pace
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    };

    const getFoamCompound = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.foam_compound ?? (product as any)?.foam_compound;
      return value || "N/A";
    };

    const getRockerType = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.rocker_type ?? (product as any)?.rocker_type;
      return value || "N/A";
    };

    const getCushioningSoftness = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.cushioning_softness_ha ?? (product as any)?.cushioning_softness_ha;
      return value !== undefined && value !== null ? `${value}` : "N/A";
    };

    const getEnergyReturn = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.energy_return_pct ?? (product as any)?.energy_return_pct;
      return value !== undefined && value !== null ? `${value}` : "N/A";
    };

    const getHeelRigidity = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.heel_counter_stiffness_score ?? (product as any)?.heel_counter_stiffness_score;
      return value !== undefined && value !== null ? `${value}` : "N/A";
    };

    const getTorsionalRigidity = (product: InventoryItem): string => {
      const meta = product.metadata as Record<string, any> | null;
      const value = meta?.torsional_rigidity_index ?? (product as any)?.torsional_rigidity_index;
      return value !== undefined && value !== null ? `${value}` : "N/A";
    };

  

  const warehouses = [
    { id: 1, name: "Warehouse 1", stock: 120, color: "#6F41E8" },
    { id: 2, name: "Warehouse 2", stock: 250, color: "#10B981" },
    { id: 3, name: "Warehouse 3", stock: 75, color: "#8B5CF6" },
    { id: 4, name: "Warehouse 4", stock: 300, color: "#EF4444" },
    { id: 5, name: "Warehouse 5", stock: 50, color: "#6B7280" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 w-[1000px] z-50 overflow-y-auto"
        style={{
          backgroundColor: "#28243D",
        }}
      >
        <ProductDetailsTopBar onClose={onClose} />
        
        <ProductDetailsHeader
          modelName={getModelName(product)}
          category={getCategory(product)}
          brand={product.brand || "Unknown"}
          releaseYear={getReleaseYear(product)}
        />

        <ProductDetailsTabs 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Content - Conditional rendering based on active tab */}
        {activeTab === "general" ? (
        <div className="px-6 pb-6">
          <div className="grid grid-cols-5 gap-6 relative">
            {/* Left Column - Image and Info Cards */}
            <div className="col-span-3 space-y-6 pr-6">
              {/* Product Image */}
              <div
                className="rounded-2xl p-6"
                
              >
                <div className="flex gap-4">
                  {/* Main Image */}
                  <div
                    className="rounded-xl flex items-center justify-center flex-1 relative overflow-hidden"
                    style={{
                      height: "275px",
                      backgroundColor: "#201C35",
                    }}
                  >
                    <Image
                      src={getImageUrl(product)}
                      alt={getModelName(product)}
                      fill
                      className="object-contain p-4"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = "/shoe.png";
                      }}
                    />
                  </div>
                  
                  {/* Thumbnail Images */}
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="rounded-lg flex items-center justify-center relative overflow-hidden"
                        style={{
                          width: "60px",
                          height: "60px",
                          backgroundColor: "#201C35",
                        }}
                      >
                        <Image
                          src={getImageUrl(product)}
                          alt={`${getModelName(product)} thumbnail ${i}`}
                          fill
                          className="object-contain p-2"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = "/shoe.png";
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Basic Information & Logistics */}
              <div>
                <h3 className="text-white text-base font-medium mb-4">Basic Information</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">Total be Packed</p>
                    <p className="text-white text-sm font-medium">Stocked Product</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">Category</p>
                    <p className="text-white text-sm font-medium">{getModelName(product)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">Barcode</p>
                    <p className="text-white text-sm font-medium">000000</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">Unit</p>
                    <p className="text-white text-sm font-medium">Each</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">SKU</p>
                    <p className="text-white text-sm font-medium">XXX-YYY-00</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">Color</p>
                    <p className="text-white text-sm font-medium">Grey / Black</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">Intended Surface</p>
                    <p className="text-white text-sm font-medium">{getCategory(product)}</p>
                  </div>
                </div>

                {/* Divider */}
                <div 
                  className="border-t mt-6 mb-6"
                  style={{ 
                    borderColor: "#1F1F1F",
                    width: "508px"
                  }}
                />

                <h3 className="text-white text-base font-medium mb-4">Logistics & Storage</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">Storage Type</p>
                    <p className="text-white text-sm font-medium">Dry / Ambient</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">Stackable</p>
                    <p className="text-white text-sm font-medium">Yes</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <p className="text-slate-500 text-sm">Color</p>
                    <p className="text-white text-sm font-medium">Grey / Black</p>
                  </div>
                </div>

                  {/* Dimensions Card */}
                  <div 
                    className="rounded-2xl p-6 mt-4"
                    style={{ 
                      width: "508px",
                      backgroundColor: "#28243D",
                      border: "1px solid #1B1926",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="flex items-center justify-center rounded-lg"
                        style={{
                          width: "36px",
                          height: "36px",
                          backgroundColor: "#2B2643",
                          border: "1px solid #59C88B",
                        }}
                      >
                        <VectorThree size={20} weight="bold" color="#59C88B" />
                      </div>
                      <h3 className="text-white text-base font-medium">Dimensions</h3>
                    </div>

                    {/* Inner Card */}
                    <div 
                      className="rounded-xl p-4 w-full"
                      style={{ 
                        backgroundColor: "#2B2643",
                        border: "1px solid #1B1926",
                      }}
                    >
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Forefoot width</p>
                          <p className="text-white text-sm font-medium">{getForefootWidth(product)} mm</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Midfoot Width</p>
                          <p className="text-white text-sm font-medium">{getMidfootWidth(product)} mm</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Fit Width</p>
                          <p className="text-white text-sm font-medium">Medium</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Main Features Card */}
                  <div 
                    className="rounded-2xl p-6 mt-4"
                    style={{ 
                      width: "508px",
                      backgroundColor: "#28243D",
                      border: "1px solid #1B1926",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="flex items-center justify-center rounded-lg"
                        style={{
                          width: "36px",
                          height: "36px",
                          backgroundColor: "#2B2643",
                          border: "1px solid #59C88B",
                        }}
                      >
                        <Sneaker size={20} weight="bold" color="#59C88B" />
                      </div>
                      <h3 className="text-white text-base font-medium">Main Features</h3>
                    </div>

                    {/* Inner Card */}
                    <div 
                      className="rounded-xl p-4 w-full"
                      style={{ 
                        backgroundColor: "#2B2643",
                        border: "1px solid #1B1926",
                      }}
                    >
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Weight</p>
                          <p className="text-white text-sm font-medium">{getWeight(product)} g</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Drop</p>
                          <p className="text-white text-sm font-medium">{getDrop(product)} mm</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Stack (Heel)</p>
                          <p className="text-white text-sm font-medium">{getStackHeel(product)} mm</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Stack (Forefoot)</p>
                          <p className="text-white text-sm font-medium">{getStackForefoot(product)} mm</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Foot Strike</p>
                          <p className="text-white text-sm font-medium">{getStrikePattern(product)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cushioning & Use Card */}
                  <div 
                    className="rounded-2xl p-6 mt-4"
                    style={{ 
                      width: "508px",
                      backgroundColor: "#28243D",
                      border: "1px solid #1B1926",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="flex items-center justify-center rounded-lg"
                        style={{
                          width: "36px",
                          height: "36px",
                          backgroundColor: "#2B2643",
                          border: "1px solid #59C88B",
                        }}
                      >
                        <CaretCircleDoubleDown size={20} weight="bold" color="#59C88B" />
                      </div>
                      <h3 className="text-white text-base font-medium">Cushioning & Use</h3>
                    </div>

                    {/* Inner Card */}
                    <div 
                      className="rounded-xl p-4 w-full"
                      style={{ 
                        backgroundColor: "#2B2643",
                        border: "1px solid #1B1926",
                      }}
                    >
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 items-start">
                          <p className="text-slate-500 text-sm">Cushioning</p>
                          <p className="text-white text-sm font-medium">{getCushioningSoftness(product)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 items-start">
                          <p className="text-slate-500 text-sm">Terrain</p>
                          <div className="flex flex-col gap-2">
                            {(getPaceList(product).length ? getPaceList(product) : ["N/A"]).map((pace) => (
                              <span
                                key={pace}
                                className="inline-flex w-fit px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                                style={{
                                  color: "#59C88B",
                                  backgroundColor: "rgba(89,200,139,0.15)",
                                }}
                              >
                                {pace}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 items-start">
                          <p className="text-slate-500 text-sm">Stability</p>
                          <span
                            className="inline-flex w-fit px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                            style={{
                              color: "#F14336",
                              backgroundColor: "rgba(241,67,54,0.15)",
                            }}
                          >
                            {getArchSupport(product)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Technology Card */}
                  <div 
                    className="rounded-2xl p-6 mt-4"
                    style={{ 
                      width: "508px",
                      backgroundColor: "#28243D",
                      border: "1px solid #1B1926",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="flex items-center justify-center rounded-lg"
                        style={{
                          width: "36px",
                          height: "36px",
                          backgroundColor: "#2B2643",
                          border: "1px solid #59C88B",
                        }}
                      >
                        <CodepenLogo size={20} weight="bold" color="#59C88B" />
                      </div>
                      <h3 className="text-white text-base font-medium">Technology</h3>
                    </div>

                    {/* Inner Card */}
                    <div 
                      className="rounded-xl p-4 w-full"
                      style={{ 
                        backgroundColor: "#2B2643",
                        border: "1px solid #1B1926",
                      }}
                    >
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Foam Type</p>
                          <p className="text-white text-sm font-medium">{getFoamCompound(product)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Energy return</p>
                          <p className="text-white text-sm font-medium">{getEnergyReturn(product)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Rocker Type</p>
                          <p className="text-white text-sm font-medium">{getRockerType(product)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rigidity Card */}
                  <div 
                    className="rounded-2xl p-6 mt-4"
                    style={{ 
                      width: "508px",
                      backgroundColor: "#28243D",
                      border: "1px solid #1B1926",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="flex items-center justify-center rounded-lg"
                        style={{
                          width: "36px",
                          height: "36px",
                          backgroundColor: "#2B2643",
                          border: "1px solid #59C88B",
                        }}
                      >
                        <Waveform size={20} weight="bold" color="#59C88B" />
                      </div>
                      <h3 className="text-white text-base font-medium">Rigidity</h3>
                    </div>

                    {/* Inner Card */}
                    <div 
                      className="rounded-xl p-4 w-full"
                      style={{ 
                        backgroundColor: "#2B2643",
                        border: "1px solid #1B1926",
                      }}
                    >
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Heel Rigidity</p>
                          <p className="text-white text-sm font-medium">{getHeelRigidity(product)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <p className="text-slate-500 text-sm">Torsional Rigidity</p>
                          <p className="text-white text-sm font-medium">{getTorsionalRigidity(product)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>

            {/* Divider */}
            <div 
              className="absolute left-[60%] top-0 bottom-0 w-px" 
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
            />

            {/* Right Column - Stock and Reorder */}
                <div className="col-span-2 space-y-6 pl-6">

              {/* Details Card */}
              <div 
                className="rounded-2xl p-6"
                style={{ 
                  backgroundColor: "#28243D",
                  border: "1px solid #1B1926",
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="flex items-center justify-center rounded-lg"
                    style={{
                      width: "36px",
                      height: "36px",
                      backgroundColor: "#2B2643",
                      border: "1px solid #59C88B",
                    }}
                  >
                    <UserFocus size={20} weight="bold" color="#59C88B" />
                  </div>
                  <h3 className="text-white text-base font-medium">Details</h3>
                </div>

                {/* Inner Card */}
                <div 
                  className="rounded-xl p-4 w-full"
                  style={{ 
                    backgroundColor: "#2B2643",
                    border: "1px solid #1B1926",
                  }}
                >
                  <div className="space-y-4">
                    {/* Drop */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-slate-400 text-sm">Drop</p>
                        <p style={{ color: "#60E497" }} className="text-xs font-medium">95%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "95%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                        <p className="text-slate-500 text-xs whitespace-nowrap">6mm vs 5mm</p>
                      </div>
                    </div>

                    {/* Amorti */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-slate-400 text-sm">Amorti</p>
                        <p style={{ color: "#60E497" }} className="text-xs font-medium">95%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "95%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                        <p className="text-slate-500 text-xs whitespace-nowrap">medium vs high</p>
                      </div>
                    </div>

                    {/* Stability */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-slate-400 text-sm">Stability</p>
                        <p style={{ color: "#FC6804" }} className="text-xs font-medium">70%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "70%",
                              backgroundColor: "#FC6804"
                            }}
                          />
                        </div>
                        <p className="text-slate-500 text-xs whitespace-nowrap">mid vs neutral</p>
                      </div>
                    </div>

                    {/* Width */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-slate-400 text-sm">Width</p>
                        <p style={{ color: "#60E497" }} className="text-xs font-medium">100%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "100%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                        <p className="text-slate-500 text-xs whitespace-nowrap">6mm vs 5mm</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cushioning Inner Card */}
                <div 
                  className="rounded-xl p-4 w-full mt-4"
                  style={{ 
                    backgroundColor: "#2B2643",
                    border: "1px solid #1B1926",
                  }}
                >
                  <p className="text-white text-sm font-medium mb-4">Cushioning</p>
                  <div className="space-y-4">
                    <div>
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "100%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                        <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "100%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                        <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "100%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs text-slate-400">
                        <div className="flex-1 text-center">Low</div>
                        <div className="flex-1 text-center">Medium</div>
                        <div className="flex-1 text-center">High</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Flexibility Inner Card */}
                <div 
                  className="rounded-xl p-4 w-full mt-4"
                  style={{ 
                    backgroundColor: "#2B2643",
                    border: "1px solid #1B1926",
                  }}
                >
                  <p className="text-white text-sm font-medium mb-4">Flexibility</p>
                  <div className="space-y-4">
                    <div>
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "100%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                        <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "0%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                        <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "0%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs text-slate-400">
                        <div className="flex-1 text-center">Low</div>
                        <div className="flex-1 text-center">Medium</div>
                        <div className="flex-1 text-center">High</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Heel to Toe Drop Inner Card */}
                <div 
                  className="rounded-xl p-4 w-full mt-4"
                  style={{ 
                    backgroundColor: "#2B2643",
                    border: "1px solid #1B1926",
                  }}
                >
                  <p className="text-white text-sm font-medium mb-4">Heel to Toe Drop</p>
                  <div className="space-y-4">
                    <div>
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "100%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                        <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "0%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                        <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: "#28243D", border: "1px solid #1E1C2B" }}>
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: "0%",
                              backgroundColor: "#60E497"
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs text-slate-400">
                        <div className="flex-1 text-center">Low</div>
                        <div className="flex-1 text-center">Medium</div>
                        <div className="flex-1 text-center">High</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock Card */}
              <div 
                className="rounded-2xl p-6"
                style={{ 
                  backgroundColor: "#28243D",
                  border: "1px solid #1B1926",
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="flex items-center justify-center rounded-lg"
                    style={{
                      width: "36px",
                      height: "36px",
                      backgroundColor: "#2B2643",
                      border: "1px solid #59C88B",
                    }}
                  >
                    <CardsThree size={20} weight="bold" color="#59C88B" />
                  </div>
                  <h3 className="text-white text-base font-medium">Stock</h3>
                </div>

                {/* Inner Card */}
                <div 
                  className="rounded-xl p-4 w-full"
                  style={{ 
                    backgroundColor: "#2B2643",
                    border: "1px solid #1B1926",
                  }}
                >
                  <div className="mb-4">
                    <p className="text-slate-400 text-[10px] mb-2">Quantity at hand</p>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-white">54,318</span>
                      <button
                        className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor: "#48416E",
                          color: "#FFFFFF",
                        }}
                      >
                        Adjust Stock
                      </button>
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="space-y-0">
                    {warehouses.map((warehouse, index) => (
                      <div key={warehouse.id}>
                        <div className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-2 h-2 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: warehouse.color }}
                            />
                            <span className="text-slate-300 text-xs">Color {warehouse.id}</span>
                          </div>
                          <span className="text-slate-400 text-xs">{warehouse.stock} in stock</span>
                        </div>
                        {index < warehouses.length - 1 && (
                          <div className="border-b border-slate-700/30" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Reorder Points Card */}
              <div 
                className="rounded-2xl p-6"
                style={{ 
                  backgroundColor: "#28243D",
                  border: "1px solid #1B1926",
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="flex items-center justify-center rounded-lg"
                    style={{
                      width: "36px",
                      height: "36px",
                      backgroundColor: "#2B2643",
                      border: "1px solid #59C88B",
                    }}
                  >
                    <Van size={20} weight="bold" color="#59C88B" />
                  </div>
                  <h3 className="text-white text-base font-medium">Reorder Points</h3>
                </div>

                {/* Inner Card */}
                <div 
                  className="rounded-xl p-4 w-full"
                  style={{ 
                    backgroundColor: "#2B2643",
                    border: "1px solid #1B1926",
                  }}
                >
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: "#6F41E8" }} />
                      <span className="text-slate-400 text-sm">Warehouse 1</span>
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="space-y-0">
                    <div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-slate-500 text-xs">Method</span>
                        <span className="text-white text-xs font-medium">Purchase Order</span>
                      </div>
                      <div className="border-b border-slate-700/30" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-slate-500 text-xs">Vendor</span>
                        <span className="text-white text-xs font-medium">{product.brand}</span>
                      </div>
                      <div className="border-b border-slate-700/30" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-slate-500 text-xs">Reorder Point</span>
                        <span className="text-white text-xs font-medium">50</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        ) : (
          <NotesContent />
        )}
      </div>
    </>
  );
}

