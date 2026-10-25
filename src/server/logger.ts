import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: [
    'password',
    'token',
    'secret',
    'headers.authorization',
    'headers.cookie',
    'email',
    'body',
  ],
});
