import { NextRequest } from 'next/server';

export async function proxyFetch(target: URL, request: NextRequest) {
  const response = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.body,
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
