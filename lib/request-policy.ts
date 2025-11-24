import { isRequestError, requestPolicy } from '@gravllift/halo-helpers';

export const waypointXboxRequestPolicy = requestPolicy;

waypointXboxRequestPolicy.onFailure(async ({ reason }) => {
  if (
    'error' in reason &&
    isRequestError(reason.error) &&
    reason.error.response.headers.has('x-vercel-mitigated')
  ) {
    window.location.reload();
  }
});
