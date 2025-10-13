import { TraceFlags } from '@opentelemetry/api';
import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { TelemetryLevel, telemetryLevel } from '../telemetry-level';
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
        if (span.resource.attributes['host.name'] !== 'Tranquility') {
          span.spanContext().traceFlags = TraceFlags.NONE;
        }
        break;
      }
      case TelemetryLevel.FailuresOnly: {
        // TODO:
        break;
      }
    }
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
