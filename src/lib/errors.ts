export type ApiError = {
  error: {
    message: string;
    type: string;
    code?: string;
  };
};

export class HttpError extends Error {
  status: number;
  type: string;
  code?: string;

  constructor({ message, status, type, code }: { message: string; status: number; type: string; code?: string }) {
    super(message);
    this.status = status;
    this.type = type;
    this.code = code;
  }

  toJson(): ApiError {
    return {
      error: {
        message: this.message,
        type: this.type,
        ...(this.code ? { code: this.code } : {}),
      },
    };
  }
}

export function buildApiError(message: string, type: string, code?: string): ApiError {
  return {
    error: {
      message,
      type,
      ...(code ? { code } : {}),
    },
  };
}
