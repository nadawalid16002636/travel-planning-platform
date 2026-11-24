import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  async rewrites() {
    const backend = (
      process.env.BACKEND_API_URL || "http://localhost:3000/api"
    ).replace(/\/$/, "");
    return [
      "auth/login",
      "flight-bookings/:path*",
      "payments",
      "payments/:id/retry",
    ].map((path) => ({
      source: "/travel-api/" + path,
      destination: backend + "/" + path,
    }));
  },
};
export default config;
