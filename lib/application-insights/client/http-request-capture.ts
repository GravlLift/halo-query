export type CapturedHttpExchange = {
  request: { headers: Headers; body: string };
  response: { headers: Headers; body: string };
};

type ExchangeHandler = (
  requestId: string,
  exchange: CapturedHttpExchange,
) => void;

type XMLHttpRequestState = {
  headers: [string, string][];
  body: Document | XMLHttpRequestBodyInit | null;
};

let installed = false;

export function installHttpRequestCapture(onExchange: ExchangeHandler): void {
  if (installed) {
    return;
  }
  installed = true;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const requestId = request.headers.get('request-id');
    const requestBody = request
      .clone()
      .text()
      .catch(() => '');
    const response = await originalFetch.call(globalThis, request);

    if (requestId) {
      void Promise.all([
        requestBody,
        response
          .clone()
          .text()
          .catch(() => ''),
      ])
        .then(([requestText, responseText]) => {
          onExchange(requestId, {
            request: {
              headers: new Headers(request.headers),
              body: requestText,
            },
            response: {
              headers: new Headers(response.headers),
              body: responseText,
            },
          });
        })
        .catch(() => {});
    }

    return response;
  };

  if (typeof XMLHttpRequest === 'undefined') {
    return;
  }

  const states = new WeakMap<XMLHttpRequest, XMLHttpRequestState>();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    states.set(this, { headers: [], body: null });
    if (async === undefined) {
      return originalOpen.call(this, method, url, true, null, null);
    }
    return originalOpen.call(this, method, url, async, username, password);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    const result = originalSetRequestHeader.call(this, name, value);
    states.get(this)?.headers.push([name, value]);
    return result;
  };

  XMLHttpRequest.prototype.send = function (body) {
    const state = states.get(this);
    if (state) {
      state.body = body ?? null;
      this.addEventListener(
        'loadend',
        () => {
          const requestHeaders = new Headers();
          for (const [name, value] of state.headers) {
            requestHeaders.append(name, value);
          }
          const requestId = requestHeaders.get('request-id');
          if (!requestId) {
            return;
          }

          void Promise.all([
            bodyToText(state.body),
            xhrResponseBodyToText(this),
          ])
            .then(([requestText, responseText]) => {
              const responseHeaders = new Headers();
              for (const line of this.getAllResponseHeaders()
                .trim()
                .split(/[\r\n]+/)) {
                const separator = line.indexOf(':');
                if (separator > 0) {
                  responseHeaders.append(
                    line.slice(0, separator).trim(),
                    line.slice(separator + 1).trim(),
                  );
                }
              }
              onExchange(requestId, {
                request: { headers: requestHeaders, body: requestText },
                response: { headers: responseHeaders, body: responseText },
              });
            })
            .catch(() => {});
        },
        { once: true },
      );
    }
    return originalSend.call(this, body);
  };
}

async function bodyToText(
  body: Document | XMLHttpRequestBodyInit | null,
): Promise<string> {
  if (body == null) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof Blob) {
    return body.text();
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body);
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (body instanceof FormData) {
    return new Response(body).text();
  }
  return new XMLSerializer().serializeToString(body);
}

async function xhrResponseBodyToText(request: XMLHttpRequest): Promise<string> {
  try {
    if (request.response instanceof Blob) {
      return request.response.text();
    }
    if (request.response instanceof ArrayBuffer) {
      return new TextDecoder().decode(request.response);
    }
    if (request.response instanceof Document) {
      return new XMLSerializer().serializeToString(request.response);
    }
    return request.responseText;
  } catch {
    return '';
  }
}
