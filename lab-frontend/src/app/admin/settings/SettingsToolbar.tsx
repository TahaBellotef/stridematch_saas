"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Lock,
  Info,
  CurrencyCircleDollar,
  Bell,
  SneakerMove,
} from "@phosphor-icons/react";

interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

const tabs: TabItem[] = [
  {
    id: "account",
    label: "Account",
    icon: <User size={18} />,
    href: "/admin/settings/account",
  },
  {
    id: "security",
    label: "Security",
    icon: <Lock size={18} />,
    href: "/admin/settings/security",
  },
  {
    id: "info",
    label: "Info",
    icon: <Info size={18} />,
    href: "/admin/settings/info",
  },
  {
    id: "billing",
    label: "Billing",
    icon: <CurrencyCircleDollar size={18} />,
    href: "/admin/settings/billing",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: <Bell size={18} />,
    href: "/admin/settings/notifications-settings",
  },
  {
    id: "scanSetup",
    label: "Scan Setup",
    icon: <SneakerMove size={18} />,
    href: "/admin/settings/scan-setup",
  },
];

export default function SettingsToolbar() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-3 px-6 py-2 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap"
            style={
              isActive
                ? {
                    background: 'linear-gradient(90deg, #3C3854 0%, #4B4474 100%)',
                    border: '1.5px solid #1E1C2B',
                    color: '#E7E3FC',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.3)'
                  }
                : {
                    color: '#9CA3AF'
                  }
            }
          >
            {tab.icon}
            <span className="text-sm font-medium">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
