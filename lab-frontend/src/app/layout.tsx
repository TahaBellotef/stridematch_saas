import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "SMLab • Next-Gen Biomechanics",
  description: "Next.js frontend for the StrideMatch biomechanics workflow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body className="app-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}