"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { signIn, signOut, fetchAuthSession, fetchUserAttributes, getCurrentUser } from "aws-amplify/auth";
import { UserTypes } from "@/shared/types/users";
import {
  setAdminToken,
  clearAdminToken,
  getFreshAdminToken,
} from "./token-store";
import { configureAmplify } from "./amplify-config";
import { isCognitoConfigured } from "./cognito";

type UserRole = "admin" | "user";

type AuthUser = UserTypes & {
  role: UserRole;
};

const AUTH_TOKEN_KEY = "auth_token";
const AUTH_USER_KEY = "auth_user";

// Backend API URL
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Configure Amplify on module load
if (typeof globalThis.window !== "undefined") {
  configureAmplify();
}

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { readonly children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const token = await getFreshAdminToken();
      const savedUser = localStorage.getItem(AUTH_USER_KEY);

      if (!mounted) return;

      if (token && savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setUser(parsed);
          setToken(token);
        } catch {
          localStorage.removeItem(AUTH_USER_KEY);
          clearAdminToken();
          setToken(null);
        }
      }
      setIsLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Browser back/forward can restore a page straight from the
  // back-forward cache, with no React effects re-running - so a page
  // visited while logged in can reappear, fully rendered, after logout.
  // Forcing a hard reload on a bfcache restore makes every back/forward
  // navigation re-evaluate the real auth state instead of showing a
  // frozen snapshot from before logout.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      // First, sign out any existing session
      try {
        await signOut();
      } catch (signOutError) {
        // Ignore sign out errors (user might not be signed in)
        console.log("No existing session to sign out");
      }

      // Sign in with Cognito (username can be email or username)
      const signInResult = await signIn({
        username,
        password,
      });

      if (signInResult.isSignedIn) {
        // Get the Cognito session tokens
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        const accessToken = session.tokens?.accessToken?.toString();
        const refreshToken = (session.tokens as { refreshToken?: { toString: () => string } } | undefined)
          ?.refreshToken?.toString();

        if (!idToken && !accessToken) {
          console.error("No tokens received from Cognito");
          throw new Error("Authentication failed: No tokens received");
        }

        // Use access token (preferred) or id token
        const cognitoToken = accessToken || idToken;
        if (!cognitoToken) {
          console.error("No Cognito token available after sign-in");
          throw new Error("Authentication failed: No Cognito token received");
        }

        if (accessToken) {
          localStorage.setItem("cognito_access_token", accessToken);
          const exp = session.tokens?.accessToken?.payload?.exp;
          if (typeof exp === "number") {
            localStorage.setItem("cognito_access_expires_at", String(exp * 1000));
          }
          console.log("[Login] ✓ Access token stored");
        }
        if (idToken) {
          localStorage.setItem("cognito_id_token", idToken);
          console.log("[Login] ✓ ID token stored");
        }
        if (refreshToken) {
          localStorage.setItem("cognito_refresh_token", refreshToken);
          console.log("[Login] ✓ Refresh token stored");
        } else {
          console.warn("[Login] ⚠️ No refresh token received from Cognito. Token refresh may not be available.");
        }

        // Store Cognito token directly for API calls
        setAdminToken(cognitoToken);
        setToken(cognitoToken);

        // Keep legacy key for any consumers that still look for it
        localStorage.setItem(AUTH_TOKEN_KEY, cognitoToken);

        // Get user info from Cognito
        const currentUser = await getCurrentUser();
        
        // Extract claims from ID token
        const idTokenPayload = session.tokens?.idToken?.payload;
        
        // Create user object with JWT claims
        const authUser: AuthUser = {
          id: currentUser.userId,
          email: (idTokenPayload?.email as string) || username,
          first_name: (idTokenPayload?.given_name as string) || "",
          last_name: (idTokenPayload?.family_name as string) || "",
          created_at: new Date().toISOString(),
          last_login_at: new Date().toISOString(),
          role: "admin",
        };

        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser));
        setUser(authUser);

        return true;
      }

      throw new Error("Sign in was not successful");
    } catch (error: any) {
      // Throw error with user-friendly message
      if (error.name === "NotAuthorizedException") {
        // Check for specific error messages
        if (error.message?.includes("Temporary password has expired")) {
          throw new Error("Your temporary password has expired. Please contact an administrator to reset your password.");
        } else if (error.message?.includes("Password attempts exceeded")) {
          throw new Error("Too many failed login attempts. Please try again later or contact support.");
        } else {
          throw new Error("Incorrect email or password");
        }
      } else if (error.name === "UserNotFoundException") {
        throw new Error("User not found. Please check your email address.");
      } else if (error.name === "UserNotConfirmedException") {
        throw new Error("Please verify your email address before logging in");
      } else if (error.message) {
        throw error;
      }
      
      throw new Error("Login failed. Please try again.");
    }
  };

  const refreshUser = useCallback(async () => {
    const attributes = await fetchUserAttributes();
    setUser((prev) => {
      if (!prev) return prev;
      const updated: AuthUser = {
        ...prev,
        email: attributes.email || prev.email,
        first_name: attributes.given_name ?? prev.first_name,
        last_name: attributes.family_name ?? prev.last_name,
      };
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      // Sign out from Cognito
      await signOut();
    } catch (error) {
      console.error("Cognito sign out error:", error);
    }

    // Clear local storage
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    clearAdminToken();
    setUser(null);
    setToken(null);

    // Redirect here directly (not just via AuthGuard reacting to
    // isAuthenticated) so a session-expiry-triggered logout - which can
    // happen from a background refresh timer with no guarded page actively
    // re-rendering - always lands the user back on the login page instead
    // of a blank/broken screen.
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth/login")) {
      window.location.href = "/auth/login";
    }
  }, []);

  // Token refresh effect - checks every 2 minutes and refreshes 5 minutes before expiration
  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;

    const ensureFresh = async () => {
      try {
        console.log("[Token Refresh] Checking token freshness...");
        
        // Try to get fresh token (will auto-refresh if needed)
        const fresh = await getFreshAdminToken();
        
        if (cancelled) return;
        
        if (!fresh) {
          console.error("[Token Refresh] Failed to get fresh token - session expired");
          // Only logout if we truly can't get a token
          try {
            // Force Amplify to refresh
            const session = await fetchAuthSession({ forceRefresh: true });
            const refreshedToken = session.tokens?.accessToken?.toString();
            
            if (refreshedToken) {
              console.log("[Token Refresh] ✓ Token refreshed via Amplify");
              setToken(refreshedToken);
              localStorage.setItem(AUTH_TOKEN_KEY, refreshedToken);
              return;
            }
          } catch (refreshError) {
            console.error("[Token Refresh] Amplify refresh failed:", refreshError);
          }
          
          // All refresh attempts failed
          console.log("[Token Refresh] All refresh attempts failed, logging out");
          await logout();
          return;
        }
        
        if (fresh !== token) {
          console.log("[Token Refresh] ✓ Token refreshed automatically");
          setToken(fresh);
          localStorage.setItem(AUTH_TOKEN_KEY, fresh);
        } else {
          console.log("[Token Refresh] Token still valid");
        }
      } catch (error) {
        console.error("[Token Refresh] Unexpected error:", error);
        // Don't logout on random errors, just log it
      }
    };

    void ensureFresh();
    // Check every 2 minutes for token refresh needs
    const interval = window.setInterval(ensureFresh, 2 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, user, logout]);

  // Activity-based refresh - refresh on user activity if needed
  useEffect(() => {
    if (!token || !user) return;
    
    const handleActivity = async () => {
      try {
        const fresh = await getFreshAdminToken();
        if (fresh && fresh !== token) {
          console.log("[Activity Refresh] ✓ Token refreshed on user activity");
          setToken(fresh);
          localStorage.setItem(AUTH_TOKEN_KEY, fresh);
        }
      } catch (error) {
        console.error("[Activity Refresh] Error:", error);
        // Don't logout on activity check failure
      }
    };

    // Throttle activity checks to once per minute
    let activityTimeout: NodeJS.Timeout | null = null;
    const throttledActivity = () => {
      if (activityTimeout) return;
      activityTimeout = setTimeout(() => {
        activityTimeout = null;
        void handleActivity();
      }, 60 * 1000); // Throttle to once per minute
    };

    window.addEventListener("mousemove", throttledActivity);
    window.addEventListener("keydown", throttledActivity);
    window.addEventListener("click", throttledActivity);

    return () => {
      window.removeEventListener("mousemove", throttledActivity);
      window.removeEventListener("keydown", throttledActivity);
      window.removeEventListener("click", throttledActivity);
      if (activityTimeout) clearTimeout(activityTimeout);
    };
  }, [token, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
