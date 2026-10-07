"use client";

import { AuthProvider } from "@/shared/auth";
import { PageTransition } from "./PageTransition";
import { NavigationTrap } from "./NavigationTrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NavigationTrap />
      <PageTransition>{children}</PageTransition>
    </AuthProvider>
  );
}
