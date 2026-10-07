"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { CheckCircle } from "@phosphor-icons/react";
import { confirmResetPassword } from "aws-amplify/auth";
import { AuthInput, AuthSideCards } from "@/components/auth";

function describeConfirmResetError(error: any): string {
  switch (error?.name) {
    case "CodeMismatchException":
      return "That code is incorrect. Please check your email and try again.";
    case "ExpiredCodeException":
      return "That code has expired. Please request a new one.";
    case "InvalidPasswordException":
      return "Password does not meet the security requirements.";
    case "LimitExceededException":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return error?.message || "Failed to change password. Please try again.";
  }
}

function ChangePasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const code = searchParams.get("code") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDone, setIsDone] = useState(false);

  // Password validation checks
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const hasRequirements = hasUppercase && hasNumber && hasSymbol;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !code) {
      setError("Missing or expired reset link. Please start over from Forgot Password.");
      return;
    }

    if (!hasMinLength || !hasRequirements) {
      setError("Please meet all password requirements.");
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
      setIsDone(true);
      setTimeout(() => router.push("/auth/login"), 1500);
    } catch (err: any) {
      setError(describeConfirmResetError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#1F1B2E" }}>
      {/* Left Side - Background with Cards */}
      <AuthSideCards
        backgroundImage="/images/Auth/changePassContainer.png"
        cards={["sessions", "revenue", "totalRevenueRight"]}
      />

      {/* Right Side - Change Password Form */}
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

          {isDone ? (
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white mb-3 text-center">
                Password Changed
              </h1>
              <p className="text-sm text-slate-400">
                Redirecting you to login…
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-white mb-3 text-center">
                Change Your Password
              </h1>
              <p className="text-sm text-slate-400 mb-8 text-center">
                Enter a new password below to change your password.
              </p>

              {error && (
                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <AuthInput
                  id="newPassword"
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Type your new password"
                  icon="password"
                  autoComplete="new-password"
                  showPasswordToggle
                  showPassword={showNewPassword}
                  onTogglePassword={() => setShowNewPassword(!showNewPassword)}
                />

                <AuthInput
                  id="confirmPassword"
                  label="Confirm New Password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type your new password"
                  icon="password"
                  autoComplete="new-password"
                  showPasswordToggle
                  showPassword={showConfirmPassword}
                  onTogglePassword={() => setShowConfirmPassword(!showConfirmPassword)}
                />

                {/* Password Requirements - Only show if password is entered and requirements not met */}
                {newPassword && (!hasMinLength || !hasRequirements) && (
                  <div
                    className="rounded-xl border p-4 space-y-2"
                    style={{
                      backgroundColor: "var(--sm-content)",
                      borderColor: "rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    {!hasMinLength && (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle
                          size={20}
                          weight="fill"
                          color="white"
                        />
                        <span className="text-white">
                          At least 8 characters
                        </span>
                      </div>
                    )}
                    {!hasRequirements && (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle
                          size={20}
                          weight="fill"
                          color="white"
                        />
                        <span className="text-white">
                          Including 1 uppercase letter, 1 number, and 1 symbol.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full text-white font-semibold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                  style={{ background: 'linear-gradient(to right, #4B21EF, #6F4CF5)' }}
                >
                  {isLoading ? "Changing..." : "Continue"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading…</div>}>
      <ChangePasswordPageContent />
    </Suspense>
  );
}
