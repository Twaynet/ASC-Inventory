const { execSync } = require('child_process');

let commitSha = 'dev';
try {
  commitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@asc/domain'],
  env: {
    BUILD_TIME: new Date().toISOString(),
    COMMIT_SHA: commitSha,
  },
};

module.exports = nextConfig;
