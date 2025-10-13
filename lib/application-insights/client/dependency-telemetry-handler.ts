import { ResolvablePromise } from '@gravllift/utilities';
import { IDependencyInitializerDetails } from '@microsoft/applicationinsights-dependencies-js';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { BatchInterceptor } from '@mswjs/interceptors';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import ExpiryMap from 'expiry-map';
import ExpirySet from 'expiry-set';
import { Duration } from 'luxon';

// Persist HTTP bodies for 10 minutes or until application insights
// logs them
const data = new ExpiryMap<
  string,
  ResolvablePromise<{
    request: { headers: Headers; body: string };
    response: { headers: Headers; body: string };
  }>
>(10 * 60 * 1000);
// Track which requests have been handled for 10 minutes, then forget
const handledRequests = new ExpirySet<string>(10 * 60 * 1000);

const interceptor = new BatchInterceptor({
  name: 'dependency-body-processing-interceptor',
  interceptors: [new FetchInterceptor(), new XMLHttpRequestInterceptor()],
});

interceptor.apply();
interceptor.on('response', async ({ request, response }) => {
  const appInsightsId = request.headers.get('request-id');
  if (appInsightsId) {
    let dataPromise = data.get(appInsightsId);

    if (!dataPromise) {
      dataPromise = new ResolvablePromise();
      data.set(appInsightsId, dataPromise);
    }

    if (dataPromise.isCompleted) {
      return;
    }

    dataPromise.resolve({
      request: {
        headers: request.headers,
        body: await request.clone().text(),
      },
      response: {
        headers: response.headers,
        body: await response.clone().text(),
      },
    });
  }
});

export const handleDependencyTelemetry = (
  envelope: IDependencyInitializerDetails,
  telemetryClient: ApplicationInsights
) => {
  let shouldSubmitTelemetry = true;
  if (['Http', 'Fetch'].includes(envelope.item.type as string)) {
    const requestId = envelope.item.id;

    if (!handledRequests.has(requestId)) {
      let dataPromise = data.get(requestId);
      if (!dataPromise) {
        dataPromise = new ResolvablePromise();
        data.set(requestId, dataPromise);
      }

      dataPromise.then(({ request, response }) => {
        const existingTelemetry = envelope.item;
        request.headers.forEach((value, key) => {
          if (!existingTelemetry.properties) {
            existingTelemetry.properties = {};
          }
          existingTelemetry.properties[`http.request.header.${key}`] = value;
        });
        response.headers.forEach((value, key) => {
          if (!existingTelemetry.properties) {
            existingTelemetry.properties = {};
          }
          existingTelemetry.properties[`http.response.header.${key}`] = value;
        });
        telemetryClient.trackDependencyData({
          ...existingTelemetry,
          name: existingTelemetry.name ?? envelope.item.name ?? '',
          startTime: envelope.item.startTime
            ? new Date(envelope.item.startTime)
            : undefined,
          type: existingTelemetry.type ?? envelope.item.type,
          duration:
            typeof existingTelemetry.duration === 'string'
              ? Duration.fromISOTime(
                  existingTelemetry.duration as string
                ).toMillis()
              : (existingTelemetry.duration as number),
          properties: {
            ...existingTelemetry.properties,
            'http.request.body': request.body,
            'http.response.body': response.body,
          },
        });
      });
      // Don't submit telemetry until response has been read
      shouldSubmitTelemetry = false;

      // Request has been handled, ignore future telemetry
      handledRequests.add(requestId);
    }
  }

  return shouldSubmitTelemetry;
};
