/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next-kicetic-web",
  typedRoutes: true,
  experimental: {
    externalDir: true
  },
  transpilePackages: ["@kicetic/shared"],
};

export default nextConfig;
