import path from "node:path";
import { withSerwist } from "@serwist/turbopack";

const nextConfig = {
  // Keep verification builds and test servers separate from the running dev app.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  output: "standalone" as const,
  outputFileTracingRoot: path.join(process.cwd(), "..", ".."),
  reactStrictMode: true,
  transpilePackages: ["@yoggan/db"],
  async rewrites() {
    const api = process.env.API_URL ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default withSerwist(nextConfig);
