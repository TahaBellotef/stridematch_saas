export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, ""),
} as const;

if (!env.apiBaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE is not defined. Check Amplify environment variables."
  );
}