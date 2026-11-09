import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** Коды ошибок API (docs/api-design.md §2). Текст для пользователя клиент берёт по коду из словаря i18n. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'INTERNAL'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'CSRF_FAILED'
  | 'TOO_MANY_ATTEMPTS'
  | 'INVALID_STATUS_TRANSITION'
  | 'INCOMPLETE_RECORD'
  | 'CONFIRMATION_REQUIRED'
  | 'CONFLICT';

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Одинаковый ответ для несуществующей, закрытой и неопубликованной записи,
 * чтобы по ответу нельзя было узнать, что запись существует.
 */
export const notFound = (): ApiError => new ApiError(404, 'NOT_FOUND', 'Resource not found');

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ApiError | ZodError, request, reply) => {
    const requestId = request.id;
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: error.issues.map((i) => ({ path: i.path, code: i.code })),
          requestId,
        },
      });
    }
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}), requestId },
      });
    }
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      // Ошибки разбора запроса самим Fastify (неверный JSON, слишком длинный URL и т. п.).
      return reply.status(error.statusCode).send({ error: { code: 'VALIDATION_FAILED', message: 'Bad request', requestId } });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Internal error', requestId } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: request.id } }),
  );
}
