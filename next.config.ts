import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Necesario para compatibilidad con algunas dependencias en Docker
  serverExternalPackages: ["pg"],
};

export default nextConfig;
