import { NextRequest } from 'next/server';

/**
 * Proxies a request to a target URL. Optionally allows overriding the JSON body.
 * If overrideBody is provided it will be JSON stringified and Content-Type / Content-Length headers adjusted.
 */
export async function proxyFetch(
  target: URL,
  request: NextRequest,
  overrideBody?: unknown
) {
  let headers = new Headers(request.headers);
  headers.delete('origin');
  let body: BodyInit | undefined;

  if (overrideBody !== undefined) {
    const json = JSON.stringify(overrideBody);
    body = json;
    headers.set('Content-Type', 'application/json');
    // Remove any existing content-length; fetch will set it automatically for node >=18 when using undici
    headers.delete('Content-Length');
  } else {
    body = request.body as any; // streaming body passthrough
  }

  const response = await fetch(target, {
    method: request.method,
    headers,
    body,
    duplex: 'half',
  } as RequestInit);

  // Create a new response object with the same status and headers as the original response
  const newResponse = new Response(response.body, response);

  // Set the CORS headers to allow cross-origin requests
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  newResponse.headers.set('Access-Control-Allow-Headers', '*');
  newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
  newResponse.headers.set('Access-Control-Max-Age', '3600');

  return newResponse;
}
