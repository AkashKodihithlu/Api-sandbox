import type { NextConfig } from 'next';

const controlPlane = process.env.CONTROL_API_BASE_URL ?? 'http://localhost:4000';
const runtime = process.env.RUNTIME_BASE_URL ?? 'http://localhost:4001';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/control/:path*', destination: `${controlPlane}/:path*` },
      { source: '/runtime/:path*', destination: `${runtime}/:path*` },
    ];
  },
};

export default nextConfig;
