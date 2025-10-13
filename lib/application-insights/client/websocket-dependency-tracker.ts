import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket';

const interceptor = new WebSocketInterceptor();
interceptor.apply();
interceptor.on('connection', ({ client, server, info }) => {
  server.connect();
});
