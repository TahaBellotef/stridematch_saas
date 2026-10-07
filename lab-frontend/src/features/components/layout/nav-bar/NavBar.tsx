"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { clearAdminToken, getAdminToken } from "@/shared/auth/token-store";
import { useAuth } from "@/shared/auth";
import { LabStep } from "@/features/lab/domain/labStep.enum";

// ================= Icons =================
const SearchIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const HelpIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

// ================= Types =================
type NavBarProps = {
  activeStep?: LabStep;
  enabledSteps?: LabStep[];
  isLocked?: boolean;
  onTabClick?: (step: LabStep) => void;
  showTabs?: boolean;
  showSearch?: boolean;
};

type Language = "en" | "fr";

const languages: { code: Language; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
];

const LAB_TABS = [
  { id: LabStep.MethodSelection, label: "Profile" },
  { id: LabStep.MethodDetail, label: "Video Upload" },
  { id: LabStep.Result, label: "Result" },
];

export function NavBar({
  activeStep,
  enabledSteps,
  isLocked = false,
  onTabClick,
  showTabs = true,
  showSearch = true,
}: NavBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const langRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const resolvedStep =
    activeStep === LabStep.Processing ? LabStep.Video : activeStep;
  const enabledSet = enabledSteps ? new Set(enabledSteps) : null;

  // Get token on mount
  useEffect(() => {
    setToken(getAdminToken());
  }, [pathname]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setShowLangDropdown(false);
      }
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    setShowLangDropdown(false);
    // Add i18n logic here if needed
  };

  const handleLogout = () => {
    clearAdminToken();
    logout();
    setToken(null);
    router.push("/auth/login");
  };

  const handleLoginClick = () => {
    router.push("/auth/login");
  };

  const currentLang = languages.find((l) => l.code === language);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-2">
        {/* ================= Brand ================= */}
        <Link
          href="/"
          aria-label="StrideMatch Home"
          className="flex shrink-0 items-center gap-2"
        >
          <Image
            src="/logo.svg"
            alt="StrideMatch"
            width={110}
            height={28}
            priority
          />
        </Link>

        {/* ================= Search Bar ================= */}
        {showSearch && (
          <form onSubmit={handleSearch} className="hidden flex-1 max-w-xs lg:flex">
            <div className="relative w-full">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <SearchIcon />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions..."
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 transition focus:border-slate-300 focus:bg-white focus:outline-none"
              />
            </div>
          </form>
        )}

        {/* ================= Tabs ================= */}
        {showTabs && (
          <nav
            aria-label="Lab steps"
            className="flex flex-wrap items-center gap-2 text-xs font-medium sm:text-sm"
          >
            {LAB_TABS.map((tab) => {
              const isActive = resolvedStep === tab.id;
              const isEnabled = enabledSet ? enabledSet.has(tab.id) : true;
              const isInteractive = Boolean(onTabClick) && isEnabled && !isLocked;

              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  disabled={!isInteractive}
                  onClick={() => onTabClick?.(tab.id)}
                  className={[
                    "rounded-full border px-3 py-1 transition",
                    isActive
                      ? "border-slate-900 bg-slate-50 text-slate-900"
                      : isInteractive
                      ? "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-900"
                      : "cursor-not-allowed border-transparent text-slate-300",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        )}

        {/* ================= Right actions ================= */}
        <div className="flex items-center gap-2">
          {/* Version label */}
          <span className="hidden text-xs font-medium text-slate-400 tracking-wide sm:inline">
            SmartMotion v3.0
          </span>

          {/* Language Selector */}
          <div ref={langRef} className="relative">
            <button
              type="button"
              onClick={() => setShowLangDropdown(!showLangDropdown)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              <GlobeIcon />
              <span className="hidden sm:inline">{currentLang?.flag}</span>
              <span className="hidden sm:inline text-sm font-medium">{currentLang?.label}</span>
              <ChevronDownIcon />
            </button>

            {showLangDropdown && (
              <div className="absolute right-0 mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
                      language === lang.code
                        ? "bg-slate-50 font-medium text-slate-900"
                        : "text-slate-600"
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                    {language === lang.code && (
                      <svg className="ml-auto h-4 w-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User Menu */}
          {isAuthenticated && user ? (
            <div ref={userRef} className="relative">
              <button
                type="button"
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-2 rounded-full px-2 py-1 text-sm transition hover:bg-slate-100"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                  {user.first_name?.charAt(0) || user.email?.charAt(0) || "U"}
                </div>
                <span className="hidden max-w-[100px] truncate text-sm font-medium text-slate-700 sm:inline">
                  {user.first_name || user.email}
                </span>
                <ChevronDownIcon />
              </button>

              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  {/* User Info Header */}
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>

                  {/* Menu Items */}
                  <div className="py-1">
                    <Link
                      href="/account/settings"
                      onClick={() => setShowUserDropdown(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                      <SettingsIcon />
                      <span>Account Settings</span>
                    </Link>
                    <Link
                      href="/faq"
                      onClick={() => setShowUserDropdown(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                      <HelpIcon />
                      <span>FAQ</span>
                    </Link>
                  </div>

                  {/* Logout */}
                  <div className="border-t border-slate-100 py-1">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50"
                    >
                      <LogoutIcon />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLoginClick}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
