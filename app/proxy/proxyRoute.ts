import { NextRequest } from 'next/server';

export async function proxyFetch(target: URL, request: NextRequest) {
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.delete('host');
  upstreamHeaders.delete('content-length');
  upstreamHeaders.set('accept-encoding', 'identity');

  const response = await fetch(target, {
    method: request.method,
    headers: upstreamHeaders,
    body: request.body,
    duplex: 'half',
  } as RequestInit);

  // Avoid forwarding transfer-specific headers that can mismatch after proxying.
  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (
      key.toLowerCase() !== 'content-encoding' &&
      key.toLowerCase() !== 'content-length' &&
      key.toLowerCase() !== 'transfer-encoding'
    ) {
      responseHeaders.set(key, value);
    }
  });

  // Create a new response object with the same status and normalized headers.
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });

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
