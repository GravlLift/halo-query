import { isRequestError, requestPolicy } from '@gravllift/halo-helpers';

export const waypointXboxRequestPolicy = requestPolicy;

waypointXboxRequestPolicy.onFailure(async ({ reason }) => {
  if (
    'error' in reason &&
    isRequestError(reason.error) &&
    reason.error.response.headers.has('x-vercel-mitigated')
  ) {
    const searchParams = new URLSearchParams(location.search);
    if (!searchParams.has('force-reload')) {
      searchParams.set('force-reload', '1');
      location.search = searchParams.toString();
    } else {
      console.error(
        'Request failed due to Vercel mitigation, but force-reload was already attempted.'
      );
    }
  }
});
