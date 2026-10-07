"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  deleteCustomer,
  type CustomerRow,
} from "@/features/lab/services/customer.service";
import { useToast } from "@/components/shared/Toast";

interface DeleteCustomerModalProps {
  open: boolean;
  customer: CustomerRow | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteCustomerModal({
  open,
  customer,
  onClose,
  onDeleted,
}: DeleteCustomerModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  if (!open || !customer) return null;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteCustomer(customer.id);
      onDeleted();
      onClose();
      showToast("success", `${customer.name} was deleted.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete customer";
      setError(message);
      showToast("error", message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0A14]/70 backdrop-blur-sm px-4">
      <div
        className="w-full max-w-md rounded-2xl border border-[#1F1F1F] p-6 shadow-2xl"
        style={{ backgroundColor: "#28243D" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Delete Customer</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#3A335A] p-2 text-slate-300 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-slate-300">
          Are you sure you want to delete{" "}
          <span className="font-medium text-white">{customer.name}</span> (
          {customer.email})? This action cannot be undone.
        </p>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-full border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
