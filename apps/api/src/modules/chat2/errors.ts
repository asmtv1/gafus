

export class Chat2Error extends Error {
  constructor(
    public code: string,
    public status: 400 | 403 | 404 | 409 | 410 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}

export const fail = (code: string, status: Chat2Error["status"], message: string): never => {
  throw new Chat2Error(code, status, message);
};
