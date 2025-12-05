import { ReactPlugin } from '@microsoft/applicationinsights-react-js';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { config } from '../config';
import { TelemetryLevel, telemetryLevel } from '../telemetry-level';
import { handleDependencyTelemetry } from './dependency-telemetry-handler';
// import './websocket-dependency-tracker';

declare global {
  const WorkerGlobalScope: { new (): unknown } | undefined;
}

function safeEval(predicate: () => boolean): boolean {
  try {
    return predicate();
  } catch (e) {
    return false;
  }
}

export let appInsights: ApplicationInsights;
if (config.connectionString) {
  const isWorkerProcess =
    typeof WorkerGlobalScope !== 'undefined' &&
    self instanceof WorkerGlobalScope;
  const defaultBrowserHistory = {
    url: '/',
    location: { pathname: '' as string | undefined },
    listen: () => {},
    state: undefined as { url: string } | undefined,
  };

  let browserHistory: typeof defaultBrowserHistory;
  if (!isWorkerProcess && typeof window !== 'undefined') {
    browserHistory = { ...defaultBrowserHistory, ...window.history };
    browserHistory.location.pathname = browserHistory?.state?.url;
  } else {
    browserHistory = { ...defaultBrowserHistory };
  }
  const reactPlugin = new ReactPlugin();
  const _appInsights = new ApplicationInsights({
    config: {
      disableTelemetry: !isWorkerProcess && typeof window === 'undefined',
      connectionString: config.connectionString,
      extensions: [reactPlugin],
      enableAutoRouteTracking: false,
      extensionConfig: {
        [reactPlugin.identifier]: { history: browserHistory },
      },
      maxAjaxCallsPerView: -1,
      maxBatchInterval: safeEval(() => window.location.hostname === 'localhost')
        ? 0
        : undefined,
      enableDebug: safeEval(() => window.location.hostname === 'localhost'),
    },
  });
  _appInsights.addDependencyInitializer((envelope) => {
    switch (telemetryLevel) {
      case TelemetryLevel.None:
        return false;
      case TelemetryLevel.Local:
        if (window.location.hostname !== 'localhost') {
          return false;
        }
        break;
      case TelemetryLevel.FailuresOnly: {
        // Ignore successful telemetry and matches/skill 404s
        if (envelope.item.success) {
          return false;
        } else {
          if (+envelope.item.responseCode === 404 && envelope.item.target) {
            try {
              const targetUrl = new URL(envelope.item.target);
              if (
                /\/matches\/[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\/skill$/.test(
                  targetUrl.pathname
                ) ||
                /playlist\/[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\/csrs/.test(
                  targetUrl.pathname
                )
              ) {
                // 404s for skill data are expected
                return false;
              }
            } catch (e) {
              // Invalid URLs should be processed as per usual
            }
          }
        }
        break;
      }
    }
    return true;
  });
  _appInsights.addDependencyInitializer((envelope) =>
    handleDependencyTelemetry(envelope, _appInsights)
  );

  if (isWorkerProcess || typeof window !== 'undefined') {
    _appInsights.loadAppInsights();
  }
  appInsights = _appInsights;
} else {
  // Create a no-op appInsights instance
  appInsights = new Proxy({} as ApplicationInsights, {
    get: (_target, _prop) => {
      return () => {};
    },
  });
}
