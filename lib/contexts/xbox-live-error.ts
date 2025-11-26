export class XboxLiveError extends Error {
  constructor(
    message: string,
    public readonly xErr: number,
    public readonly redirect: string,
    public readonly identity: string
  ) {
    super(message);
    this.name = 'XboxLiveError';
  }
}
