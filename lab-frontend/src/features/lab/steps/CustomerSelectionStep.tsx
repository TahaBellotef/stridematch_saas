"use client";

import { useState, useEffect } from "react";
import { X } from "@phosphor-icons/react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { fetchCustomers, type CustomerRow } from "@/features/lab/services/customer.service";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  company?: string;
  status: "Online" | "Offline";
  initials: string;
  // Runner profile data
  age: number;
  gender: "male" | "female" | "other";
  heightCm: number;
  weightKg: number;
  level: "beginner" | "intermediate" | "advanced";
  surface: "road" | "trail" | "mixed" | "treadmill";
  weeklyDistance: "lt_10" | "10_25" | "25_50" | "gt_50";
  pronation: "neutral" | "overpronation" | "underpronation" | "unknown";
  preference: "comfort" | "responsiveness" | "stability" | "versatility";
}

// Static fallback customers for testing when AWS is not available
const STATIC_FALLBACK_CUSTOMERS: Customer[] = [
  {
    id: "demo-001",
    name: "Alice Johnson",
    email: "alice.johnson@example.com",
    phone: "+1 (555) 123-4567",
    location: "San Francisco, CA",
    company: "Tech Corp",
    status: "Online",
    initials: "AJ",
    age: 28,
    gender: "female",
    heightCm: 170,
    weightKg: 65,
    level: "advanced",
    surface: "road",
    weeklyDistance: "gt_50",
    pronation: "neutral",
    preference: "responsiveness",
  },
  {
    id: "demo-002",
    name: "Bob Smith",
    email: "bob.smith@example.com",
    phone: "+1 (555) 234-5678",
    location: "New York, NY",
    company: "Fitness Lab",
    status: "Offline",
    initials: "BS",
    age: 35,
    gender: "male",
    heightCm: 185,
    weightKg: 82,
    level: "intermediate",
    surface: "mixed",
    weeklyDistance: "25_50",
    pronation: "overpronation",
    preference: "stability",
  },
  {
    id: "demo-003",
    name: "Carol Martinez",
    email: "carol.martinez@example.com",
    phone: "+1 (555) 345-6789",
    location: "Austin, TX",
    company: "Runner's Club",
    status: "Online",
    initials: "CM",
    age: 32,
    gender: "female",
    heightCm: 168,
    weightKg: 58,
    level: "beginner",
    surface: "trail",
    weeklyDistance: "10_25",
    pronation: "underpronation",
    preference: "comfort",
  },
  {
    id: "demo-004",
    name: "David Lee",
    email: "david.lee@example.com",
    phone: "+1 (555) 456-7890",
    location: "Seattle, WA",
    company: "Marathon Runners",
    status: "Online",
    initials: "DL",
    age: 41,
    gender: "male",
    heightCm: 180,
    weightKg: 75,
    level: "advanced",
    surface: "road",
    weeklyDistance: "gt_50",
    pronation: "neutral",
    preference: "responsiveness",
  },
];

// `RunnerProfile` fields (level/surface/weeklyDistance/pronation/preference)
// aren't collected anywhere else in this wizard, so every customer gets the
// same sane defaults here — keep any other entry point into the gait
// analysis flow (e.g. a "Start Analysis" shortcut elsewhere) going through
// this mapping too, or `createSession()` will 422 on the missing fields.
export function mapCustomerRowToLabCustomer(c: CustomerRow): Customer {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    status: c.status,
    initials: c.initials,
    age: Number.parseInt(c.age, 10) || 0,
    gender: c.sex === "male" || c.sex === "female" ? c.sex : "other",
    heightCm: Number.parseFloat(c.height) || 0,
    weightKg: Number.parseFloat(c.weight) || 0,
    level: "intermediate",
    surface: "road",
    weeklyDistance: "10_25",
    pronation: "unknown",
    preference: "comfort",
  };
}

type Props = {
  onSelectCustomer: (customer: Customer) => void;
  onClose?: () => void;
};

export function CustomerSelectionStep({ onSelectCustomer, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load customers from AWS Cognito via backend
    const loadCustomers = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log("[CustomerSelectionStep] Fetching customers from AWS Cognito...");
        const backendCustomers = await fetchCustomers();

        if (backendCustomers.length > 0) {
          console.log("[CustomerSelectionStep] ✅ Loaded", backendCustomers.length, "customers");
          setCustomers(backendCustomers.map(mapCustomerRowToLabCustomer));
        } else {
          console.warn("[CustomerSelectionStep] ⚠️ No customers found in AWS Cognito, using fallback demo customers");
          setCustomers(STATIC_FALLBACK_CUSTOMERS);
          setError("Using demo customers (AWS integration pending)");
        }
      } catch (error) {
        console.error("[CustomerSelectionStep] ❌ Error loading customers from AWS, using fallback:", error);
        setCustomers(STATIC_FALLBACK_CUSTOMERS);
        setError("Using demo customers (AWS unavailable)");
      } finally {
        setLoading(false);
      }
    };

    loadCustomers();
  }, []);

  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full flex flex-col" style={{ backgroundColor: "#2D2B47",  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)", }}>
      {/* Header */}
      <div style={{ height: "40px" }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "0 auto",
          width: "90%",
          maxWidth: "700px",
        }}
      >
        <h1 className="font-bold text-white" style={{ fontSize: "28px" }}>
          Select Customer
        </h1>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "999px",
              backgroundColor: "#2D2B47",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            <X size={18} color="#FFFFFF" />
          </button>
        )}
      </div>

      <div style={{ height: "24px" }} />

      {/* Card Container */}
      <div
        style={{
          maxWidth: "700px",
          margin: "0 auto",
          width: "90%",
          backgroundColor: "#2D2B47",
          borderRadius: "8px",
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "0px",
        }}
      >
        {/* Search Input */}
        <div>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              backgroundColor: "rgba(15, 23, 42, 0.4)",
              color: "#E2E8F0",
              fontSize: "14px",
            }}
          />
        </div>

        {/* Customer List - no inner scroll/maxHeight here, the page itself
            scrolls (via the admin layout's <main>), so a row is never cut
            off mid-height by a clipped inner box. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {error && (
            <div style={{ textAlign: "center", padding: "24px", color: "#94A3B8", borderRadius: "8px", backgroundColor: "rgba(100, 116, 139, 0.1)", border: "1px solid rgba(100, 116, 139, 0.2)", marginBottom: "12px" }}>
              <p style={{ marginBottom: "8px" }}>{error}</p>
              <p style={{ fontSize: "12px", color: "#64748B" }}>Continue with demo data to test the analysis</p>
            </div>
          )}
          {loading ? (
            <LoadingSpinner fullScreen={false} />
          ) : filteredCustomers.length > 0 ? (
            filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              onClick={() => onSelectCustomer(customer)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "16px",
                borderRadius: "12px",
                backgroundColor: "#1E1B38",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#2A2847";
                e.currentTarget.style.borderColor = "rgba(106, 71, 244, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#1E1B38";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.05)";
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "999px",
                  background: "linear-gradient(135deg, #6A47F4 0%, #8F6BFF 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#FFFFFF" }}>
                  {customer.initials}
                </span>
              </div>

              {/* Customer Info */}
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#FFFFFF" }}>
                    {customer.name}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: customer.status === "Online" ? "#22C55E" : "#94A3B8",
                      textTransform: "uppercase",
                    }}
                  >
                    {customer.status === "Online" ? "● Online" : "● Offline"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "#94A3B8" }}>
                  <span>{customer.email}</span>
                  <span>•</span>
                  <span>{customer.location}</span>
                </div>
              </div>

              {/* Arrow */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M9 6l6 6-6 6" stroke="#6A47F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            ))
          ) : (
            <div style={{ textAlign: "center", padding: "24px", color: "#94A3B8" }}>
              <p>No customers found</p>
            </div>
          )}
        </div>

        {!loading && filteredCustomers.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px", color: "#94A3B8" }}>
            <p>No customers match your search</p>
          </div>
        )}
      </div>

      <div style={{ height: "30px" }} />
    </div>
  );
}
