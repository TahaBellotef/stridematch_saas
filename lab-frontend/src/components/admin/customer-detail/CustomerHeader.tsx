"use client";

import { CustomerDetailData } from "./types";

interface CustomerHeaderProps {
  customer: CustomerDetailData;
}

export function CustomerHeader({ customer }: CustomerHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold text-white mb-6">Customer Details</h1>
      <div className="flex items-center gap-5">
        <div
          style={{
            background: "linear-gradient(180deg, #5C5682 0%, #423E63 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          className="w-24 h-24 rounded-xl flex items-center justify-center flex-shrink-0"
        >
          <span className="text-3xl font-bold text-white">{customer.initials}</span>
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-white mb-1 leading-tight">{customer.name}</h2>
          <p className="text-sm text-slate-400">{customer.email}</p>
        </div>
      </div>
    </div>
  );
}
