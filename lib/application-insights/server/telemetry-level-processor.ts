import { TraceFlags } from '@opentelemetry/api';
import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { TelemetryLevel, telemetryLevel } from '../telemetry-level';

// Determine if this process is running in a local developer environment.
// Combines common environment flags and (if present) OTEL resource attributes
// to avoid hard-coding a specific machine name.
function isLocalDev(span?: ReadableSpan): boolean {
  // 1) Prefer explicit deployment environment if provided via OTEL resource
  const res = span?.resource?.attributes as Record<string, unknown> | undefined;
  const deploymentEnv = (res?.['deployment.environment'] ?? res?.['env']) as
    | string
    | undefined;
  if (
    typeof deploymentEnv === 'string' &&
    /^(local|dev|development)$/i.test(deploymentEnv)
  ) {
    return true;
  }

  // 2) Common process environment flags
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  if (nodeEnv === 'development' || nodeEnv === 'dev') return true;

  const azFuncEnv = (
    process.env.AZURE_FUNCTIONS_ENVIRONMENT || ''
  ).toLowerCase();
  if (azFuncEnv === 'development') return true;

  if (
    process.env.VERCEL === '1' &&
    (process.env.VERCEL_ENV || '').toLowerCase() === 'development'
  )
    return true;

  const appEnv = (
    process.env.APP_ENV ||
    process.env.DEPLOYMENT_ENV ||
    ''
  ).toLowerCase();
  if (appEnv === 'local' || appEnv === 'development' || appEnv === 'dev')
    return true;

  // 3) Default: not local
  return false;
}
export class TelemetryLevelProcessor implements SpanProcessor {
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  onStart(): void {}
  onEnd(span: ReadableSpan): void {
    switch (telemetryLevel) {
      case TelemetryLevel.None: {
        span.spanContext().traceFlags = TraceFlags.NONE;
        break;
      }
      case TelemetryLevel.Local: {
        // Only keep telemetry while running locally on any developer machine
        if (!isLocalDev(span)) {
          span.spanContext().traceFlags = TraceFlags.NONE;
        }
        break;
      }
      case TelemetryLevel.FailuresOnly: {
        // Ignore successful dependency/request telemetry and expected 404s for matches/skill
        const attrs = span.attributes;

        // Prefer legacy semantic key, fall back to newer http.response.status_code if present
        const rawStatus =
          (attrs['http.status_code'] as number | string | undefined) ??
          (attrs['http.response.status_code'] as number | string | undefined);

        // If we have a status code, apply filtering rules
        if (rawStatus !== undefined && rawStatus !== null) {
          const statusCode =
            typeof rawStatus === 'string' ? parseInt(rawStatus, 10) : rawStatus;
          if (!Number.isNaN(statusCode)) {
            // Drop successful telemetry (< 400)
            if (statusCode < 400) {
              span.spanContext().traceFlags = TraceFlags.NONE;
              break;
            }

            // Drop expected 404s for /matches/{uuid}/skill
            if (statusCode === 404) {
              let path: string | undefined;
              if (typeof attrs['http.target'] === 'string')
                path = attrs['http.target'] as string;
              else if (typeof attrs['http.route'] === 'string')
                path = attrs['http.route'] as string;
              else if (typeof attrs['http.url'] === 'string') {
                try {
                  path = new URL(attrs['http.url'] as string).pathname;
                } catch {
                  // ignore invalid URL
                }
              }

              if (
                path &&
                (/\/matches\/[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\/skill$/.test(
                  path
                ) ||
                  /playlist\/[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\/csrs/.test(
                    path
                  ))
              ) {
                span.spanContext().traceFlags = TraceFlags.NONE;
                break;
              }
            }
          }
        }
        break;
      }
    }
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
