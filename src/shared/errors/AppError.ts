export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 500);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, statusCode: number = 500) {
    super(message, statusCode);
  }
}

export class AuthError extends AppError {
  constructor(message: string) {
    super(message, 401);
  }
}
