"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AuthLayout, AuthCard, AuthInput, SocialButtons, AuthSideCards} from "@/components/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // TODO: Implement registration logic
      console.log("Register:", { name, email, password });
      router.push("/auth/login");
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#1F1B2E" }}>
      {/* Left Side - Background with Cards */}
      <AuthSideCards 
        backgroundImage="/images/Auth/registerContainer.png"
        cards={["sessions", "revenue", "totalRevenueRight"]}
      />

      {/* Right Side - Register Form */}
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
          <SocialButtons />
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <AuthInput
              id="name"
              label="Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type your name"
              icon="user"
              autoComplete="name"
            />
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
              autoComplete="new-password"
              showPasswordToggle
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
            />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white font-semibold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: 'linear-gradient(to right, #4B21EF, #6F4CF5)' }}
            >
              {isLoading ? "Creating account..." : "Continue"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="font-medium transition-colors hover:opacity-80"
              style={{ color: '#60E497' }}
            >
              Login
            </Link>
          </p>

          <p className="mt-8 text-center text-xs text-slate-500">
            By signing up, you agree to Stridematch{" "} <br />
            <Link href="/terms" className="underline hover:text-slate-400 transition-colors">Terms of Use</Link>
            {" "}and{" "}
            <Link href="/privacy" className="underline hover:text-slate-400 transition-colors">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}