import { isRequestError } from '@gravllift/halo-helpers';
import { DelegateBackoff, handleType, retry } from 'cockatiel';

export const waypointXboxRequestPolicy = retry(
  handleType(
    TypeError,
    (err) =>
      err.message === 'NetworkError when attempting to fetch resource.' ||
      err.message === 'Failed to fetch' ||
      err.message === 'Load failed'
  ).orWhen(
    (err) =>
      isRequestError(err) &&
      (err.response.status >= 500 ||
        err.response.status === 401 ||
        err.response.status === 0 ||
        err.response.status === 429)
  ),
  {
    maxAttempts: 3,
    backoff: new DelegateBackoff((context) => {
      if ('error' in context.result) {
        if (context.result.error instanceof TypeError) {
          // Add a little delay if the request failed due to a network error
          return 500;
        }

        if (isRequestError(context.result.error)) {
          if (context.result.error.response.status === 0) {
            // Add a little delay if the request failed due to a network error
            return 500;
          } else if (context.result.error.response.status === 429) {
            const retryAfter =
              context.result.error.response.headers.get('Retry-After');
            if (retryAfter) {
              const retryAfterSeconds = parseInt(retryAfter, 10);
              if (!isNaN(retryAfterSeconds)) {
                return retryAfterSeconds * 1000;
              }
            }
          }
        }
      }

      return 0;
    }),
  }
);

waypointXboxRequestPolicy.onFailure(async ({ reason }) => {
  if (
    'error' in reason &&
    isRequestError(reason.error) &&
    reason.error.response.headers.has('x-vercel-mitigated')
  ) {
    window.location.reload();
  }
});
