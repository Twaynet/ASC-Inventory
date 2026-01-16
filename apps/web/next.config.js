/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@asc/domain'],
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
};

module.exports = nextConfig;
