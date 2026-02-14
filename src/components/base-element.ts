/**
 * BaseElement — shared base for all Lit Web Components.
 * Provides theme-aware CSS custom properties and utility methods.
 */
import { LitElement, css } from 'lit';

/** Shared design tokens as CSS */
export const sharedStyles = css`
  :host {
    /* These inherit from the document-level theme-provider */
    font-family: var(--font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    font-size: 13px;
    line-height: 1.5;
    color: var(--text, #1a1d23);
    -webkit-font-smoothing: antialiased;
  }

  :host([hidden]) { display: none; }
`;

export class BaseElement extends LitElement {
  // No-op base — subclasses override render() and static styles
}
