import { NextResponse, type NextMiddleware } from 'next/server';

// Only run on the one endpoint that requires a specific User-Agent header.
export const config = {
  matcher: '/proxy/settings.svc.halowaypoint.com/spartan-token',
};

export const middleware: NextMiddleware = async (request) => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    'user-agent',
    'HaloWaypoint/2021112313511900 CFNetwork/1327.0.4 Darwin/21.2.0'
  );
  requestHeaders.delete('origin');
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
};
