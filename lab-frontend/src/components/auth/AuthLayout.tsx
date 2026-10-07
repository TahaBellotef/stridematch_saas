"use client";

import Image from "next/image";
import Link from "next/link";

interface AuthLayoutProps {
  children: React.ReactNode;
  footerText?: string;
  showFooter?: boolean;
}

export default function AuthLayout({ children, footerText = "By signing in, you agree to Stridematch", showFooter = true }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--sm-bg-dark)' }}>
      {/* Left side - Background image */}
      <div className="hidden lg:flex lg:w-[60%] relative">
        {/* Logo */}
        <div className="absolute top-8 left-8 z-10">
          <Link href="/">
            <Image
              src="/logo.svg"
              alt="StrideMatch"
              width={160}
              height={40}
              priority
            />
          </Link>
        </div>
        
        {/* Background image */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom right, rgba(75, 33, 239, 0.2), transparent)' }} />
        <div 
          className="w-full h-full bg-cover bg-center"
          style={{
            backgroundImage: "url('/loginBackground.jpg')",
            filter: "brightness(0.7)",
          }}
        />
      </div>

      {/* Right side - Form content */}
      <div className="w-full lg:w-[40%] flex flex-col items-center justify-center p-8 relative" style={{ backgroundColor: '#28243D' }}>
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Link href="/">
              <Image
                src="/logo.svg"
                alt="StrideMatch"
                width={160}
                height={40}
                priority
              />
            </Link>
          </div>

          {children}
        </div>

        {/* Footer */}
        {showFooter && (
          <div className="absolute bottom-6 left-0 right-0 text-center">
            <p className="text-slate-500 text-xs mb-1">
              {footerText}
            </p>
            <div className="flex items-center justify-center gap-2 text-xs">
              <Link href="/terms" className="text-slate-400 hover:text-violet-400 transition-colors underline">
                Terms of Use
              </Link>
              <span className="text-slate-600">and</span>
              <Link href="/privacy" className="text-slate-400 hover:text-violet-400 transition-colors underline">
                Privacy Policy
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
