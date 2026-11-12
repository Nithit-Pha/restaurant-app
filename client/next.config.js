/** @type {import('next').NextConfig} */
const createNextIntlPlugin = require('next-intl/plugin');

// Thai / English: loads messages/<locale>.json for each request.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// 127.0.0.1, not localhost: the API listens on IPv4 only, and on Windows
// localhost resolves to IPv6 ::1 first.
const API_ORIGIN = process.env.API_ORIGIN || 'http://127.0.0.1:3001';

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
