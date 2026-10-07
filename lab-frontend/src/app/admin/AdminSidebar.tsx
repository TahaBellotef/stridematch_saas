"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowBendDownRight,
  CaretDown,
  ChartBar,
  FileText,
  GearSix,
  House,
  Lifebuoy,
  ProjectorScreenChart,
  Question,
  ShoppingBagOpen,
  SquaresFour,
  UsersFour,
  UsersThree,
} from "@phosphor-icons/react";
import { usePathname } from "next/navigation";

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  matchPaths?: string[];
  submenu?: MenuItem[];
  disableLink?: boolean;
}

const mainMenu: MenuItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <House size={20} weight="light" />,
    href: "/admin/dashboard/overview",
  },
  {
    id: "customers",
    label: "Customers",
    icon: <UsersFour size={20} weight="light" />,
    href: "/admin/customers",
    disableLink: true,
    submenu: [
      { id: "list", label: "List", icon: null, href: "/admin/customers" },
    ],
  },
  {
    id: "analysis",
    label: "Analysis",
    icon: <ProjectorScreenChart size={20} weight="light" />,
    href: "/admin/analysis",
    disableLink: true,
    submenu: [
      { id: "results", label: "Start Analysis", icon: null, href: "/admin/analysis" },
      { id: "reports", label: "Reports", icon: null, href: "/admin/analysis/reports" },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    icon: <ShoppingBagOpen size={20} weight="light" />,
    href: "/admin/Commerce",
    disableLink: true,
    submenu: [
      { id: "inventory", label: "Inventory", icon: null, href: "/admin/commerce/inventory" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    icon: <ChartBar size={20} weight="light" />,
    href: "/admin/insights",
  },
  {
    id: "members",
    label: "Members",
    icon: <UsersThree size={20} weight="light" />,
    href: "/admin/members",
    submenu: [
      { id: "all-members", label: "All Members", icon: null, href: "/admin/members" },
      { id: "teams", label: "Teams", icon: null, href: "/admin/members/teams" },
      { id: "roles", label: "Roles", icon: null, href: "/admin/members/roles" },
    ],
  },
];

const otherMenu: MenuItem[] = [
  {
    id: "integrations",
    label: "Integrations",
    icon: <SquaresFour size={20} weight="light" />,
    href: "/admin/integrations",
  },
  {
    id: "settings",
    label: "Settings",
    icon: <GearSix size={20} weight="light" />,
    href: "/admin/settings",
    submenu: [
      { id: "alerts", label: "Alerts", icon: null, href: "/admin/settings/alerts" },
      { id: "pricing", label: "Pricing", icon: null, href: "/admin/settings/pricing" },
      { id: "preferences", label: "Preferences", icon: null, href: "/admin/settings/preferences" },
      { id: "role-permission", label: "Role & Permission", icon: null, href: "/admin/settings/roleAndPermission" },
      {
        id: "account",
        label: "Account",
        icon: null,
        href: "/admin/settings/account",
        matchPaths: [
          "/admin/settings/account",
          "/admin/settings/security",
          "/admin/settings/info",
          "/admin/settings/billing",
          "/admin/settings/notifications-settings",
          "/admin/settings/scan-setup",
        ],
      },
    ],
  },
  {
    id: "help",
    label: "Help",
    icon: <Question size={20} weight="light" />,
    href: "/admin/help",
    submenu: [
      { id: "docs", label: "Documentation", icon: <FileText size={16} weight="light" />, href: "/admin/help/docs" },
      { id: "support", label: "Support", icon: <Lifebuoy size={16} weight="light" />, href: "/admin/help/support" },
      { id: "status", label: "Status", icon: <ChartBar size={16} weight="light" />, href: "/admin/help/status" },
    ],
  },
];

interface MenuItemProps {
  item: MenuItem;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  hasActiveChild: boolean;
  pathname: string;
}

function matchesPath(item: MenuItem, pathname: string): boolean {
  const routesToMatch = item.matchPaths?.length ? item.matchPaths : [item.href];
  const isDirectMatch = routesToMatch.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isDirectMatch) {
    return true;
  }
  if (item.submenu) {
    return item.submenu.some((subitem) => matchesPath(subitem, pathname));
  }
  return false;
}

function hasActiveChildInSubmenu(item: MenuItem, pathname: string): boolean {
  if (!item.submenu) {
    return false;
  }
  return item.submenu.some((subitem) => matchesPath(subitem, pathname));
}

// Sibling hrefs can be prefixes of one another (e.g. "/admin/analysis" vs
// "/admin/analysis/reports"), so matchesPath() alone can mark multiple
// siblings active at once. Pick the single longest-href match instead, so
// only the most specific item lights up.
function getBestSubmenuMatch(submenu: MenuItem[], pathname: string): MenuItem | null {
  let best: MenuItem | null = null;
  for (const subitem of submenu) {
    if (matchesPath(subitem, pathname) && (!best || subitem.href.length > best.href.length)) {
      best = subitem;
    }
    if (subitem.submenu) {
      const nestedBest = getBestSubmenuMatch(subitem.submenu, pathname);
      if (nestedBest && (!best || nestedBest.href.length > best.href.length)) {
        best = nestedBest;
      }
    }
  }
  return best;
}

function SidebarMenuItem({ item, isActive, isExpanded, onToggle, hasActiveChild, pathname }: MenuItemProps) {
  const isParentOfActiveChild = hasActiveChild && !isActive;
  const [expandedNestedSubmenu, setExpandedNestedSubmenu] = useState<string | null>(null);

  useEffect(() => {
    if (!item.submenu) {
      return;
    }
    const activeNested = item.submenu.find(
      (subitem) => Boolean(subitem.submenu) && hasActiveChildInSubmenu(subitem, pathname)
    );
    if (activeNested) {
      setExpandedNestedSubmenu(activeNested.id);
    }
  }, [item.submenu, pathname]);
  
  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
          isActive && !hasActiveChild
            ? "text-white"
            : isParentOfActiveChild
            ? "text-[#6F4CF5]"
            : "text-slate-200 hover:bg-white/3"
        }`}
        style={
          isActive && !hasActiveChild
            ? {
                background: "linear-gradient(90deg, #3C3854 0%, #4B4474 100%)",
                borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                borderRight: "1px solid rgba(255, 255, 255, 0.05)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                borderLeft: "4px solid #6F4CF5",
              }
            : {}
        }
      >
        {item.disableLink ? (
          <span className="flex items-center gap-3 flex-1 cursor-pointer">
            <span style={{ color: isParentOfActiveChild ? "#6F4CF5" : undefined }} className={isParentOfActiveChild ? "" : "text-slate-200/90"}>{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </span>
        ) : (
          <Link href={item.href} className="flex items-center gap-3 flex-1">
            <span style={{ color: isParentOfActiveChild ? "#6F4CF5" : undefined }} className={isParentOfActiveChild ? "" : "text-slate-200/90"}>{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </Link>
        )}
        {item.submenu && item.submenu.length > 0 && (
          <CaretDown
            size={16}
            weight="light"
            className={`text-slate-300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {/* Submenu */}
      {item.submenu && isExpanded && (
        <div className="mt-1 space-y-1">
          {(() => {
            const bestSubmenuMatch = getBestSubmenuMatch(item.submenu, pathname);
            return item.submenu.map((subitem) => {
            const isSubmenuActive = bestSubmenuMatch?.id === subitem.id;
            const subitemHasActiveChild = hasActiveChildInSubmenu(subitem, pathname);
            const isSubitemParentActive = subitemHasActiveChild && !isSubmenuActive;

            if (subitem.submenu && subitem.submenu.length > 0) {
              return (
                <div key={subitem.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedNestedSubmenu((prev) => (prev === subitem.id ? null : subitem.id))
                    }
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2 pl-10 text-sm transition-colors rounded-lg ${
                      isSubmenuActive && !subitemHasActiveChild
                        ? "text-white"
                        : isSubitemParentActive
                        ? "text-[#6F4CF5]"
                        : "text-slate-300 hover:text-white hover:bg-white/3"
                    }`}
                    style={
                      isSubmenuActive && !subitemHasActiveChild
                        ? {
                            background: "linear-gradient(90deg, #3C3854 0%, #4B4474 100%)",
                            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                            borderRight: "1px solid rgba(255, 255, 255, 0.05)",
                            borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                            borderLeft: "4px solid #6F4CF5",
                          }
                        : {}
                    }
                  >
                    <span className="flex items-center gap-3">
                      <ArrowBendDownRight size={20} weight="light" />
                      <span>{subitem.label}</span>
                    </span>
                    <CaretDown
                      size={14}
                      weight="light"
                      className={`transition-transform ${expandedNestedSubmenu === subitem.id ? "rotate-180" : ""}`}
                    />
                  </button>

                  {expandedNestedSubmenu === subitem.id && (
                    <div className="mt-1 space-y-1">
                      {subitem.submenu.map((nestedItem) => {
                        const isNestedActive = matchesPath(nestedItem, pathname);
                        return (
                          <Link
                            key={nestedItem.id}
                            href={nestedItem.href}
                            className={`flex items-center gap-2 px-4 py-2 pl-14 text-xs transition-colors rounded-lg ${
                              isNestedActive
                                ? "text-white"
                                : "text-slate-300 hover:text-white hover:bg-white/3"
                            }`}
                            style={
                              isNestedActive
                                ? {
                                    background: "linear-gradient(90deg, #3C3854 0%, #4B4474 100%)",
                                    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                                    borderRight: "1px solid rgba(255, 255, 255, 0.05)",
                                    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                                    borderLeft: "4px solid #6F4CF5",
                                  }
                                : {}
                            }
                          >
                            <ArrowBendDownRight size={16} weight="light" />
                            <span>{nestedItem.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={subitem.id}
                href={subitem.href}
                className={`flex items-center gap-3 px-4 py-2 pl-10 text-sm font-medium transition-colors rounded-lg ${
                  isSubmenuActive
                    ? "text-white"
                    : "text-slate-300 hover:text-white hover:bg-white/3"
                }`}
                style={
                  isSubmenuActive
                    ? {
                        background: "linear-gradient(90deg, #3C3854 0%, #4B4474 100%)",
                        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRight: "1px solid rgba(255, 255, 255, 0.05)",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                        borderLeft: "4px solid #6F4CF5",
                      }
                    : {}
                }
              >
                <ArrowBendDownRight size={20} weight="light" />
                <span>{subitem.label}</span>
              </Link>
            );
            });
          })()}
        </div>
      )}
    </div>
  );
}

interface AdminSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AdminSidebar({ isOpen, onToggle }: AdminSidebarProps) {
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const pathname = usePathname() || "/";

  // Auto-expand the menu group that matches the current pathname
  useEffect(() => {
    const allMenus = [...mainMenu, ...otherMenu];
    const match = allMenus.find((m) => matchesPath(m, pathname));
    setExpandedMenu(match ? match.id : null);
  }, [pathname]);

  const handleToggle = (menuId: string) => {
    setExpandedMenu((prev) => (prev === menuId ? null : menuId));
  };

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`fixed w-64 admin-sidebar overflow-y-auto transition-transform duration-300 ease-in-out z-40 top-16 left-0 h-[calc(100vh-64px)] ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="py-6 px-3 h-full flex flex-col">

          <nav className="space-y-4 px-2 flex-1">
            <div className="px-3 text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">Menu</div>
            <div className="space-y-2">
                {mainMenu.map((item) => {
                  const hasActiveChild = hasActiveChildInSubmenu(item, pathname);
                  // Only consider parent active if we're exactly on the parent page, not on a child page
                  const isActive = !hasActiveChild && matchesPath(item, pathname);

                  return (
                    <SidebarMenuItem
                      key={item.id}
                      item={item}
                      isActive={isActive}
                      isExpanded={expandedMenu === item.id}
                      onToggle={() => handleToggle(item.id)}
                      hasActiveChild={hasActiveChild}
                      pathname={pathname}
                    />
                  );
                })}
            </div>

            <div className="mt-6 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Others</div>
            <div className="space-y-2 mt-2">
              {otherMenu.map((item) => {
                const hasActiveChild = hasActiveChildInSubmenu(item, pathname);
                // Only consider parent active if we're exactly on the parent page, not on a child page
                const isActive = !hasActiveChild && matchesPath(item, pathname);

                return (
                  <SidebarMenuItem
                    key={item.id}
                    item={item}
                    isActive={isActive}
                    isExpanded={expandedMenu === item.id}
                    onToggle={() => handleToggle(item.id)}
                    hasActiveChild={hasActiveChild}
                    pathname={pathname}
                  />
                );
              })}
            </div>
          </nav>
          <div className="mt-auto px-4 pt-6">
            <div className="border-t border-white/5 pt-4 text-center text-xs text-slate-400">@2026 StrideMatch</div>
          </div>
        </div>
      </aside>
    </>
  );
}
