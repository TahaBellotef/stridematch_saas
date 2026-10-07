"use client";

const PKCE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

const VERIFIER_KEY = "sm_pkce_code_verifier";
const STATE_KEY = "sm_pkce_state";

export const isCognitoConfigured = () => {
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI;
  
  console.log("[isCognitoConfigured] Checking environment variables:", {
    domain: domain ? `✓ "${domain.substring(0, 30)}..."` : "✗ missing",
    clientId: clientId ? `✓ "${clientId}"` : "✗ missing",
    redirectUri: redirectUri ? `✓ "${redirectUri}"` : "✗ missing",
    result: Boolean(domain && clientId && redirectUri),
  });
  
  return Boolean(domain && clientId && redirectUri);
};

function normalizeDomain(domain: string): string {
  // Accept either:
  // - "stridematch.auth.us-east-1.amazoncognito.com"
  // - "https://stridematch.auth.us-east-1.amazoncognito.com"
  // and always return "https://<host>" without trailing slash.
  const trimmed = domain.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

const genRandomString = (len: number) => {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => PKCE_ALPHABET[b % PKCE_ALPHABET.length]).join("");
};

const genCodeVerifier = () => genRandomString(64); // good length
const genState = () => genRandomString(32);

const sha256Base64Url = async (input: string) => {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export const launchHostedCognitoLogin = async () => {
  const rawDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
  const redirectUri = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI!;

  const domain = normalizeDomain(rawDomain);

  try {
    const verifier = genCodeVerifier();
    const state = genState();

    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(STATE_KEY, state);

    const challenge = await sha256Base64Url(verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid email profile",
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
    });

    const authUrl = `${domain}/oauth2/authorize?${params.toString()}`;
    window.location.assign(authUrl);
  } catch (error) {
    console.error("💥 [PKCE ERROR] Failed to initialize:", error);
    alert("Unable to start Cognito login. Check console for details.");
  }
};

export function consumePkceStateAndVerifier() {
  // Call this in /auth/callback page BEFORE exchanging the code
  const verifier = localStorage.getItem(VERIFIER_KEY);
  const state = localStorage.getItem(STATE_KEY);

  // One-time use (recommended)
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(STATE_KEY);

  return { verifier, state };
}