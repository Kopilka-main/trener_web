export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message = 'Не найдено') => new AppError(404, 'NOT_FOUND', message);
export const unauthorized = (message = 'Не авторизован') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Доступ запрещён') => new AppError(403, 'FORBIDDEN', message);
