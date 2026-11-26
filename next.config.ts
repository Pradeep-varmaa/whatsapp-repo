import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mssql", "bullmq", "ioredis"],
  async rewrites() {
    return [
      { source: "/v1/api/message", destination: "/api/v1/messages" },
      { source: "/v1/api/messages", destination: "/api/v1/messages" },
      { source: "/api/v1/message", destination: "/api/v1/messages" },
    ];
  },
};

export default nextConfig;
