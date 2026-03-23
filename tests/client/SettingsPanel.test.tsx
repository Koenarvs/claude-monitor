import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../../src/components/SettingsPanel';

const mockConfig = {
  defaultCwd: '/home/user',
  defaultPermissionMode: 'autonomous',
  workingDirectories: [{ label: 'Test', path: '/test' }],
  vaultPath: '/vault',
  maxSessions: 10,
  approvalTimeoutMinutes: 30,
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockConfig),
  }) as any;
});

describe('SettingsPanel', () => {
  it('does not render when closed', () => {
    const { container } = render(<SettingsPanel open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders settings header when open', async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeDefined();
    });
  });

  it('loads and displays config values', async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('/home/user')).toBeDefined();
      expect(screen.getByDisplayValue('10')).toBeDefined();
      expect(screen.getByDisplayValue('30')).toBeDefined();
    });
  });

  it('renders saved directories', async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test')).toBeDefined();
      expect(screen.getByDisplayValue('/test')).toBeDefined();
    });
  });

  it('shows Save and Cancel buttons', async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeDefined();
      expect(screen.getByText('Cancel')).toBeDefined();
    });
  });

  it('save triggers PUT with config payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfig) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });
    global.fetch = fetchMock as any;
    const onClose = vi.fn();

    render(<SettingsPanel open={true} onClose={onClose} />);
    await waitFor(() => screen.getByText('Save'));

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
      expect(putCall).toBeDefined();
      expect(putCall![0]).toBe('/api/config');
    });
  });

  it('cancel closes without saving', async () => {
    const onClose = vi.fn();
    render(<SettingsPanel open={true} onClose={onClose} />);
    await waitFor(() => screen.getByText('Cancel'));

    fireEvent.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalled();
    const putCalls = (global.fetch as any).mock.calls.filter((c: any[]) => c[1]?.method === 'PUT');
    expect(putCalls.length).toBe(0);
  });
});
