import { ResolvablePromise } from '@gravllift/utilities';
import { BatchInterceptor } from '@mswjs/interceptors';
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import {
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import { HttpRequestCustomAttributeFunction } from '@opentelemetry/instrumentation-http';
import { RequestHookFunction } from '@opentelemetry/instrumentation-undici';
import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_HTTP_REQUEST_HEADER,
  ATTR_HTTP_RESPONSE_HEADER,
} from '@opentelemetry/semantic-conventions';
import ExpiryMap from 'expiry-map';
import { ClientRequest } from 'http';

// Persist HTTP bodies for 10 minutes
type RequestResponseData = {
  request: { body: string };
  response: { body: string; headers: Headers };
};

export class DependencyBodyProcessor implements SpanProcessor {
  private hostnameRequestIdMap = new ExpiryMap<string, string[]>(
    10 * 60 * 1000
  );
  private dependencyCompletePromises = new ExpiryMap<
    string,
    ResolvablePromise<RequestResponseData>
  >(10 * 60 * 1000);
  private spanCompletePromises = new ExpiryMap<
    string,
    ResolvablePromise<ReadableSpan>
  >(10 * 60 * 1000);
  private dependencyHandledPromises: Promise<void>[] = [];

  constructor() {
    const interceptor = new BatchInterceptor({
      name: 'dependency-body-processing-interceptor',
      interceptors: [new ClientRequestInterceptor(), new FetchInterceptor()],
    });

    interceptor.apply();
    interceptor.on('request', async ({ request, requestId }) => {
      request.headers.set('msw-request-id', requestId);
      const hostname = new URL(request.url).hostname;
      const hostnameRequestMapEntry =
        this.hostnameRequestIdMap.get(hostname) ?? [];
      hostnameRequestMapEntry.push(requestId);
      this.hostnameRequestIdMap.set(hostname, hostnameRequestMapEntry);
    });
    interceptor.on('response', async ({ request, response, requestId }) => {
      const completionPromise = this.dependencyCompletePromises.get(requestId);

      if (!completionPromise) {
        return;
      }

      const clonedResponse = response.clone();

      Promise.all([request.text(), clonedResponse.text()])
        .then(([requestBody, responseBody]) => {
          completionPromise.resolve({
            request: {
              body: requestBody,
            },
            response: {
              headers: response.headers,
              body: responseBody,
            },
          });
        })
        .catch((err) => {
          completionPromise.reject(err);
        });
    });
    interceptor.on('unhandledException', ({ requestId, error }) => {
      this.dependencyCompletePromises.get(requestId)?.reject(error);
      throw error; // https://github.com/mswjs/interceptors?tab=readme-ov-file#error-handling
    });

    // TODO: Add handler for node errors:
    // https://github.com/mswjs/interceptors/issues/667
  }

  async forceFlush() {
    await Promise.race([
      Promise.all(this.dependencyHandledPromises),
      new Promise<void>((resolve) => setTimeout(() => resolve(), 5000)),
    ]);
  }

  requestHook: HttpRequestCustomAttributeFunction & RequestHookFunction = (
    span,
    request
  ) => {
    let headers: [string, string | undefined][];

    if (request instanceof ClientRequest) {
      const headerNames = request.getHeaderNames();
      headers = [];
      for (const headerName of headerNames) {
        const headerValueRaw = request.getHeader(headerName);
        headers.push([headerName, headerValueRaw?.toString()]);
      }
    } else if (typeof request.headers === 'string') {
      headers = request.headers
        .split('\r\n')
        .map((header) => header.split(': ') as [string, string]);
    } else if (Array.isArray(request.headers)) {
      headers = request.headers.map(
        (header) => header.split(': ') as [string, string]
      );
    } else {
      headers = Object.entries(request.headers).map(([key, value]) => [
        key,
        value?.toString(),
      ]);
    }

    let mswRequestId: string | undefined;

    for (const header of headers) {
      const [key, value] = header;

      if (!value) {
        continue;
      }

      if (key === 'msw-request-id') {
        mswRequestId = value;
      }

      span.setAttribute(ATTR_HTTP_REQUEST_HEADER(key.toLowerCase()), value);
    }

    if (!mswRequestId) {
      throw new Error('msw-request-id not found');
    }

    this.prepareResponseHandler(mswRequestId, span);
  };

  private prepareResponseHandler(mswRequestId: string, span: Span) {
    if (!this.dependencyCompletePromises.has(mswRequestId)) {
      const spanContext = span.spanContext();

      const dependencyCompletePromise =
        new ResolvablePromise<RequestResponseData>();
      this.dependencyCompletePromises.set(
        mswRequestId,
        dependencyCompletePromise
      );

      const spanCompletePromise = new ResolvablePromise<ReadableSpan>();
      this.spanCompletePromises.set(spanContext.spanId, spanCompletePromise);

      const dependencyHandledPromise = dependencyCompletePromise
        .then(async ({ request, response }) => {
          const readableSpan = await spanCompletePromise;
          // Now that we have all attributes, clone the span
          const newSpan = copySpan(readableSpan);

          if (request.body) {
            newSpan.setAttribute('http.request.body', request.body);
          }
          if (response.body) {
            newSpan.setAttribute('http.response.body', response.body);
          }

          for (const [key, value] of Object.entries(response.headers)) {
            if (value == null) {
              continue;
            }
            newSpan.setAttribute(
              ATTR_HTTP_RESPONSE_HEADER(key.toLowerCase()),
              value
            );
          }

          newSpan.end(readableSpan.endTime);
        })
        .catch(async (err) => {
          const readableSpan = await spanCompletePromise;
          const newSpan = copySpan(readableSpan);
          newSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
          newSpan.end(readableSpan.endTime);
        })
        .finally(async () => {
          const readableSpan = await spanCompletePromise;
          const httpUrl = readableSpan.attributes['http.url'];
          if (typeof httpUrl === 'string') {
            const hostname = new URL(httpUrl).hostname;
            const hostnameRequestMapEntry =
              this.hostnameRequestIdMap.get(hostname);
            if (hostnameRequestMapEntry) {
              const remainingHostnameRequests = hostnameRequestMapEntry.filter(
                (id) => id !== mswRequestId
              );
              if (remainingHostnameRequests.length === 0) {
                this.hostnameRequestIdMap.delete(hostname);
              } else {
                this.hostnameRequestIdMap.set(
                  hostname,
                  remainingHostnameRequests
                );
              }
            }
          }
          this.dependencyCompletePromises.delete(mswRequestId);
          this.spanCompletePromises.delete(spanContext.spanId);
          this.dependencyHandledPromises.splice(
            this.dependencyHandledPromises.indexOf(dependencyHandledPromise),
            1
          );
        });
      this.dependencyHandledPromises.push(dependencyHandledPromise);
    } else {
      throw new Error('Span ID already exists');
    }
  }

  onStart(_: Span): void {}
  onEnd(span: ReadableSpan) {
    if (span.kind !== SpanKind.CLIENT) {
      return;
    }

    const spanContext = span.spanContext();
    const spanPromise = this.spanCompletePromises.get(spanContext.spanId);

    if (!spanPromise || spanPromise.isCompleted) {
      // Span is either not relevant or is ready to be exported
      return;
    }

    // Setting flag to NONE will prevent the BatchSpanProcessor at the end of the
    // pipeline from exporting the span before we have all attributes
    spanContext.traceFlags = TraceFlags.NONE;
    spanPromise.resolve(span);
  }
  shutdown() {
    return Promise.resolve();
  }
}

function copySpan(existingSpan: ReadableSpan): Span {
  const tracer = trace.getTracer('lightspeed');
  const newSpan = tracer.startSpan(existingSpan.name, {
    attributes: existingSpan.attributes,
    kind: existingSpan.kind,
    links: existingSpan.links,
    startTime: existingSpan.startTime,
  });
  newSpan.setStatus(existingSpan.status);
  for (const event of existingSpan.events) {
    newSpan.addEvent(event.name, event.attributes, event.time);
  }
  const newSpanContext = newSpan.spanContext();
  newSpanContext.spanId = existingSpan.spanContext().spanId;
  newSpanContext.traceId = existingSpan.spanContext().traceId;
  return newSpan;
}
