/**
 * AuthStateProvider — collects live state for authentication indicators.
 *
 * Uses DOM heuristics to detect login forms, logout controls,
 * and the currently visible user name.
 */

import type { IStateProvider, AuthLiveState } from '../../../types/live-state.types';

const LOGOUT_SELECTOR = [
  'a[href*="logout" i]',
  'a[href*="sign-out" i]',
  'button[class*="logout" i]',
  '[data-action="logout"]',
].join(', ');

const USERNAME_SELECTOR = [
  '[class*="avatar" i] img[alt]',
  '[class*="user" i][class*="name" i]',
  '[class*="profile" i] [class*="name" i]',
].join(', ');

/** Truncate a string to a maximum length */
function truncate(value: string, max = 100): string {
  return value.length > max ? value.slice(0, max) : value;
}

export class AuthStateProvider implements IStateProvider<AuthLiveState> {
  readonly category = 'auth' as const;

  collect(root: Document | Element): AuthLiveState {
    const hasLoginForm = !!root.querySelector('input[type="password"]');
    const hasLogoutButton = !!root.querySelector(LOGOUT_SELECTOR);
    const isLoggedIn = hasLogoutButton && !hasLoginForm;

    // Attempt to extract a user name from common patterns
    let userName: string | undefined;
    const candidate = root.querySelector(USERNAME_SELECTOR);
    if (candidate) {
      const text =
        (candidate as HTMLImageElement).alt?.trim() ||
        candidate.textContent?.trim() ||
        '';
      if (text) userName = truncate(text);
    }

    return {
      isLoggedIn,
      hasLoginForm,
      hasLogoutButton,
      ...(userName ? { userName } : {}),
    };
  }

  dispose(): void {
    /* no-op */
  }
}
