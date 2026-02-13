import { describe, it, expect } from 'vitest';
import { formatLiveStateForPrompt } from '../live-state-formatter';
import type {
  LiveStateSnapshot,
  MediaLiveState,
  FormLiveState,
  NavigationLiveState,
  AuthLiveState,
  InteractiveLiveState,
} from '../../types/live-state.types';

// ── Fixtures ──

const EMPTY_INTERACTIVE: InteractiveLiveState = {
  openModals: [],
  expandedAccordions: [],
  openDropdowns: [],
  activeTooltips: [],
  visibleNotifications: [],
};

const EMPTY_AUTH: AuthLiveState = {
  isLoggedIn: false,
  hasLoginForm: false,
  hasLogoutButton: false,
};

const EMPTY_NAV: NavigationLiveState = {
  currentUrl: '',
  scrollPercent: 0,
};

function makeSnapshot(overrides: Partial<LiveStateSnapshot> = {}): LiveStateSnapshot {
  return {
    timestamp: Date.now(),
    media: [],
    forms: [],
    navigation: EMPTY_NAV,
    auth: EMPTY_AUTH,
    interactive: EMPTY_INTERACTIVE,
    ...overrides,
  };
}

// ── Tests ──

describe('formatLiveStateForPrompt', () => {
  it('returns empty string when all categories are empty', () => {
    expect(formatLiveStateForPrompt(makeSnapshot())).toBe('');
  });

  describe('media formatting', () => {
    it('formats a playing video', () => {
      const media: MediaLiveState = {
        playerId: 'yt-main',
        platform: 'youtube',
        title: 'Test Video',
        paused: false,
        currentTime: 83,
        duration: 213,
        volume: 0.8,
        muted: false,
        playbackRate: 1,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).toContain('LIVE PAGE STATE');
      expect(result).toContain('🎬 Media Players');
      expect(result).toContain('▶️ PLAYING');
      expect(result).toContain('1:23/3:33');
      expect(result).toContain('volume 80%');
      expect(result).toContain('"Test Video"');
      expect(result).toContain('(youtube)');
    });

    it('formats a paused + muted video', () => {
      const media: MediaLiveState = {
        playerId: 'native-0',
        platform: 'native',
        title: 'BG Music',
        paused: true,
        currentTime: 0,
        duration: 135,
        volume: 0.5,
        muted: true,
        playbackRate: 1,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).toContain('⏸️ PAUSED');
      expect(result).toContain('🔇 MUTED');
      expect(result).toContain('0:00/2:15');
    });

    it('includes speed when not 1x', () => {
      const media: MediaLiveState = {
        playerId: 'yt-0',
        platform: 'youtube',
        title: 'Fast',
        paused: false,
        currentTime: 10,
        duration: 100,
        volume: 1,
        muted: false,
        playbackRate: 2,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).toContain('speed 2x');
    });

    it('omits speed when 1x', () => {
      const media: MediaLiveState = {
        playerId: 'yt-0',
        platform: 'youtube',
        title: 'Normal',
        paused: true,
        currentTime: 0,
        duration: 60,
        volume: 1,
        muted: false,
        playbackRate: 1,
        hasPlaylist: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ media: [media] }));
      expect(result).not.toContain('speed');
    });
  });

  describe('forms formatting', () => {
    it('formats form completion and dirty fields', () => {
      const form: FormLiveState = {
        formId: 'search-form',
        toolName: 'search',
        totalFields: 3,
        filledFields: 1,
        dirtyFields: ['query'],
        hasValidationErrors: false,
        completionPercent: 33,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('📝 Forms');
      expect(result).toContain('1/3 filled (33%)');
      expect(result).toContain('dirty: [query]');
    });

    it('shows validation errors', () => {
      const form: FormLiveState = {
        formId: 'login',
        toolName: 'auth-login',
        totalFields: 2,
        filledFields: 0,
        dirtyFields: [],
        hasValidationErrors: true,
        completionPercent: 0,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ forms: [form] }));
      expect(result).toContain('has validation errors');
    });
  });

  describe('navigation formatting', () => {
    it('formats URL, scroll, section, tab, breadcrumb', () => {
      const nav: NavigationLiveState = {
        currentUrl: 'https://example.com/products',
        scrollPercent: 45,
        visibleSection: 'Featured Products',
        activeTab: 'All',
        breadcrumb: ['Home', 'Products', 'Featured'],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ navigation: nav }));
      expect(result).toContain('🧭 Navigation');
      expect(result).toContain('https://example.com/products');
      expect(result).toContain('Scroll: 45%');
      expect(result).toContain('Section: "Featured Products"');
      expect(result).toContain('Tab: "All"');
      expect(result).toContain('Home > Products > Featured');
    });

    it('omits navigation when URL is empty', () => {
      const result = formatLiveStateForPrompt(makeSnapshot());
      expect(result).not.toContain('🧭');
    });
  });

  describe('auth formatting', () => {
    it('formats logged-in user', () => {
      const auth: AuthLiveState = {
        isLoggedIn: true,
        userName: 'John Doe',
        hasLoginForm: false,
        hasLogoutButton: true,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ auth }));
      expect(result).toContain('🔐 Auth');
      expect(result).toContain('✅ Logged in');
      expect(result).toContain('"John Doe"');
      expect(result).toContain('Logout available');
    });

    it('formats login form available', () => {
      const auth: AuthLiveState = {
        isLoggedIn: false,
        hasLoginForm: true,
        hasLogoutButton: false,
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ auth }));
      expect(result).toContain('Login form available');
    });

    it('omits auth when all indicators are false', () => {
      const result = formatLiveStateForPrompt(makeSnapshot());
      expect(result).not.toContain('🔐');
    });
  });

  describe('interactive formatting', () => {
    it('formats open modals and notifications', () => {
      const interactive: InteractiveLiveState = {
        openModals: ['Cookie Consent'],
        expandedAccordions: ['FAQ 1'],
        openDropdowns: [],
        activeTooltips: [],
        visibleNotifications: ['Item added'],
      };
      const result = formatLiveStateForPrompt(makeSnapshot({ interactive }));
      expect(result).toContain('🎛️ Interactive');
      expect(result).toContain('"Cookie Consent"');
      expect(result).toContain('"FAQ 1"');
      expect(result).toContain('"Item added"');
    });

    it('omits interactive when all arrays are empty', () => {
      const result = formatLiveStateForPrompt(makeSnapshot());
      expect(result).not.toContain('🎛️');
    });
  });

  it('formats all categories together', () => {
    const snapshot = makeSnapshot({
      media: [{
        playerId: 'yt-0', platform: 'youtube', title: 'Song',
        paused: false, currentTime: 60, duration: 180,
        volume: 1, muted: false, playbackRate: 1, hasPlaylist: false,
      }],
      forms: [{
        formId: 'search', toolName: 'search', totalFields: 2,
        filledFields: 1, dirtyFields: ['q'], hasValidationErrors: false,
        completionPercent: 50,
      }],
      navigation: {
        currentUrl: 'https://example.com', scrollPercent: 10,
      },
      auth: { isLoggedIn: true, userName: 'Alice', hasLoginForm: false, hasLogoutButton: true },
      interactive: {
        openModals: ['Modal'], expandedAccordions: [], openDropdowns: [],
        activeTooltips: [], visibleNotifications: [],
      },
    });
    const result = formatLiveStateForPrompt(snapshot);
    expect(result).toContain('🎬');
    expect(result).toContain('📝');
    expect(result).toContain('🧭');
    expect(result).toContain('🔐');
    expect(result).toContain('🎛️');
  });
});
