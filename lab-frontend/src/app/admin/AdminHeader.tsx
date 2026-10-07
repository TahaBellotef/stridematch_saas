"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CaretLeft,
  List,
  MagnifyingGlass,
  SignOut,
  CubeFocus as CubeFocusIcon,
  User,
} from "@phosphor-icons/react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/shared/auth";
import { NewScanModal } from "./dashboard/NewScanModal";

type AdminHeaderProps = {
  onLogout?: () => Promise<void>;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
};

export function AdminHeader({ onLogout, onToggleSidebar, isSidebarOpen }: AdminHeaderProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [showNewScanModal, setShowNewScanModal] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const iconButtonGradientStyle = {
    background: "linear-gradient(180deg, #4B4474 0%, #3C3854 100%)",
    border: "1px solid rgba(0, 0, 0, 0.5)",
  };

  // Get user display name
  const userName = user?.first_name && user?.last_name 
    ? `${user.first_name} ${user.last_name}`.trim()
    : user?.first_name || user?.email || "Admin User";
  const userEmail = user?.email || "admin@stridematch.com";
  const userInitials = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "AD";

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (avatarRef.current && !avatarRef.current.contains(target)) {
        setAvatarOpen(false);
      }
    };

    // Add small delay to let click event complete
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  const handleProfile = () => {
    setAvatarOpen(false);
    router.push("/admin/settings/account");
  };

  const handleLogout = async () => {
    try {
      setAvatarOpen(false);
      if (onLogout) {
        await onLogout();
        router.push("/auth/login");
      }
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };
  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/10" style={{ backgroundColor: "var(--sm-fill)" }}>
      <div className="w-full px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard/overview" className="flex items-center gap-2 -ml-2">
              <Image
                src="/logo.svg"
                alt="StrideMatch"
                width={120}
                height={40}
                priority
                style={{ width: "auto", height: "auto" }}
              />
            </Link>
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                aria-label="Toggle sidebar"
                className="p-2 rounded hover:bg-white/10 text-slate-200"
              >
                {isSidebarOpen ? (
                  <CaretLeft size={18} weight="light" />
                ) : (
                  <List size={18} weight="light" />
                )}
              </button>
            )}
          </div>

          {/* Center search */}
          <div className="flex-1 max-w-xl">
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search"
                className="w-full rounded-full bg-white/5 pl-9 pr-20 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center">
                  <span className="text-[10px]">⌘K</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowNewScanModal(true)}
              className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium transition"
            >
              <span className="flex items-center gap-2">
                <CubeFocusIcon size={18} />
                <span>New Scan</span>
              </span>
            </button>

            {/* Avatar Dropdown Menu */}
            <div ref={avatarRef} className="relative z-50">
              <button
                type="button"
                onClick={() => setAvatarOpen(!avatarOpen)}
                className="w-9 h-9 rounded-full text-slate-100 flex items-center justify-center transition hover:brightness-110"
                style={iconButtonGradientStyle}
              >
                <User size={16} weight="light" />
              </button>
              {avatarOpen && (
                <div 
                  className="absolute right-0 mt-3 w-[360px] max-w-[calc(100vw-1rem)] rounded-[22px] p-4 shadow-2xl z-50"
                  style={{
                    background: "linear-gradient(180deg, #343054 0%, #2D2A48 100%)",
                    border: "1px solid rgba(89, 84, 128, 0.8)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-3 pb-3 border-b border-black/35">
                    <div className="relative w-10 h-10 rounded-full border border-black/50 bg-[#2F2B4A] flex items-center justify-center shrink-0">
                      <span className="text-[16px] font-normal text-[#E7E5F7]">{userInitials}</span>
                      <span className="absolute right-0.5 bottom-0.5 w-2 h-2 rounded-full bg-[#58F3A3]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] text-[#ECEBFB] truncate">{userName}</p>
                      <p className="mt-0.5 text-[12px] text-[#AAA7C5]">Admin</p>
                    </div>
                  </div>

                  <div className="py-3 border-b border-black/35 space-y-1">
                    <button
                      type="button"
                      onClick={handleProfile}
                      className="w-full px-2.5 py-2 text-left text-[14px] text-[#D4D2E6] hover:bg-white/5 rounded-lg flex items-center gap-3"
                    >
                      <User size={18} weight="light" />
                      Profile
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleLogout();
                    }}
                    className="w-full px-2.5 py-2 text-left text-[14px] text-[#D4D2E6] hover:bg-white/5 rounded-lg flex items-center gap-3"
                  >
                    <SignOut size={18} weight="light" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showNewScanModal && (
        <NewScanModal onClose={() => setShowNewScanModal(false)} />
      )}
    </header>
  );
}
