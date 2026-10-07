 "use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { CustomerHeader } from "@/components/admin/customer-detail/CustomerHeader";
import { BiomechanicalProfile } from "@/components/admin/customer-detail/BiomechanicalProfile";
import { RecommendedShoes } from "@/components/admin/customer-detail/RecommendedShoes";
import { LastScans } from "@/components/admin/customer-detail/LastScans";
import { CustomerDetailData } from "@/components/admin/customer-detail/types";
import {
  fetchCustomerById,
  formatShoeSize,
  getInitials,
} from "@/features/lab/services/customer.service";

function formatPronation(pronation?: string | null): string {
  if (!pronation) return "—";
  return pronation.charAt(0).toUpperCase() + pronation.slice(1);
}

function formatLastScanDate(lastScanAt?: string | null): string {
  if (!lastScanAt) return "Never";
  const date = new Date(lastScanAt);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function CustomerDetailPage() {
  const [customer, setCustomer] = useState<CustomerDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  const params = useParams<{ id: string }>();
  const customerId = useMemo(() => params?.id ?? "", [params]);

  useEffect(() => {
    let isMounted = true;

    const loadCustomer = async () => {
      setLoading(true);
      try {
        const profile = await fetchCustomerById(customerId);
        if (!profile) {
          if (isMounted) setCustomer(null);
          return;
        }

        const initials = getInitials(profile.name);
        const detail: CustomerDetailData = {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          avatar: initials,
          initials,
          biomechanical: {
            pronation: formatPronation(profile.pronation),
            size: formatShoeSize(profile.shoe_size, profile.shoe_size_unit),
            numberOfScans: String(profile.scan_count ?? 0),
            lastScanDate: formatLastScanDate(profile.last_scan_at),
          },
        };

        if (isMounted) setCustomer(detail);
      } catch (error) {
        console.error("Failed to load customer detail:", error);
        if (isMounted) setCustomer(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCustomer();
    return () => {
      isMounted = false;
    };
  }, [customerId]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-slate-300">Loading customer…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <p className="text-slate-300">Customer not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <CustomerHeader customer={customer} />
      <BiomechanicalProfile data={customer.biomechanical} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <RecommendedShoes customerId={customer.id} />
        <LastScans customerId={customer.id} />
      </div>
    </div>
  );
}
