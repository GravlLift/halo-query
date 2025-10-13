export class WorkerCallError extends Error {
  constructor(public callId: number, message: string) {
    super(message);
    this.name = 'WorkerCallError';
  }
}
