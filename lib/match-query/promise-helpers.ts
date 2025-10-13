export type PromiseFulfilledResultValues<
  T extends readonly PromiseSettledResult<unknown>[]
> = {
  [P in keyof T]: T[P] extends PromiseSettledResult<infer U>
    ? PromiseFulfilledResult<U>['value']
    : never;
};

export function handleAllSettled(
  rejectionPredicate: Parameters<PromiseRejectedResult[]['find']>[0]
) {
  return <T extends readonly PromiseSettledResult<unknown>[]>(
    results: T
  ): PromiseFulfilledResultValues<T> => {
    const rejections = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (rejections.length) {
      const priorityRejection = rejections.find(rejectionPredicate);

      if (priorityRejection) {
        throw priorityRejection.reason;
      }

      // Otherwise just throw the first error in the stack
      throw rejections[0].reason;
    }
    return results
      .filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled')
      .map((r) => r.value) as PromiseFulfilledResultValues<T>;
  };
}

export const nextRedirectRejectionHandler = handleAllSettled(
  (r) => r.reason instanceof Error && r.reason.message === 'NEXT_REDIRECT'
);
