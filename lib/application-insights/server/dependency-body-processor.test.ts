/** @jest-environment node */
import { ResolvablePromise } from '@gravllift/utilities';
import { SpanKind, trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { createServer, request } from 'http';
import type { IncomingMessage, Server } from 'http';
import { DependencyBodyProcessor } from './dependency-body-processor';

describe('DependencyBodyProcessor HTTP body capture', () => {
  const originalFetch = globalThis.fetch;
  let processor: DependencyBodyProcessor;
  let server: Server;

  beforeEach(async () => {
    processor = new DependencyBodyProcessor();
    server = createServer((incoming, response) => {
      incoming.resume();
      incoming.once('end', () => {
        response.setHeader('content-type', 'text/plain');
        response.end('response body');
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    trace.disable();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    jest.useRealTimers();
  });

  function prepareRequest() {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    const outgoing = request({
      hostname: '127.0.0.1',
      port: address.port,
      method: 'POST',
    });
    const completion = new ResolvablePromise<{
      request: { body: string };
      response: { body: string; headers: Headers };
    }>();
    processor['dependencyCompletePromises'].set('test', completion);
    processor['captureClientRequest'](outgoing, 'test');
    const response = new Promise<IncomingMessage>((resolve) =>
      outgoing.once('response', resolve),
    );
    return { outgoing, response, completion };
  }

  it('captures both bodies without consuming a response before its caller', async () => {
    const {
      outgoing,
      response: responsePromise,
      completion,
    } = prepareRequest();
    outgoing.write('request ');
    outgoing.end('body');
    const response = await responsePromise;
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(response.readableEnded).toBe(false);

    const chunks: Buffer[] = [];
    for await (const chunk of response) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('response body');
    const captured = await completion;
    expect(captured.request.body).toBe('request body');
    expect(captured.response.body).toBe('response body');
    expect(captured.response.headers.get('content-type')).toBe('text/plain');
    processor['dependencyCompletePromises'].delete('test');
  });

  it('completes capture when an unread response is closed', async () => {
    const {
      outgoing,
      response: responsePromise,
      completion,
    } = prepareRequest();
    outgoing.end('request body');
    const response = await responsePromise;
    response.destroy();
    const captured = await completion;
    expect(captured.request.body).toBe('request body');
    expect(captured.response.body).toBe('');
    processor['dependencyCompletePromises'].delete('test');
  });

  it('stops waiting for an unfinished request', async () => {
    jest.useFakeTimers();
    const { outgoing, completion } = prepareRequest();
    outgoing.write('partial');
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect((await completion).request.body).toBe('partial');
    processor['dependencyCompletePromises'].delete('test');
    outgoing.destroy();
    jest.useRealTimers();
  });

  it('exports captured bodies on the dependency span', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [processor, new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
    const span = provider.getTracer('test').startSpan('request', {
      kind: SpanKind.CLIENT,
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address');
    const outgoing = request({
      hostname: '127.0.0.1',
      port: address.port,
      method: 'POST',
    });
    processor.requestHook(span, outgoing);
    const handled = processor['dependencyHandledPromises'][0];
    const responsePromise = new Promise<IncomingMessage>((resolve) =>
      outgoing.once('response', resolve),
    );
    outgoing.end('request body');
    const response = await responsePromise;
    for await (const chunk of response) expect(chunk).toBeDefined();
    span.end();
    await handled;

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].attributes['http.request.body']).toBe('request body');
    expect(spans[0].attributes['http.response.body']).toBe('response body');
    await provider.shutdown();
  });

  it('cleans up tracking when a span never ends', async () => {
    jest.useFakeTimers();
    const span = trace.getTracer('test').startSpan('unfinished');
    processor['prepareResponseHandler']('unfinished', span);
    const handled = processor['dependencyHandledPromises'][0];
    jest.advanceTimersByTime(6 * 60 * 1000);
    await handled;
    expect(processor['dependencyCompletePromises'].has('unfinished')).toBe(
      false,
    );
    expect(
      processor['spanCompletePromises'].has(span.spanContext().spanId),
    ).toBe(false);
    expect(processor['dependencyHandledPromises']).toHaveLength(0);
    jest.useRealTimers();
  });
});
