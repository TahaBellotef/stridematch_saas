import { useState, useMemo, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { buildApiUrl, jsonHeaders } from "@/shared/api/client";
import { setAdminToken } from "@/shared/auth/token-store";
import {
  isCognitoConfigured,
  launchHostedCognitoLogin,
} from "@/shared/auth/cognito";

type AdminLoginFormProps = {
  onLoginSuccess: (token: string) => void;
};

export function AdminLoginForm({ onLoginSuccess }: AdminLoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const cognitoReady = useMemo(() => {
    const configured = isCognitoConfigured();
    console.log("[AdminLoginForm] 🔍 Checking if Cognito is configured:", {
      configured,
      clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ? "✓ present" : "✗ missing",
      domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ? "✓ present" : "✗ missing",
      redirectUri: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI ? "✓ present" : "✗ missing",
    });
    return configured;
  }, []);

  const handleLocalLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError(null);

    try {
      const response = await fetch(buildApiUrl("/api/auth/login"), {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to log in.");
      }

      const payload = (await response.json()) as { access_token: string };
      setAdminToken(payload.access_token);
      onLoginSuccess(payload.access_token);
      router.push("/admin/dashboard/overview");
      setUsername("");
      setPassword("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="StrideMatch"
              width={110}
              height={28}
              priority
            />
          </Link>
          <span className="text-sm font-semibold text-slate-600">
            Admin Panel
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              Sign in to view sessions
            </h1>
            <p className="text-sm text-slate-600">
              Admin access is required to see scan sessions and results.
            </p>
          </div>

          {cognitoReady ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={launchHostedCognitoLogin}
                className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Continue with Cognito
              </button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-500">Or login locally</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <form onSubmit={handleLocalLogin} className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600">
                      Username
                    </label>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium"
                    placeholder="admin"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium"
                    placeholder="password"
                    autoComplete="current-password"
                  />
                </div>

                {loginError && (
                  <p className="text-sm text-red-600">{loginError}</p>
                )}

                <button
                  type="submit"
                  disabled={loggingIn}
                  className={[
                    "w-full rounded-2xl py-3 text-sm font-semibold transition",
                    loggingIn
                      ? "cursor-not-allowed bg-slate-200 text-slate-500"
                      : "bg-slate-900 text-white hover:bg-slate-800",
                  ].join(" ")}
                >
                  {loggingIn ? "Signing in..." : "Sign in"}
                </button>
              </form>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-sm font-semibold text-slate-700">
                Local admin login
              </h2>
              <form onSubmit={handleLocalLogin} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600">
                    Username
                  </label>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium"
                    placeholder="admin"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium"
                    placeholder="password"
                    autoComplete="current-password"
                  />
                </div>

                {loginError && (
                  <p className="text-sm text-red-600">{loginError}</p>
                )}

                <button
                  type="submit"
                  disabled={loggingIn}
                  className={[
                    "w-full rounded-2xl py-3 text-sm font-semibold transition",
                    loggingIn
                      ? "cursor-not-allowed bg-slate-200 text-slate-500"
                      : "bg-slate-900 text-white hover:bg-slate-800",
                  ].join(" ")}
                >
                  {loggingIn ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
