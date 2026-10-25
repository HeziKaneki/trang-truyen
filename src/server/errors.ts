import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from './logger';
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      { error: { code: 'INVALID_INPUT', fields: error.flatten().fieldErrors } },
      { status: 422 },
    );
  if (error instanceof AppError)
    return Response.json({ error: { code: error.code } }, { status: error.status });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    return Response.json({ error: { code: 'CONFLICT' } }, { status: 409 });
  logger.error({ err: error }, 'Request failed');
  return Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 });
}
