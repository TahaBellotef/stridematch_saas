"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, Edit2, Trash2, ArrowUpDown } from "lucide-react";
import { UserCircle, UserCirclePlus, UserCircleGear, UserCircleDashed } from "@phosphor-icons/react";
import { NewCustomerModal } from "@/components/admin/new-customer/NewCustomerModal";
import { EditCustomerModal } from "@/components/admin/customers/EditCustomerModal";
import { DeleteCustomerModal } from "@/components/admin/customers/DeleteCustomerModal";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import {
  fetchCustomers,
  type CustomerRow,
} from "@/features/lab/services/customer.service";
import {
  getDashboardOverview,
  getDashboardCustomers,
  type DashboardOverviewResponse,
  type DashboardCustomersResponse,
} from "@/shared/api/dashboard";

function formatChangePct(changePct: number | null | undefined): string {
  if (changePct === null || changePct === undefined) return "—";
  const rounded = Math.round(changePct * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

type SortKey = "name" | "age" | "sex" | "shoeSize" | "height" | "weight";

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [editCustomer, setEditCustomer] = useState<CustomerRow | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<CustomerRow | null>(null);
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [customerMetrics, setCustomerMetrics] = useState<DashboardCustomersResponse | null>(null);
  const itemsPerPage = 8;

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const [data, overviewData, customerMetricsData] = await Promise.all([
        fetchCustomers(),
        getDashboardOverview().catch(() => null),
        getDashboardCustomers().catch(() => null),
      ]);
      setCustomers(data);
      setOverview(overviewData);
      setCustomerMetrics(customerMetricsData);
    } catch (error) {
      console.error("Error loading customers:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    const shouldOpen = searchParams.get("new") === "1";
    if (shouldOpen) {
      setShowNewCustomer(true);
      router.replace("/admin/customers", { scroll: false });
    }
  }, [searchParams, router]);

  const handleModalClose = async () => {
    setShowNewCustomer(false);
    await loadCustomers();
  };

  const sortedCustomers = useMemo(() => {
    const sorted = [...customers];
    const compare = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

    sorted.sort((a, b) => {
      const aVal = String(a[sortKey]);
      const bVal = String(b[sortKey]);
      const result = compare(aVal, bVal);
      return sortDir === "asc" ? result : -result;
    });

    return sorted;
  }, [customers, sortKey, sortDir]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return sortedCustomers;

    return sortedCustomers.filter((customer) => {
      const searchableValues = [
        customer.name,
        customer.email,
        customer.age,
        customer.sex,
        customer.shoeSize,
        customer.height,
        customer.weight,
        customer.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableValues.includes(normalizedSearch);
    });
  }, [sortedCustomers, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / itemsPerPage));
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIdx, startIdx + itemsPerPage);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setCurrentPage(1);
  };

  const newCustomersThisWeek = customerMetrics?.new_customers.value ?? 0;
  const totalUsersPreviousWeek = customers.length - newCustomersThisWeek;
  const totalUsersChangePct =
    totalUsersPreviousWeek > 0 ? (newCustomersThisWeek / totalUsersPreviousWeek) * 100 : null;

  const stats = [
    {
      label: "Total Users",
      value: String(customers.length),
      change: formatChangePct(totalUsersChangePct),
      icon: UserCircle,
      color: "#987DFF",
    },
    {
      label: "Scan by Number",
      value: overview ? overview.total_scans.display : "—",
      change: formatChangePct(overview?.total_scans.change_pct),
      icon: UserCirclePlus,
      color: "#71A5FF",
    },
    {
      label: "Returning Customers",
      value: customerMetrics ? customerMetrics.returning_customers.display : "—",
      change: formatChangePct(customerMetrics?.returning_customers.change_pct),
      icon: UserCircleGear,
      color: "#59C88B",
    },
    {
      label: "New Customers",
      value: customerMetrics ? customerMetrics.new_customers.display : "—",
      change: formatChangePct(customerMetrics?.new_customers.change_pct),
      icon: UserCircleDashed,
      color: "#FBBB00",
    },
  ];

  const sortableHeader = (label: string, key: SortKey, className = "") => (
    <th className={`px-4 sm:px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase ${className}`}>
      <button
        onClick={() => handleSort(key)}
        className="flex items-center gap-1 cursor-pointer select-none"
      >
        <span>{label}</span>
        <ArrowUpDown
          className={`w-3.5 h-3.5 ${sortKey === key ? "text-indigo-400" : "text-slate-400"}`}
        />
      </button>
    </th>
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Customers</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, idx) => {
          const IconComponent = stat.icon;
          return (
            <div
              key={idx}
              style={{ backgroundColor: "#28243D", border: "1px solid #1F1F1F" }}
              className="rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${stat.color}1A`, color: stat.color }}
                >
                  <IconComponent size={22} weight="regular" style={{ color: stat.color }} />
                </span>
                <p className="text-slate-300 text-sm font-medium">{stat.label}</p>
              </div>
              <div
                style={{ backgroundColor: "#312D4B", border: "1px solid #1F1F1F" }}
                className="rounded-lg p-4"
              >
                <h3 className="text-white text-2xl font-bold mb-2">{stat.value}</h3>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400">
                    {stat.change}
                  </span>
                  <span className="text-xs text-slate-400">than last week</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{ backgroundColor: "#28243D", border: "1px solid #1F1F1F" }}
      >
        <div
          className="p-6 border-b"
          style={{ borderColor: "#1F1F1F", backgroundColor: "#28243D" }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-white text-lg font-semibold">All Customers</h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ backgroundColor: "#262243", borderColor: "#2F2B4A" }}
                  className="w-full border rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowNewCustomer(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-full transition-colors font-medium shadow-md shadow-indigo-500/20"
                >
                  <Plus className="w-4 h-4" />
                  New Customer
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="rounded-xl border border-[#1F1F1F] bg-[#312D4B]">
              <LoadingSpinner fullScreen={false} />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#94A3B8" }}>
              <p>No matching customers found.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr
                  style={{ borderColor: "#1F1F1F", backgroundColor: "#312D4B" }}
                  className="border-b"
                >
                  <th className="px-4 sm:px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      style={{ backgroundColor: "#251F45", borderColor: "#3A335A" }}
                      className="w-4 h-4 rounded-sm border cursor-pointer appearance-none checked:bg-indigo-500 checked:border-indigo-500"
                    />
                  </th>
                  {sortableHeader("Customer", "name")}
                  {sortableHeader("Age", "age", "hidden md:table-cell")}
                  {sortableHeader("Sex", "sex", "hidden lg:table-cell")}
                  {sortableHeader("Shoe Size", "shoeSize", "hidden lg:table-cell")}
                  {sortableHeader("Height", "height", "hidden xl:table-cell")}
                  {sortableHeader("Weight", "weight", "hidden xl:table-cell")}
                  <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    style={{ backgroundColor: "#262243", borderBottom: "1px solid #1B1934" }}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <input
                        type="checkbox"
                        style={{ backgroundColor: "#251F45", borderColor: "#3A335A" }}
                        className="w-4 h-4 rounded-sm border cursor-pointer appearance-none checked:bg-indigo-500 checked:border-indigo-500"
                      />
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <Link href={`/admin/customers/${customer.id}`}>
                        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                          <div
                            style={{ backgroundColor: "#28243D", borderColor: "#1F1F1F" }}
                            className="w-10 h-10 rounded-full border flex items-center justify-center overflow-hidden"
                          >
                            <img
                              src={customer.avatarUrl}
                              alt={customer.name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{customer.name}</p>
                            <p className="text-xs text-slate-400">{customer.email}</p>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="hidden md:table-cell px-4 sm:px-6 py-4 text-sm text-slate-300">
                      {customer.age}
                    </td>
                    <td className="hidden lg:table-cell px-4 sm:px-6 py-4 text-sm text-slate-300 capitalize">
                      {customer.sex}
                    </td>
                    <td className="hidden lg:table-cell px-4 sm:px-6 py-4 text-sm text-slate-300">
                      {customer.shoeSize}
                    </td>
                    <td className="hidden xl:table-cell px-4 sm:px-6 py-4 text-sm text-slate-300">
                      {customer.height}
                    </td>
                    <td className="hidden xl:table-cell px-4 sm:px-6 py-4 text-sm text-slate-300">
                      {customer.weight}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditCustomer(customer)}
                          className="p-2 rounded-full border border-slate-600/70 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                          aria-label={`Edit ${customer.name}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteCustomer(customer)}
                          className="p-2 rounded-full border border-slate-600/70 text-slate-300 hover:bg-white/10 hover:text-red-400 transition-colors"
                          aria-label={`Delete ${customer.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div
          style={{ backgroundColor: "#312D4B", borderColor: "#1F1F1F" }}
          className="px-4 sm:px-6 py-4 border-t flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Rows per page:</span>
            <select
              style={{ backgroundColor: "#28243D", borderColor: "#1F1F1F" }}
              className="border rounded-full text-slate-200 text-sm px-3 py-1"
            >
              <option>8</option>
              <option>16</option>
              <option>32</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="w-7 h-7 rounded-full border border-slate-600/70 text-slate-300 hover:bg-white/10 disabled:opacity-50"
              >
                ←
              </button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const page = i + 1;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    style={
                      currentPage === page
                        ? { backgroundColor: "#6366F1" }
                        : { backgroundColor: "transparent" }
                    }
                    className={`w-7 h-7 rounded-full text-sm transition-colors ${
                      currentPage === page
                        ? "text-white"
                        : "text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="w-7 h-7 rounded-full border border-slate-600/70 text-slate-300 hover:bg-white/10 disabled:opacity-50"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>

      <NewCustomerModal open={showNewCustomer} onClose={handleModalClose} />
      <EditCustomerModal
        open={!!editCustomer}
        customer={editCustomer}
        onClose={() => setEditCustomer(null)}
        onSaved={loadCustomers}
      />
      <DeleteCustomerModal
        open={!!deleteCustomer}
        customer={deleteCustomer}
        onClose={() => setDeleteCustomer(null)}
        onDeleted={loadCustomers}
      />
    </div>
  );
}
