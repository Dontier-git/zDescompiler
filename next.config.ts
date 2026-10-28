import type { NextConfig } from "next";

// When building inside GitHub Actions we want a static export (no Node.js server)
// so the output can be served by GitHub Pages. When developing / previewing in
// the sandbox (no GITHUB_ACTIONS env var) we use the default Next.js config so
// the dev server works normally.
const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const repo = process.env.GITHUB_REPOSITORY?.replace(/.*?\//, "") || "zDescompiler";

const nextConfig: NextConfig = {
  ...(isGithubActions
    ? {
        // Static export → generates out/ with pure HTML/CSS/JS for GitHub Pages
        output: "export" as const,
        basePath: `/${repo}`,
        assetPrefix: `/${repo}/`,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "*.space-z.ai",
    "*.chatglm.cn",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
