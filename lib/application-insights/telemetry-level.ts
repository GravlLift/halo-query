export enum TelemetryLevel {
  None = 0,
  Local = 1,
  FailuresOnly = 2,
  All = 3,
}

export const telemetryLevel: TelemetryLevel = process.env
  .NEXT_PUBLIC_TELEMETRY_LEVEL
  ? +process.env.NEXT_PUBLIC_TELEMETRY_LEVEL
  : TelemetryLevel.None;
