"use client";

import NextImage from "next/image";
import { ChartLineUp, CurrencyCircleDollar } from "@phosphor-icons/react";

interface AuthSideCardsProps {
  backgroundImage: string;
  cards?: ("sessions" | "revenue" | "totalRevenue" | "totalRevenueRight" | "totalGrowth" | "totalProfit" | "totalProfitLeft")[];
}

export default function AuthSideCards({ 
  backgroundImage, 
  cards = ["sessions", "revenue", "totalRevenue"] 
}: AuthSideCardsProps) {
  return (
    <div className="hidden lg:flex relative overflow-hidden" style={{ width: '58%' }}>
      {/* Background Image */}
      <div className="absolute inset-0">
        <NextImage 
          src={backgroundImage}
          alt="Background" 
          fill
          className="object-cover"
          priority
          style={{ transform: 'scale(1)' }}
        />
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 w-full p-12 flex flex-col">
        {/* Logo */}
        <div className="mb-8">
          <NextImage 
            src="/images/Auth/LogoBlancBleu.png" 
            alt="StrideMatch Logo" 
            width={180} 
            height={24}
            className="h-5 w-auto"
          />
        </div>

        {/* Cards Container */}
        <div className="flex-1 relative">
          {/* Sessions Card */}
          {cards.includes("sessions") && (
            <div 
              className="absolute top-24 left-8 rounded-2xl border px-4 py-4 backdrop-blur-md"
              style={{
                backgroundColor: "rgba(50, 45, 70, 0.7)",
                borderColor: "rgba(100, 90, 140, 0.3)",
                width: "180px",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ChartLineUp size={16} weight="regular" color="white" />
                  <span className="text-xs font-medium text-slate-300">Sessions</span>
                </div>
                <button className="text-slate-500 hover:text-slate-300">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>
              <div 
                className="rounded-xl border px-4 py-5"
                style={{
                  backgroundColor: "var(--sm-content)",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                }}
              >
                <div className="h-40 flex items-end gap-1.5">
                  <div className="flex-1 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t" style={{ height: '45%' }}></div>
                  <div className="flex-1 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t" style={{ height: '70%' }}></div>
                  <div className="flex-1 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t" style={{ height: '55%' }}></div>
                  <div className="flex-1 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t" style={{ height: '85%' }}></div>
                  <div className="flex-1 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t" style={{ height: '50%' }}></div>
                  <div className="flex-1 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t" style={{ height: '90%' }}></div>
                  <div className="flex-1 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t" style={{ height: '65%' }}></div>
                </div>
              </div>
            </div>
          )}

          {/* Revenue Card */}
          {cards.includes("revenue") && (
            <div 
              className="absolute top-8 right-12 rounded-2xl border px-4 py-4 backdrop-blur-md"
              style={{
                backgroundColor: "rgba(50, 45, 70, 0.7)",
                borderColor: "rgba(100, 90, 140, 0.3)",
                width: "200px",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CurrencyCircleDollar size={16} weight="regular" color="white" />
                  <span className="text-xs font-medium text-slate-300">Revenue</span>
                </div>
                <button className="text-slate-500 hover:text-slate-300">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>
              <div 
                className="rounded-xl border px-4 py-5"
                style={{
                  backgroundColor: "var(--sm-content)",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                }}
              >
                <div className="text-2xl font-bold text-white mb-3">$964.2K</div>
                <div className="flex items-center gap-1">
                  <div 
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: "rgba(89, 200, 139, 0.12)",
                      color: "#59C88B",
                    }}
                  >
                    +6%
                  </div>
                  <span className="text-xs text-slate-400">than last week</span>
                </div>
              </div>
            </div>
          )}

          {/* Total Revenue Card - Bottom Left */}
          {cards.includes("totalRevenue") && (
            <div 
              className="absolute bottom-20 left-24 rounded-2xl border px-4 py-4 backdrop-blur-md"
              style={{
                backgroundColor: "rgba(50, 45, 70, 0.7)",
                borderColor: "rgba(100, 90, 140, 0.3)",
                width: "271px",
                height: "114px",
              }}
            >
              <div 
                className="rounded-xl border px-4 py-4 flex items-center justify-center"
                style={{
                  backgroundColor: "var(--sm-content)",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  width: "239px",
                  height: "82px",
                }}
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CurrencyCircleDollar size={16} weight="regular" color="white" />
                    <span className="text-xs font-medium text-slate-300">Total Revenue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-white">$314,324.00</span>
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                      style={{
                        backgroundColor: "rgba(89, 200, 139, 0.12)",
                        color: "#59C88B",
                      }}
                    >
                      +5%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Total Revenue Card - Bottom Right */}
          {cards.includes("totalRevenueRight") && (
            <div 
              className="absolute bottom-24 right-16 rounded-2xl border px-4 py-4 backdrop-blur-md"
              style={{
                backgroundColor: "rgba(50, 45, 70, 0.7)",
                borderColor: "rgba(100, 90, 140, 0.3)",
                width: "260px",
              }}
            >
              <div 
                className="rounded-xl border px-4 py-4"
                style={{
                  backgroundColor: "var(--sm-content)",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <CurrencyCircleDollar size={16} weight="regular" color="white" />
                  <span className="text-xs font-medium text-slate-300">Total Revenue</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-white">$314,324.00</span>
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: "rgba(89, 200, 139, 0.12)",
                      color: "#59C88B",
                    }}
                  >
                    +5%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Total Growth Card */}
          {cards.includes("totalGrowth") && (
            <div 
              className="absolute top-24 left-8 rounded-2xl border px-4 py-4 backdrop-blur-md"
              style={{
                backgroundColor: "rgba(50, 45, 70, 0.7)",
                borderColor: "rgba(100, 90, 140, 0.3)",
                width: "236px",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ChartLineUp size={16} weight="regular" color="white" />
                  <span className="text-xs font-medium text-slate-300">Total Growth</span>
                </div>
                <button className="text-slate-500 hover:text-slate-300">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>
              <div 
                className="rounded-xl border px-4 py-3"
                style={{
                  backgroundColor: "#353D51",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                }}
              >
                <div className="text-2xl font-bold text-white mb-2">$314,324.00</div>
                <div className="flex items-center gap-1">
                  <div 
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: "rgba(89, 200, 139, 0.12)",
                      color: "#59C88B",
                    }}
                  >
                    +5%
                  </div>
                  <span className="text-xs text-slate-400">than last week</span>
                </div>
              </div>
            </div>
          )}

          {/* Total Profit Card */}
          {cards.includes("totalProfit") && (
            <div 
              className="absolute top-1/2 right-12 -translate-y-1/2 rounded-2xl border px-4 py-4 backdrop-blur-md"
              style={{
                backgroundColor: "rgba(50, 45, 70, 0.7)",
                borderColor: "rgba(100, 90, 140, 0.3)",
                width: "208px",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ChartLineUp size={16} weight="regular" color="white" />
                  <span className="text-xs font-medium text-slate-300">Total Profit</span>
                </div>
                <button className="text-slate-500 hover:text-slate-300">
                  <svg className="h-6 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>
              <div 
                className="rounded-xl border px-4 py-4"
                style={{
                  backgroundColor: "#353D51",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                }}
              >
                <div className="text-2xl font-bold text-white mb-4">$314,324.00</div>
                <div className="h-28 flex items-end">
                  <svg className="w-full h-full" viewBox="0 0 120 60" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="profitGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: '#59C88B', stopOpacity: 0.4 }} />
                        <stop offset="100%" style={{ stopColor: '#59C88B', stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <path 
                      d="M 0 45 L 20 40 L 40 35 L 60 30 L 80 25 L 100 22 L 120 20" 
                      fill="none" 
                      stroke="#59C88B" 
                      strokeWidth="2.5"
                    />
                    <path 
                      d="M 0 45 L 20 40 L 40 35 L 60 30 L 80 25 L 100 22 L 120 20 L 120 60 L 0 60 Z" 
                      fill="url(#profitGradient)"
                    />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Total Profit Card - Left Side */}
          {cards.includes("totalProfitLeft") && (
            <div 
              className="absolute top-1/2 left-8 -translate-y-1/2 rounded-2xl border px-4 py-4 backdrop-blur-md"
              style={{
                backgroundColor: "rgba(50, 45, 70, 0.7)",
                borderColor: "rgba(100, 90, 140, 0.3)",
                width: "208px",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ChartLineUp size={16} weight="regular" color="white" />
                  <span className="text-xs font-medium text-slate-300">Total Profit</span>
                </div>
                <button className="text-slate-500 hover:text-slate-300">
                  <svg className="h-6 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>
              <div 
                className="rounded-xl border px-4 py-4"
                style={{
                  backgroundColor: "#353D51",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                }}
              >
                <div className="text-2xl font-bold text-white mb-4">$314,324.00</div>
                <div className="h-28 flex items-end">
                  <svg className="w-full h-full" viewBox="0 0 120 60" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="profitGradientLeft" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: '#59C88B', stopOpacity: 0.4 }} />
                        <stop offset="100%" style={{ stopColor: '#59C88B', stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <path 
                      d="M 0 45 L 20 40 L 40 35 L 60 30 L 80 25 L 100 22 L 120 20" 
                      fill="none" 
                      stroke="#59C88B" 
                      strokeWidth="2.5"
                    />
                    <path 
                      d="M 0 45 L 20 40 L 40 35 L 60 30 L 80 25 L 100 22 L 120 20 L 120 60 L 0 60 Z" 
                      fill="url(#profitGradientLeft)"
                    />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
