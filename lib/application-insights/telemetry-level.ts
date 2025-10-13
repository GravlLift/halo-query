export enum TelemetryLevel {
  None = 0,
  Local = 1,
  FailuresOnly = 2,
  All = 3,
}

export const telemetryLevel: TelemetryLevel = TelemetryLevel.FailuresOnly;
