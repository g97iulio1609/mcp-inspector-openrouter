import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock chrome.storage.local
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
});

// Mock matchMedia
const mockMediaQuery = {
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMediaQuery));

import '../theme-provider';

describe('ThemeProvider', () => {
  let el: HTMLElement;

  beforeEach(async () => {
    el = document.createElement('theme-provider');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0)); // flush microtasks
  });

  afterEach(() => {
    el.remove();
    document.documentElement.removeAttribute('data-theme');
  });

  it('registers as custom element', () => {
    expect(customElements.get('theme-provider')).toBeDefined();
  });

  it('defaults to auto theme', () => {
    expect((el as any).theme).toBe('auto');
  });

  it('applies light tokens when auto and no dark preference', () => {
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applies dark tokens when auto and dark preference', async () => {
    mockMediaQuery.matches = true;
    (el as any).applyTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    mockMediaQuery.matches = false; // reset
  });

  it('setTheme persists to chrome.storage', async () => {
    await (el as any).setTheme('dark');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ wmcp_theme: 'dark' });
  });

  it('renders slot for child content', () => {
    // theme-provider uses display: contents and slot
    expect(el.shadowRoot?.querySelector('slot')).toBeTruthy();
  });
});
