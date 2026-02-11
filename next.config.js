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
  headers: async () => {
    return [
      {
        source: '/proxy/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: ['@chakra-ui/react'],
  },
  // Externalize Node-only observability packages to avoid bundling warnings from dynamic require
  serverExternalPackages: [
    '@sentry/node',
    '@opentelemetry/instrumentation',
    '@opentelemetry/sdk-node',
    '@azure/monitor-opentelemetry',
    '@azure/opentelemetry-instrumentation-azure-sdk',
    'require-in-the-middle',
    'diagnostic-channel-publishers',
    'applicationinsights',
  ],
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
    // Silence known webpack warnings about dynamic require in 3rd-party instrumentation libs
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
      /Critical dependency: the request of a dependency is an expression/,
    ];
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
