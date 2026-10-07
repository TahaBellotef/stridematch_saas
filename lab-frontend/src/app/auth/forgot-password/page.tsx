"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "aws-amplify/auth";
import { AuthInput, AuthSideCards } from "@/components/auth";

function describeResetPasswordError(error: any): string {
  switch (error?.name) {
    case "UserNotFoundException":
      return "No account was found with that email address.";
    case "LimitExceededException":
      return "Too many attempts. Please wait a moment and try again.";
    case "InvalidParameterException":
      return "This account doesn't have a way to receive a reset code (no verified email/phone on file).";
    default:
      return error?.message || "Something went wrong. Please try again.";
  }
}

function ForgotPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword({ username: email });
      router.push(`/auth/verify?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      setError(describeResetPasswordError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#1F1B2E" }}>
      {/* Left Side - Background with Cards */}
      <AuthSideCards
        backgroundImage="/images/Auth/resetPassContainer.png"
        cards={["sessions", "revenue", "totalRevenueRight"]}
      />
      {/* Right Side - Form */}
      <div className="w-full flex items-center justify-center px-16 py-12" style={{ width: '42%', backgroundColor: 'var(--sm-content)' }}>
        <div className="w-full max-w-md">
          <div>
            <h1 className="text-3xl font-bold text-white mb-3 text-center">
              Forgot Password
            </h1>
            <p className="text-sm text-slate-400 mb-8 text-center">
              Enter your email and we&apos;ll send you a code to reset your password
            </p>
            {error && (
              <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-sm text-red-400">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
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
              <button
                type="submit"
                disabled={isLoading}
                className="w-full text-white font-semibold rounded-xl py-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{ background: 'linear-gradient(to right, #4B21EF, #6F4CF5)' }}
              >
                {isLoading ? "Sending..." : "Continue"}
              </button>
            </form>

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
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading…</div>}>
      <ForgotPasswordPageContent />
    </Suspense>
  );
}
