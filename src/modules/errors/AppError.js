export default class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
