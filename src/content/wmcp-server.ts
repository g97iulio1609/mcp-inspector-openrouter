/**
 * WmcpServer — IWmcpServerPort implementation via DOM injection.
 *
 * Exposes the MCP manifest to external tools by:
 * 1. Injecting a <script type="application/wmcp+json" id="wmcp-manifest"> element
 * 2. Listening for CustomEvent('wmcp-request') and responding with
 *    CustomEvent('wmcp-response') containing the manifest JSON
 */

import type { IWmcpServerPort } from '../ports/wmcp-server.port';

const ELEMENT_ID = 'wmcp-manifest';
const ELEMENT_TYPE = 'application/wmcp+json';
const REQUEST_EVENT = 'wmcp-request';
const RESPONSE_EVENT = 'wmcp-response';

export class WmcpServer implements IWmcpServerPort {
  private scriptEl: HTMLScriptElement | null = null;
  private requestListener: ((e: Event) => void) | null = null;

  exposeManifest(json: string): void {
    if (!this.scriptEl) {
      this.scriptEl = document.createElement('script');
      this.scriptEl.type = ELEMENT_TYPE;
      this.scriptEl.id = ELEMENT_ID;
      document.head.appendChild(this.scriptEl);
    }
    this.scriptEl.textContent = json;
  }

  onRequest(handler: (url: string) => string): void {
    // Remove previous listener if any
    if (this.requestListener) {
      document.removeEventListener(REQUEST_EVENT, this.requestListener);
    }

    this.requestListener = (e: Event): void => {
      const url = (e as CustomEvent<{ url?: string }>).detail?.url ?? '';
      const response = handler(url);
      document.dispatchEvent(
        new CustomEvent(RESPONSE_EVENT, { detail: { manifest: response } }),
      );
    };

    document.addEventListener(REQUEST_EVENT, this.requestListener);
  }

  dispose(): void {
    if (this.scriptEl) {
      this.scriptEl.remove();
      this.scriptEl = null;
    }
    if (this.requestListener) {
      document.removeEventListener(REQUEST_EVENT, this.requestListener);
      this.requestListener = null;
    }
  }
}
