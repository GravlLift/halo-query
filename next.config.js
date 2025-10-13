//@ts-check

const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  output: 'standalone',
  transpilePackages: ['@gravllift/utilities', '@gravllift/halo-helpers'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ['@chakra-ui/react'],
  },
  serverExternalPackages: ['@sentry/node', '@opentelemetry/instrumentation'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.externals = {
        ...config.externals,
        'node:crypto': '{}',
        fs: '{}',
        'fs/promises': '{}',
      };
    } else {
      config.externals = [
        ...config.externals,
        '_http_common',
        {
          '@opentelemetry/exporter-jaeger': '{}',
          '@azure/functions-core': '{}',
        },
      ];
    }
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
    };

    return config;
  },
  rewrites: async () => {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: '/proxy/login.live.com/:path*',
          destination: 'https://login.live.com/:path*',
        },
        {
          source: '/proxy/:subdomain.xboxlive.com/:path*',
          destination: 'https://:subdomain.xboxlive.com/:path*',
        },
        {
          source: '/proxy/:subdomain.halowaypoint.com/:path*',
          destination: 'https://:subdomain.halowaypoint.com/:path*',
        },
      ],
    };
  },
};

module.exports = nextConfig;
