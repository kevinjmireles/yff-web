const COMMIT = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Commit', value: COMMIT }],
      },
    ];
  },
};

export default nextConfig;
