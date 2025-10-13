import { NextResponse, type NextMiddleware } from 'next/server';

export const config = {
  matcher: '/proxy/:path*',
};

export const middleware: NextMiddleware = async (request, _event) => {
  const url = new URL(request.url);

  const [, , host, ...pathParts] = url.pathname.split('/');

  if (['login.live.com', 'user.auth.xboxlive.com'].includes(host)) {
    return NextResponse.next();
  }

  const path = pathParts.join('/');
  const requestHeaders = new Headers(request.headers);

  if (host === 'settings.svc.halowaypoint.com' && path === 'spartan-token') {
    requestHeaders.set(
      'user-agent',
      'HaloWaypoint/2021112313511900 CFNetwork/1327.0.4 Darwin/21.2.0'
    );
  }
  requestHeaders.delete('origin');
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
};
