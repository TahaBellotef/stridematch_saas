"use client";

import { useState } from "react";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebar } from "./AdminSidebar";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ToastProvider } from "@/components/shared/Toast";
import { useAuth, AuthGuard } from "@/shared/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { logout, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <AuthGuard>
      <ToastProvider>
        <div className="admin-page h-screen overflow-hidden">
          <AdminHeader
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onLogout={logout}
            isSidebarOpen={sidebarOpen}
          />
          <div className="relative h-full pt-16">
            <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
            <main
              className={`${sidebarOpen ? "ml-64" : "ml-0"} transition-all duration-300 flex-1 overflow-y-auto h-[calc(100vh-64px)]`}
            >
              {children}
            </main>
          </div>
        </div>
      </ToastProvider>
    </AuthGuard>
  );
}
