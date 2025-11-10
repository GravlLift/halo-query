export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/application-insights/server');

    if (process.env.HTTP_PROXY) {
      const undici = await import('undici');
      undici.setGlobalDispatcher(new undici.ProxyAgent(process.env.HTTP_PROXY));
    }
  }
}
