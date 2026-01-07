export class CustomError extends Error {
  constructor(message: string) {
    super(`FlowxSDK: ${message}`);
  }
}
