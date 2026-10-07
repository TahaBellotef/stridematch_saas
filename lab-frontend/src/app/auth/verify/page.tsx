"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { resetPassword } from "aws-amplify/auth";
import { AuthInput, AuthSideCards } from "@/components/auth";

const RESEND_COOLDOWN_SECONDS = 30;

function VerifyPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const email = searchParams.get("email") || "";

  // A code is sent as soon as this page is reached, so the resend cooldown
  // starts immediately and restarts every time the user requests a new code.
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (code.length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }

    // Cognito only validates the reset code together with the new password,
    // so the code is carried forward and confirmed on the next step.
    router.push(
      `/auth/change-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`
    );
  };

  const handleResendCode = async () => {
    if (cooldown > 0 || isLoading) return;

    setError("");
    setResent(false);
    setIsLoading(true);
    try {
      await resetPassword({ username: email });
      setResent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err?.message || "Failed to resend code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#1F1B2E" }}>
      {/* Left Side - Background with Cards */}
      <AuthSideCards 
        backgroundImage="/images/Auth/verifyContainer.png"
        cards={["totalProfitLeft", "revenue", "totalRevenueRight"]}
      />

      {/* Right Side - Verify Form */}
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
            Verify Your Identity
          </h1>
          <p className="text-sm text-slate-400 mb-8 text-center">
            We've sent an email with your code to:<br />
            <span className="text-white font-medium">{email}</span>
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-white mb-2">
                6-digit code
              </label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter the 6-digit code"
                maxLength={6}
                className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(0, 0, 0, 0.5)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={code.length !== 6}
              className="w-full text-white font-semibold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: 'linear-gradient(to right, #4B21EF, #6F4CF5)' }}
            >
              Continue
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              {resent ? "A new code was sent. " : "Didn't receive a code? "}
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading || cooldown > 0}
                className="font-medium hover:opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50"
                style={{ color: '#60E497' }}
              >
                {isLoading
                  ? "Sending..."
                  : cooldown > 0
                    ? `Resend code (${cooldown}s)`
                    : "Resend code"}
              </button>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-white transition hover:opacity-80"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Go back
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading…</div>}>
      <VerifyPageContent />
    </Suspense>
  );
}
