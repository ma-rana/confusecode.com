/** @type {import('next').NextConfig} */

// In production, Caddy proxies /api/* to the backend, so no rewrite is needed.
// In local dev, the backend runs on :4000, so we rewrite /api/* to it — this
// keeps the frontend fetching a same-origin "/api/..." path in every environment.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

const nextConfig = {
  reactStrictMode: true,
  // Security headers here are a dev convenience. In production the authoritative
  // headers (HSTS, strict CSP, etc.) are set by Caddy — see the Phase 1 checklist.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
