import { ResolvablePromise } from '@gravllift/utilities';
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
import { randomUUID } from 'crypto';
import {
  ATTR_HTTP_REQUEST_HEADER,
  ATTR_HTTP_RESPONSE_HEADER,
} from '@opentelemetry/semantic-conventions';
import ExpiryMap from 'expiry-map';
import { ClientRequest } from 'http';

const REQUEST_ID_HEADER = 'x-halo-query-request-id';

// Persist HTTP bodies for 10 minutes
type RequestResponseData = {
  request: { body: string };
  response: { body: string; headers: Headers };
};

export class DependencyBodyProcessor implements SpanProcessor {
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
    this.installFetchCapture();
  }

  async forceFlush() {
    await Promise.race([
      Promise.all(this.dependencyHandledPromises),
      new Promise<void>((resolve) => setTimeout(() => resolve(), 5000)),
    ]);
  }

  requestHook: HttpRequestCustomAttributeFunction & RequestHookFunction = (
    span,
    request,
  ) => {
    let headers: [string, string | undefined][];
    let requestId: string | undefined;

    if (request instanceof ClientRequest) {
      requestId = randomUUID();
      request.setHeader(REQUEST_ID_HEADER, requestId);
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
      headers = [];
      for (let index = 0; index < request.headers.length; index += 1) {
        const header = request.headers[index];
        if (Array.isArray(header)) {
          const [key, ...values] = header;
          headers.push([key.split(': ')[0], JSON.stringify(values)]);
        } else if (header.includes(': ')) {
          const [key, ...value] = header.split(': ');
          headers.push([key, value.join(': ')]);
        } else {
          const value = request.headers[index + 1];
          if (typeof value === 'string' || Array.isArray(value)) {
            headers.push([
              header,
              Array.isArray(value) ? JSON.stringify(value) : value,
            ]);
            index += 1;
          }
        }
      }
    } else {
      headers = Object.entries(request.headers).map(([key, value]) => [
        key,
        value?.toString(),
      ]);
    }

    for (const header of headers) {
      const [key, value] = header;

      if (!value) {
        continue;
      }

      if (key.toLowerCase() === REQUEST_ID_HEADER) {
        requestId = value;
      }

      span.setAttribute(ATTR_HTTP_REQUEST_HEADER(key.toLowerCase()), value);
    }

    if (!requestId) {
      // If the capture wrapper didn't annotate this request, skip body processing
      // but still record available headers to avoid breaking instrumentation.
      return;
    }

    this.prepareResponseHandler(requestId, span);
    if (request instanceof ClientRequest) {
      this.captureClientRequest(request, requestId);
    }
  };

  private installFetchCapture() {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const requestId = randomUUID();
      request.headers.set(REQUEST_ID_HEADER, requestId);
      const requestBodyPromise = request
        .clone()
        .text()
        .catch(() => '');

      try {
        const response = await originalFetch.call(globalThis, request);
        const completionPromise =
          this.dependencyCompletePromises.get(requestId);
        if (completionPromise) {
          void Promise.all([
            requestBodyPromise,
            response
              .clone()
              .text()
              .catch(() => ''),
          ])
            .then(([requestBody, responseBody]) => {
              completionPromise.resolve({
                request: { body: requestBody },
                response: {
                  headers: new Headers(response.headers),
                  body: responseBody,
                },
              });
            })
            .catch((error: Error) => completionPromise.reject(error));
        }
        return response;
      } catch (error) {
        this.dependencyCompletePromises.get(requestId)?.reject(error);
        throw error;
      }
    };
  }

  private captureClientRequest(request: ClientRequest, requestId: string) {
    const requestBodyChunks: Buffer[] = [];
    const responseBodyChunks: Buffer[] = [];
    let responseHeaders = new Headers();
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(captureTimeout);
      const completionPromise = this.dependencyCompletePromises.get(requestId);
      if (error) {
        completionPromise?.reject(error);
      } else {
        completionPromise?.resolve({
          request: { body: Buffer.concat(requestBodyChunks).toString() },
          response: {
            headers: responseHeaders,
            body: Buffer.concat(responseBodyChunks).toString(),
          },
        });
      }
    };
    const captureTimeout = setTimeout(() => finish(), 5 * 60 * 1000);
    captureTimeout.unref();
    const originalWrite = request.write;
    Object.defineProperty(request, 'write', {
      value: (...args: unknown[]) => {
        const [chunk] = args;
        if (
          !finished &&
          (typeof chunk === 'string' || chunk instanceof Uint8Array)
        ) {
          requestBodyChunks.push(Buffer.from(chunk));
        }
        return Reflect.apply(originalWrite, request, args);
      },
    });

    const originalEnd = request.end;
    Object.defineProperty(request, 'end', {
      value: (...args: unknown[]) => {
        const [chunk] = args;
        if (
          !finished &&
          (typeof chunk === 'string' || chunk instanceof Uint8Array)
        ) {
          requestBodyChunks.push(Buffer.from(chunk));
        }
        return Reflect.apply(originalEnd, request, args);
      },
    });

    request.once('response', (response) => {
      responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) {
          for (const entry of value) {
            responseHeaders.append(name, entry);
          }
        } else if (value !== undefined) {
          responseHeaders.append(name, value);
        }
      }
      response.emit = new Proxy(response.emit, {
        apply(target, thisArg, args) {
          const [event, chunk] = args;
          if (
            !finished &&
            event === 'data' &&
            (typeof chunk === 'string' || chunk instanceof Uint8Array)
          ) {
            responseBodyChunks.push(Buffer.from(chunk));
          }
          return Reflect.apply(target, thisArg, args);
        },
      });
      response.once('end', () => finish());
      response.once('close', () => finish());
      response.once('error', (error) => finish(error));
    });
    request.once('error', (error) => finish(error));
  }

  private prepareResponseHandler(requestId: string, span: Span) {
    if (!this.dependencyCompletePromises.has(requestId)) {
      const spanContext = span.spanContext();

      const dependencyCompletePromise =
        new ResolvablePromise<RequestResponseData>();
      this.dependencyCompletePromises.set(requestId, dependencyCompletePromise);

      const spanCompletePromise = new ResolvablePromise<ReadableSpan>();
      this.spanCompletePromises.set(spanContext.spanId, spanCompletePromise);

      const timedOut = Symbol('timedOut');
      let timeoutHandle: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<typeof timedOut>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(timedOut), 6 * 60 * 1000);
        timeoutHandle.unref();
      });
      const bodyResult = dependencyCompletePromise.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      const dependencyHandledPromise = Promise.all([
        Promise.race([bodyResult, timeoutPromise]),
        Promise.race([spanCompletePromise, timeoutPromise]),
      ])
        .then(([result, readableSpan]) => {
          if (readableSpan === timedOut) return;
          const newSpan = copySpan(readableSpan);

          if (result !== timedOut && 'value' in result) {
            const { request, response } = result.value;
            if (request.body) {
              newSpan.setAttribute('http.request.body', request.body);
            }
            if (response.body) {
              newSpan.setAttribute('http.response.body', response.body);
            }

            response.headers.forEach((value, key) => {
              newSpan.setAttribute(
                ATTR_HTTP_RESPONSE_HEADER(key.toLowerCase()),
                value,
              );
            });
          } else if (result !== timedOut && 'error' in result) {
            newSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message:
                result.error instanceof Error
                  ? result.error.message
                  : String(result.error),
            });
          }

          newSpan.end(readableSpan.endTime);
        })
        .finally(() => {
          clearTimeout(timeoutHandle);
          this.dependencyCompletePromises.delete(requestId);
          this.spanCompletePromises.delete(spanContext.spanId);
          this.dependencyHandledPromises.splice(
            this.dependencyHandledPromises.indexOf(dependencyHandledPromise),
            1,
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
