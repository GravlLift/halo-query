export async function getTokenPersister() {
  if (typeof window === 'undefined') {
    const { tokenPersister } = await import('./server');
    return tokenPersister;
  } else {
    const { tokenPersister } = await import('./client');
    return tokenPersister;
  }
}
