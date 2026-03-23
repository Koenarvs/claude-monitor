import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, clearConfigCache } from '../../server/config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it('returns config with expected shape', async () => {
    const config = await loadConfig();
    expect(config).toHaveProperty('maxSessions');
    expect(config).toHaveProperty('vaultPath');
    expect(config).toHaveProperty('defaultCwd');
    expect(config.maxSessions).toBeGreaterThan(0);
    expect(config.maxSessions).toBeLessThanOrEqual(20);
  });

  it('returns consistent results on second call (cache)', async () => {
    const first = await loadConfig();
    const second = await loadConfig();
    expect(first).toBe(second);
  });
});
