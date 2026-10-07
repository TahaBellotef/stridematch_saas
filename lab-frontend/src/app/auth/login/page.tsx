"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/shared/auth";
import { AuthInput, AuthSideCards } from "@/components/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Reaching this page - by the browser's Back/Forward arrows, a direct
  // URL, a session-expiry redirect, anything - must always end any
  // existing session, exactly like clicking Logout would. Otherwise a
  // leftover token could let the app silently keep acting as logged in
  // even while the login form is showing.
  useEffect(() => {
    void logout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!email || !password) {
      setError("Please enter your email and password");
      setIsLoading(false);
      return;
    }

    try {
      const success = await login(email, password);
      if (success) {
        router.push("/admin/dashboard/overview");
      }
    } catch (err: any) {
      const message = err?.message || "Login failed. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#1F1B2E" }}>
      {/* Left Side - Background with Cards */}
      <AuthSideCards 
        backgroundImage="/images/Auth/loginContainer.png"
        cards={["totalGrowth", "totalProfit", "totalRevenue"]}
      />

      {/* Right Side - Login Form */}
      <div className="w-full flex items-center justify-center px-16 py-12" style={{ width: '42%', backgroundColor: 'var(--sm-content)' }}>
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Image 
              src="/images/Auth/LogoBlancBleu.png" 
              alt="StrideMatch Logo" 
              width={180} 
              height={45}
              className="h-10 w-auto"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3 text-center">
            Welcome to Stridematch
          </h1>
          <p className="text-sm text-slate-400 mb-8 text-center">
            Make your app management easy and fun!
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <AuthInput
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Type your email"
              icon="envelope"
              autoComplete="email"
            />

            <AuthInput
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Type your password"
              icon="password"
              autoComplete="current-password"
              showPasswordToggle
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
            />

            <div className="text-left">
              <Link
                href={
                  email
                    ? `/auth/forgot-password?email=${encodeURIComponent(email)}`
                    : "/auth/forgot-password"
                }
                className="text-sm text-white hover:opacity-80 transition-colors"
              >
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white font-semibold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: 'linear-gradient(to right, #4B21EF, #6F4CF5)' }}
            >
              {isLoading ? "Logging in..." : "Login"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-500">
            By signing in, you agree to Stridematch{" "} <br />
            <Link href="/terms" className="underline hover:text-slate-400 transition-colors">Terms of Use</Link>
            {" "}and{" "}
            <Link href="/privacy" className="underline hover:text-slate-400 transition-colors">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
