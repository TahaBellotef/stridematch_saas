const ADMIN_TOKEN_KEY = "sm_admin_token";
const LEGACY_KEYS = ["admin_token"];
const COGNITO_ACCESS_KEY = "cognito_access_token";
const COGNITO_ID_KEY = "cognito_id_token";
const COGNITO_REFRESH_KEY = "cognito_refresh_token";
const COGNITO_EXPIRES_AT_KEY = "cognito_access_expires_at";

type SerializableToken = string | Record<string, unknown>;

const isBrowser = () => typeof window !== "undefined";

function normalizeToken(token: SerializableToken): string {
  return typeof token === "string" ? token : JSON.stringify(token);
}

function normalizeDomain(domain: string): string {
  const trimmed = domain.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  try {
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getJwtExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return null;
  return payload.exp * 1000;
}

function isTokenExpired(token: string, skewSeconds = 60): boolean {
  const exp = getJwtExpiry(token);
  if (!exp) return false;
  return Date.now() >= exp - skewSeconds * 1000;
}

function shouldRefreshToken(token: string, refreshBeforeMinutes = 5): boolean {
  const exp = getJwtExpiry(token);
  if (!exp) return false;
  // Refresh if token expires in less than refreshBeforeMinutes
  return Date.now() >= exp - refreshBeforeMinutes * 60 * 1000;
}

function migrateLegacyTokens(): string | null {
  if (!isBrowser()) return null;
  for (const key of LEGACY_KEYS) {
    const legacy = window.localStorage.getItem(key);
    if (legacy) {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, legacy);
      window.localStorage.removeItem(key);
      return legacy;
    }
  }
  return null;
}

function getAmplifyAccessToken(): string | null {
  if (!isBrowser()) return null;

  const keys = Object.keys(window.localStorage);
  const lastUserKey = keys.find(
    (key) =>
      key.startsWith("CognitoIdentityServiceProvider.") &&
      key.endsWith(".LastAuthUser")
  );

  if (lastUserKey) {
    const prefix = lastUserKey.replace(".LastAuthUser", "");
    const username = window.localStorage.getItem(lastUserKey);
    if (username) {
      const accessKey = `${prefix}.${username}.accessToken`;
      const token = window.localStorage.getItem(accessKey);
      if (token) return token;
    }
  }

  const anyAccessKey = keys.find(
    (key) =>
      key.startsWith("CognitoIdentityServiceProvider.") &&
      key.endsWith(".accessToken")
  );
  return anyAccessKey ? window.localStorage.getItem(anyAccessKey) : null;
}

function getAmplifyRefreshToken(): string | null {
  if (!isBrowser()) return null;

  const keys = Object.keys(window.localStorage);
  const lastUserKey = keys.find(
    (key) =>
      key.startsWith("CognitoIdentityServiceProvider.") &&
      key.endsWith(".LastAuthUser")
  );

  if (lastUserKey) {
    const prefix = lastUserKey.replace(".LastAuthUser", "");
    const username = window.localStorage.getItem(lastUserKey);
    if (username) {
      const refreshKey = `${prefix}.${username}.refreshToken`;
      const token = window.localStorage.getItem(refreshKey);
      if (token) return token;
    }
  }

  const anyRefreshKey = keys.find(
    (key) =>
      key.startsWith("CognitoIdentityServiceProvider.") &&
      key.endsWith(".refreshToken")
  );
  return anyRefreshKey ? window.localStorage.getItem(anyRefreshKey) : null;
}

function updateAmplifyTokens(accessToken: string, idToken?: string): void {
  if (!isBrowser()) return;

  const keys = Object.keys(window.localStorage);
  const lastUserKey = keys.find(
    (key) =>
      key.startsWith("CognitoIdentityServiceProvider.") &&
      key.endsWith(".LastAuthUser")
  );

  if (lastUserKey) {
    const prefix = lastUserKey.replace(".LastAuthUser", "");
    const username = window.localStorage.getItem(lastUserKey);
    if (username) {
      // Update Amplify's storage with new tokens
      window.localStorage.setItem(`${prefix}.${username}.accessToken`, accessToken);
      if (idToken) {
        window.localStorage.setItem(`${prefix}.${username}.idToken`, idToken);
      }
      console.log("[updateAmplifyTokens] ✓ Updated Amplify storage with new tokens");
    }
  }
}

export function setAdminToken(token: SerializableToken): void {
  if (!isBrowser()) return;
  const normalized = normalizeToken(token);
  window.localStorage.setItem(ADMIN_TOKEN_KEY, normalized);
  LEGACY_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export function getAdminToken(): string | null {
  if (!isBrowser()) return null;
  
  // PRIORITY 1: Try Cognito token first
  const cognitoAccess = window.localStorage.getItem(COGNITO_ACCESS_KEY);
  if (cognitoAccess) {
    console.log("[getAdminToken] ✓ Using Cognito access token");
    return cognitoAccess;
  }

  const amplifyAccess = getAmplifyAccessToken();
  if (amplifyAccess) {
    console.log("[getAdminToken] ✓ Using Amplify Cognito access token");
    return amplifyAccess;
  }
  
  // PRIORITY 2: Fall back to local admin token
  const localToken = window.localStorage.getItem(ADMIN_TOKEN_KEY);
  if (localToken) {
    console.log("[getAdminToken] ✓ Using local admin token (Cognito not available)");
    return localToken;
  }
  
  // PRIORITY 3: Check for legacy tokens
  const migrated = migrateLegacyTokens();
  if (migrated) {
    console.log("[getAdminToken] ✓ Using migrated legacy token");
    return migrated;
  }
  
  console.warn("[getAdminToken] ⚠️ No authentication token found!");
  return null;
}

export async function getFreshAdminToken(): Promise<string | null> {
  if (!isBrowser()) return null;

  // PRIORITY 1: Check our primary Cognito storage
  const cognitoAccess = window.localStorage.getItem(COGNITO_ACCESS_KEY);
  if (cognitoAccess) {
    console.log("[getFreshAdminToken] Checking Cognito access token...");
    
    // First check if token is already expired
    if (isTokenExpired(cognitoAccess)) {
      console.log("[getFreshAdminToken] Token is expired, attempting refresh...");
      const refreshToken = window.localStorage.getItem(COGNITO_REFRESH_KEY);
      if (refreshToken) {
        const refreshed = await refreshCognitoTokens(refreshToken);
        if (refreshed) {
          console.log("[getFreshAdminToken] ✓ Expired token refreshed");
          return refreshed;
        }
        console.warn("[getFreshAdminToken] Failed to refresh expired token");
      } else {
        console.warn("[getFreshAdminToken] Expired but no refresh token available, clearing storage");
        clearAdminToken();
      }
    } else if (shouldRefreshToken(cognitoAccess, 5)) {
      // Token is still valid but expires soon - try proactive refresh if we have a refresh token
      console.log("[getFreshAdminToken] Token expires soon, attempting proactive refresh...");
      const refreshToken = window.localStorage.getItem(COGNITO_REFRESH_KEY);
      if (refreshToken) {
        const refreshed = await refreshCognitoTokens(refreshToken);
        if (refreshed) {
          console.log("[getFreshAdminToken] ✓ Token refreshed proactively");
          return refreshed;
        }
        console.warn("[getFreshAdminToken] Proactive refresh failed");
      }
      // Continue to use existing token since it's still valid
      console.log("[getFreshAdminToken] ✓ Token still valid, deferring refresh");
      return cognitoAccess;
    } else {
      // Token is valid and not expiring soon
      console.log("[getFreshAdminToken] ✓ Token still valid");
      return cognitoAccess;
    }
  }

  // PRIORITY 2: Check Amplify's storage (fallback)
  const amplifyAccess = getAmplifyAccessToken();
  if (amplifyAccess) {
    console.log("[getFreshAdminToken] Checking Amplify storage token...");
    
    // First check if token is already expired
    if (isTokenExpired(amplifyAccess)) {
      console.log("[getFreshAdminToken] Amplify token is expired, attempting refresh...");
      const amplifyRefresh = getAmplifyRefreshToken();
      if (amplifyRefresh) {
        const refreshed = await refreshCognitoTokens(amplifyRefresh);
        if (refreshed) {
          console.log("[getFreshAdminToken] ✓ Amplify token refreshed");
          return refreshed;
        }
        console.warn("[getFreshAdminToken] Amplify token refresh failed");
      } else {
        console.warn("[getFreshAdminToken] Amplify token expired but no refresh token available");
      }
    } else if (shouldRefreshToken(amplifyAccess, 5)) {
      // Token is still valid but expires soon - try proactive refresh if we have a refresh token
      console.log("[getFreshAdminToken] Amplify token expires soon, attempting proactive refresh...");
      const amplifyRefresh = getAmplifyRefreshToken();
      if (amplifyRefresh) {
        const refreshed = await refreshCognitoTokens(amplifyRefresh);
        if (refreshed) {
          console.log("[getFreshAdminToken] ✓ Amplify token refreshed proactively");
          return refreshed;
        }
        console.warn("[getFreshAdminToken] Amplify proactive refresh failed");
      }
      // Continue to use existing token since it's still valid
      console.log("[getFreshAdminToken] ✓ Amplify token still valid, deferring refresh");
      return amplifyAccess;
    } else {
      // Token is valid and not expiring soon
      console.log("[getFreshAdminToken] ✓ Using Amplify token");
      return amplifyAccess;
    }
  }

  const localToken = window.localStorage.getItem(ADMIN_TOKEN_KEY);
  if (localToken) {
    console.log("[getFreshAdminToken] Checking local token...");
    if (!isTokenExpired(localToken)) {
      console.log("[getFreshAdminToken] ✓ Using local token");
      return localToken;
    }
    clearAdminToken();
  }

  const migrated = migrateLegacyTokens();
  if (migrated) {
    console.log("[getFreshAdminToken] ✓ Using migrated token");
    return migrated;
  }

  console.log("[getFreshAdminToken] No token available (user not logged in)");
  return null;
}

async function refreshCognitoTokens(refreshToken: string): Promise<string | null> {
  const rawDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

  if (!rawDomain || !clientId) {
    console.error("[refreshCognitoTokens] Missing Cognito configuration");
    return null;
  }

  try {
    console.log("[refreshCognitoTokens] Attempting token refresh...");
    const domain = normalizeDomain(rawDomain);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    });

    const response = await fetch(`${domain}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[refreshCognitoTokens] Refresh failed:", response.status, errorText);
      // 400 = invalid_grant: the refresh token itself is expired/revoked, not
      // just the short-lived access token. Clear everything now instead of
      // silently returning null and letting the app keep pretending the
      // user is still logged in with no valid token to show for it.
      if (response.status === 400) {
        clearAdminToken();
      }
      return null;
    }

    const tokens = (await response.json()) as {
      access_token: string;
      id_token?: string;
      expires_in: number;
      token_type: string;
    };

    if (tokens.access_token) {
      console.log("[refreshCognitoTokens] ✓ Token refreshed successfully");
      window.localStorage.setItem(COGNITO_ACCESS_KEY, tokens.access_token);
      const expiresAt = Date.now() + tokens.expires_in * 1000;
      window.localStorage.setItem(COGNITO_EXPIRES_AT_KEY, String(expiresAt));
      setAdminToken(tokens.access_token);
      
      console.log(`[refreshCognitoTokens] Token expires in ${tokens.expires_in} seconds`);
    }
    if (tokens.id_token) {
      window.localStorage.setItem(COGNITO_ID_KEY, tokens.id_token);
    }

    // Also update Amplify's storage to keep them in sync
    updateAmplifyTokens(tokens.access_token, tokens.id_token);

    return tokens.access_token ?? null;
  } catch (error) {
    console.error("[refreshCognitoTokens] Exception during refresh:", error);
    return null;
  }
}

export function clearAdminToken(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  LEGACY_KEYS.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.removeItem(COGNITO_ACCESS_KEY);
  window.localStorage.removeItem(COGNITO_ID_KEY);
  window.localStorage.removeItem(COGNITO_REFRESH_KEY);
  window.localStorage.removeItem(COGNITO_EXPIRES_AT_KEY);
  
  // Also clear Amplify's storage
  const keys = Object.keys(window.localStorage);
  const amplifyKeys = keys.filter(key => 
    key.startsWith("CognitoIdentityServiceProvider.")
  );
  amplifyKeys.forEach(key => window.localStorage.removeItem(key));
  
  console.log("[clearAdminToken] Cleared all tokens (including Amplify storage)");
}

export function hasAdminToken(): boolean {
  return Boolean(getAdminToken());
}

export const adminTokenStorage = {
  get: getAdminToken,
  set: setAdminToken,
  clear: clearAdminToken,
  has: hasAdminToken,
};
