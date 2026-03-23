import { describe, it, expect } from 'vitest';
import { generateName, generateInitials } from '../../server/auto-namer.js';

describe('generateName', () => {
  it('combines directory name and prompt summary', () => {
    const name = generateName('C:/Users/Koena/claude-monitor', 'Fix the login bug');
    expect(name).toContain('claude-monitor');
    expect(name).toContain('Fix the login bug');
  });

  it('truncates long names to 50 chars', () => {
    const name = generateName('/my-super-long-project-name', 'This is a very long prompt that should definitely be truncated at some reasonable length');
    expect(name.length).toBeLessThanOrEqual(50);
    expect(name).toMatch(/\.\.\.$/);
  });

  it('handles empty cwd gracefully', () => {
    const name = generateName('', 'hello');
    expect(name).toContain('session');
  });
});

describe('generateInitials', () => {
  it('extracts two-letter initials from hyphenated name', () => {
    expect(generateInitials('/path/to/claude-monitor')).toBe('CM');
  });

  it('extracts first two chars from single word', () => {
    expect(generateInitials('/path/to/project')).toBe('PR');
  });

  it('handles underscore-separated names', () => {
    expect(generateInitials('/path/to/my_app')).toBe('MA');
  });

  it('handles empty path', () => {
    const initials = generateInitials('');
    expect(initials).toBe('CC');
  });
});
