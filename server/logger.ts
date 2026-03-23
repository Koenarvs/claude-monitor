import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const isTest = !!process.env.VITEST;

export const logger = pino({
  level: isTest ? 'silent' : process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev && !isTest
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});
