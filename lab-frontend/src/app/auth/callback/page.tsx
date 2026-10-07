"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { consumePkceStateAndVerifier } from "@/shared/auth/cognito";
import { setAdminToken } from "@/shared/auth/token-store";

function normalizeDomain(domain: string) {
  const trimmed = domain.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");

        console.log("[AuthCallback] 🔍 Callback page reached");
        console.log("[AuthCallback] URL params:", { code: code ? "✓ present" : "✗ missing", state: returnedState ? "✓ present" : "✗ missing" });

        if (!code || !returnedState) {
          setMsg("Missing code/state in callback URL.");
          console.error("[AuthCallback] ❌ Missing code or state");
          return;
        }

        const { verifier, state: storedState } = consumePkceStateAndVerifier();
        if (!verifier || !storedState) {
          setMsg("Missing PKCE verifier/state (storage cleared or blocked).");
          console.error("[AuthCallback] ❌ Missing PKCE verifier/state");
          return;
        }

        console.log("[AuthCallback] ✓ PKCE state and verifier retrieved");

        if (returnedState !== storedState) {
          setMsg("State mismatch. Please retry login.");
          console.error("[AuthCallback] ❌ State mismatch", { returned: returnedState, stored: storedState });
          return;
        }

        console.log("[AuthCallback] ✓ State validation passed");

        const rawDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
        const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
        const redirectUri = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI!;
        const domain = normalizeDomain(rawDomain);

        console.log("[AuthCallback] 📤 Exchanging authorization code for tokens:", {
          domain,
          clientId,
          redirectUri: redirectUri ? "✓ present" : "✗ missing",
        });

        const body = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        });

        const tokenRes = await fetch(`${domain}/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });

        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          console.error("[AuthCallback] ❌ Token exchange failed", { status: tokenRes.status, response: text });
          throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`);
        }

        const tokens = (await tokenRes.json()) as {
          access_token: string;
          id_token?: string;
          refresh_token?: string;
          expires_in: number;
          token_type: string;
        };

        console.log("[AuthCallback] ✅ Token exchange successful. Tokens received:", {
          access_token: tokens.access_token ? "✓ present" : "✗ missing",
          id_token: tokens.id_token ? "✓ present" : "✗ missing",
          expires_in: tokens.expires_in,
        });

        // Store Cognito tokens (optional)
        localStorage.setItem("cognito_access_token", tokens.access_token);
        console.log("[AuthCallback] 💾 Attempted to save cognito_access_token to localStorage");
        
        // VERIFY it was saved
        const savedAccessToken = localStorage.getItem("cognito_access_token");
        console.log("[AuthCallback] 🔍 Verification - cognito_access_token in localStorage:", savedAccessToken ? `✓ present (length: ${savedAccessToken.length})` : "✗ MISSING!");
        
        if (tokens.id_token) {
          localStorage.setItem("cognito_id_token", tokens.id_token);
          const savedIdToken = localStorage.getItem("cognito_id_token");
          console.log("[AuthCallback] 🔍 Verification - cognito_id_token in localStorage:", savedIdToken ? `✓ present (length: ${savedIdToken.length})` : "✗ MISSING!");
        }
        if (tokens.refresh_token) {
          localStorage.setItem("cognito_refresh_token", tokens.refresh_token);
          const savedRefreshToken = localStorage.getItem("cognito_refresh_token");
          console.log("[AuthCallback] 🔍 Verification - cognito_refresh_token in localStorage:", savedRefreshToken ? `✓ present (length: ${savedRefreshToken.length})` : "✗ MISSING!");
        }
        if (tokens.expires_in) {
          const expiresAt = Date.now() + tokens.expires_in * 1000;
          localStorage.setItem("cognito_access_expires_at", String(expiresAt));
        }

        // Log ALL localStorage keys to see what's there
        console.log("[AuthCallback] 📋 All localStorage keys:", Object.keys(localStorage).join(", "));

        // ✅ Path 1: use Cognito token directly; prefer access token for groups
        const cognitoToken = tokens.access_token || tokens.id_token;
        if (!cognitoToken) {
          throw new Error("Cognito token missing (no access_token/id_token).");
        }

        setAdminToken(cognitoToken);
        console.log("[AuthCallback] ✅ Called setAdminToken with Cognito token");

        setMsg("Signed in. Redirecting…");
        router.replace("/admin/dashboard/overview");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[AuthCallback] ❌ FATAL ERROR:", message);
        setMsg(`Error: ${message}`);
      }
    })();
  }, [router]);

  return <div style={{ padding: 24 }}>{msg}</div>;
}
