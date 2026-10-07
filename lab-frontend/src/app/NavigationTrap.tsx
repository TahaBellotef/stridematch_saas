"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type NavigateEvent = Event & {
  navigationType: "push" | "replace" | "reload" | "traverse";
  preventDefault: () => void;
};

type NavigationApi = EventTarget & {
  addEventListener: (type: "navigate", listener: (event: NavigateEvent) => void) => void;
  removeEventListener: (type: "navigate", listener: (event: NavigateEvent) => void) => void;
};

// The browser's own Back/Forward buttons can't be disabled or hidden from
// JS - that's native browser chrome outside the page. What we can do is
// make them inert.
//
// Primary mechanism: the Navigation API (Chrome/Edge) fires a cancelable
// "navigate" event *before* a back/forward traversal happens, so we can
// preventDefault() it outright - no flicker, no race with Next's router.
//
// Fallback for browsers without it (Firefox/Safari): react to "popstate"
// after the fact and replace the route back to where the user actually
// was. This can't be cancelled, so it's best-effort and may flicker.
function NavigationTrapInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lockedHrefRef = useRef("");

  useEffect(() => {
    const query = searchParams.toString();
    lockedHrefRef.current = query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    const navigation = (window as unknown as { navigation?: NavigationApi }).navigation;

    if (navigation) {
      const handleNavigate = (event: NavigateEvent) => {
        if (event.navigationType === "traverse") {
          event.preventDefault();
        }
      };
      navigation.addEventListener("navigate", handleNavigate);
      return () => navigation.removeEventListener("navigate", handleNavigate);
    }

    const handlePopState = () => {
      router.replace(lockedHrefRef.current);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);

  return null;
}

export function NavigationTrap() {
  return (
    <Suspense fallback={null}>
      <NavigationTrapInner />
    </Suspense>
  );
}
