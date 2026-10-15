import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:4100";

const config: NextConfig = {
  transpilePackages: ["@openseo/shared"],
  // The browser only ever talks to this origin; /api is forwarded to the API server.
  // No framing: the consent page approves connections with one click.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
