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
import { defaultClient } from 'applicationinsights';
import { DependencyBodyProcessor } from './dependency-body-processor';
import { TelemetryLevelProcessor } from './telemetry-level-processor';
import { config } from '../config';

const dependencyBodyProcessor = new DependencyBodyProcessor();
const hooks = {
  request: {
    undici: [dependencyBodyProcessor.requestHook] as RequestHookFunction[],
    http: [
      dependencyBodyProcessor.requestHook,
    ] as HttpRequestCustomAttributeFunction[],
  },
};

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

export { defaultClient };
