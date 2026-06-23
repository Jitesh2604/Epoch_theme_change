export type ApiErrorDetail = {
  field?: string;
  message: string;
};

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ApiErrorDetail[];
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    options: {
      code?: string;
      details?: ApiErrorDetail[];
      isOperational?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code ?? ApiError.defaultCodeFor(statusCode);
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace(this, this.constructor);
  }

  private static defaultCodeFor(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'UNPROCESSABLE_ENTITY';
      case 429: return 'RATE_LIMITED';
      case 500: return 'INTERNAL_ERROR';
      default:  return 'ERROR';
    }
  }

  static badRequest(message: string, details?: ApiErrorDetail[])     { return new ApiError(400, message, { details }); }
  static unauthorized(message = 'Unauthorized')                       { return new ApiError(401, message); }
  static forbidden(message = 'Forbidden')                             { return new ApiError(403, message); }
  static notFound(message = 'Resource not found')                     { return new ApiError(404, message); }
  static conflict(message: string)                                    { return new ApiError(409, message); }
  static unprocessable(message: string, details?: ApiErrorDetail[])   { return new ApiError(422, message, { details }); }
  static internal(message = 'Internal server error')                  { return new ApiError(500, message, { isOperational: false }); }
}
