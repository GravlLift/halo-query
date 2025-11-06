import { useAzureMonitor } from '@azure/monitor-opentelemetry';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import {
  HttpInstrumentationConfig,
  HttpRequestCustomAttributeFunction,
} from '@opentelemetry/instrumentation-http';
import {
  RequestHookFunction,
  UndiciInstrumentation,
} from '@opentelemetry/instrumentation-undici';
import * as appInsights from 'applicationinsights';
import { DependencyBodyProcessor } from './dependency-body-processor';
import { TelemetryLevelProcessor } from './telemetry-level-processor';
import { config } from '../config';

// Ensure initialization runs only once per Node.js process (dev HMR safe)
const globalKey = '__azureMonitorInitialized__';
const g = globalThis as unknown as Record<string, unknown>;

const dependencyBodyProcessor = new DependencyBodyProcessor();
const hooks = {
  request: {
    undici: [dependencyBodyProcessor.requestHook] as RequestHookFunction[],
    http: [
      dependencyBodyProcessor.requestHook,
    ] as HttpRequestCustomAttributeFunction[],
  },
};

if (!g[globalKey]) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: config.connectionString,
    },
    spanProcessors: [new TelemetryLevelProcessor(), dependencyBodyProcessor],
    instrumentationOptions: {
      http: {
        enabled: true,
        requestHook(span, request) {
          for (const hook of hooks.request.http) {
            hook(span, request);
          }
        },
      } as HttpInstrumentationConfig,
      azureSdk: { enabled: true },
    },
    enableLiveMetrics: true,
  });

  registerInstrumentations({
    instrumentations: [
      new UndiciInstrumentation({
        requestHook(span, request) {
          for (const hook of hooks.request.undici) {
            hook(span, request);
          }
        },
      }),
    ],
  });

  // Provide a minimal Application Insights client for manual tracking without enabling auto-collection
  // Avoid appInsights.setup()/start() to prevent duplicate auto-instrumentation; use a direct TelemetryClient instead.
  const client = new appInsights.TelemetryClient();
  // Prefer connection string if provided
  if (config.connectionString) {
    client.config.connectionString = config.connectionString;
  }

  // Expose globally so subsequent HMR reloads reuse the same client
  (g as any).__appInsightsClient__ = client;
  g[globalKey] = true;
}

// Export a stable client reference for route handlers
export const defaultClient: appInsights.TelemetryClient =
  ((globalThis as any).__appInsightsClient__ as appInsights.TelemetryClient) ??
  new appInsights.TelemetryClient();
