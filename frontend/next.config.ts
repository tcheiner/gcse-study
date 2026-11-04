import type { NextConfig } from "next";
import { appConfig } from "./src/config/app";

// The browser only ever talks to this site; /api/english/* is proxied to the FastAPI backend,
// so the key cookie stays first-party. Set ENGLISH_API_URL per environment (e.g. the Render URL).
const englishApi = (process.env.ENGLISH_API_URL || appConfig.defaultEnglishApiUrl).replace(/\/$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: `${appConfig.apiPaths.english}/:path*`, destination: `${englishApi}/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};

export default nextConfig;
