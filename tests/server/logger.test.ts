import { describe, it, expect } from 'vitest';

describe('logger', () => {
  it('exports a pino logger instance', async () => {
    const { logger } = await import('../../server/logger.js');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });
});
