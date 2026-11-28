import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const compiled = new Map();

function loadWorkerModule(relativePath, workerClass, bindings = {}) {
  const file = path.resolve(__dirname, relativePath);
  if (!compiled.has(file)) {
    compiled.set(
      file,
      ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
        transformers: {
          before: [
            (context) => (source) => {
              const visit = (node) => {
                if (
                  ts.isPropertyAccessExpression(node) &&
                  ts.isMetaProperty(node.expression) &&
                  node.name.text === 'url'
                ) {
                  return ts.factory.createStringLiteral(
                    'http://localhost:3000/worker-host.ts',
                  );
                }
                return ts.visitEachChild(node, visit, context);
              };
              return ts.visitNode(source, visit);
            },
          ],
        },
      }).outputText,
    );
  }
  const exports = {};
  const run = new Function(
    'exports',
    'require',
    'Worker',
    'setTimeout',
    'clearTimeout',
    compiled.get(file),
  );
  run(
    exports,
    (name) => {
      if (name in bindings) return bindings[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    workerClass,
    setTimeout,
    clearTimeout,
  );
  return exports;
}

class WorkerStub extends EventTarget {
  static instances = [];
  postMessage = jest.fn();
  terminate = jest.fn();
  constructor() {
    super();
    WorkerStub.instances.push(this);
  }
  message(data) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

beforeEach(() => {
  WorkerStub.instances = [];
  jest.useFakeTimers();
});

afterEach(() => jest.useRealTimers());

it('fails stalled replay startup with a retryable error and terminates the worker', async () => {
  const { createReplayDecoder } = loadWorkerModule(
    './replay-decoder.ts',
    WorkerStub,
  );
  const decoder = createReplayDecoder();
  const pending = decoder.decode({}, [], {}, undefined, false);
  const rejected = expect(pending).rejects.toThrow(
    'did not start within 30 seconds',
  );
  await jest.advanceTimersByTimeAsync(30000);
  await rejected;
  expect(WorkerStub.instances[0].terminate).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('does not impose a parse timeout after the worker reports ready', async () => {
  const { createReplayDecoder } = loadWorkerModule(
    './replay-decoder.ts',
    WorkerStub,
  );
  const decoder = createReplayDecoder();
  const pending = decoder.decode({}, [], {}, undefined, false);
  const worker = WorkerStub.instances[0];
  worker.message({ type: 'ready' });
  await jest.advanceTimersByTimeAsync(120000);
  expect(worker.terminate).not.toHaveBeenCalled();
  worker.message({ type: 'result', data: { complete: true } });
  await expect(pending).resolves.toEqual({ complete: true });
  expect(jest.getTimerCount()).toBe(0);
  decoder.terminate();
});

it('handles a worker that was ready before decoding and older stage messages', async () => {
  const { createReplayDecoder } = loadWorkerModule(
    './replay-decoder.ts',
    WorkerStub,
  );
  const decoder = createReplayDecoder();
  const worker = WorkerStub.instances[0];
  worker.message({ type: 'ready' });
  const pending = decoder.decode({}, [], {}, undefined, false);
  expect(jest.getTimerCount()).toBe(0);
  worker.message({ type: 'result', data: {} });
  await pending;
  decoder.terminate();

  const legacy = createReplayDecoder();
  const onStage = jest.fn();
  const legacyPending = legacy.decode({}, [], {}, onStage, false);
  const legacyWorker = WorkerStub.instances[1];
  legacyWorker.message({ type: 'stage', stage: 'Parsing film...' });
  await jest.advanceTimersByTimeAsync(120000);
  expect(onStage).toHaveBeenCalledWith('Parsing film...');
  expect(legacyWorker.terminate).not.toHaveBeenCalled();
  legacyWorker.message({ type: 'result', data: {} });
  await legacyPending;
  legacy.terminate();
});

it('clears startup timers and listeners on cancellation', async () => {
  const { createReplayDecoder } = loadWorkerModule(
    './replay-decoder.ts',
    WorkerStub,
  );
  const decoder = createReplayDecoder();
  const abort = new AbortController();
  const pending = decoder.decode({}, [], {}, undefined, false, abort.signal);
  const rejected = expect(pending).rejects.toThrow('Canceled');
  abort.abort(new Error('Canceled'));
  await rejected;
  expect(WorkerStub.instances[0].terminate).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  decoder.terminate();
});

it('hard-stops leaderboard workers on unmount and reconnects replacements', async () => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'IS_REACT_ACT_ENVIRONMENT',
  );
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  class ResolvablePromise {
    constructor() {
      let resolve;
      let reject;
      const promise = new Promise((accept, decline) => {
        resolve = accept;
        reject = decline;
      });
      return Object.assign(promise, { resolve, reject });
    }
  }
  const { useLeaderboardProvider } = loadWorkerModule(
    '../leaderboard-provider/worker-leaderboard.ts',
    WorkerStub,
    {
      react: require('react'),
      '@gravllift/utilities': { ResolvablePromise },
      cockatiel: {
        handleAll: {},
        retry: () => ({ execute: (operation) => operation() }),
      },
    },
  );
  let provider;
  function Host() {
    provider = useLeaderboardProvider();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Host />));
    const first = WorkerStub.instances[0];
    const abort = new AbortController();
    const removeAbort = jest.spyOn(abort.signal, 'removeEventListener');
    const initial = provider.getGamertagIndex(
      'Spartan',
      undefined,
      undefined,
      abort.signal,
    );
    const rejected = expect(initial).rejects.toBe('restart');
    const callId = first.postMessage.mock.calls.at(-1)[0].callId;
    first.message({ callId, error: '"restart"', forceReload: true });
    await rejected;
    expect(removeAbort).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(first.terminate).toHaveBeenCalledTimes(1);
    const replacement = WorkerStub.instances[1];
    const next = provider.getGamertagIndex('Spartan');
    replacement.message({
      callId: replacement.postMessage.mock.calls.at(-1)[0].callId,
      result: 7,
    });
    await expect(next).resolves.toBe(7);
    act(() => root.unmount());
    expect(replacement.terminate).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    if (previous)
      Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previous);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
