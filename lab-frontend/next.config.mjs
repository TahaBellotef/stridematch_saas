/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  // this is dev-only; fine to keep, but irrelevant in production
  allowedDevOrigins: ["http://localhost:3000"],
};

export default nextConfig;
