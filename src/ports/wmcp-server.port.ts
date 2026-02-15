/**
 * IWmcpServerPort — Port for exposing MCP manifests via DOM injection.
 *
 * Enables external tools to read the current MCP manifest by:
 * - Injecting a `<script type="application/wmcp+json">` element
 * - Responding to CustomEvent('wmcp-request') with manifest data
 */

export interface IWmcpServerPort {
  /** Inject or update the manifest JSON in the page DOM. */
  exposeManifest(json: string): void;

  /** Register a handler for incoming wmcp-request events. */
  onRequest(handler: (url: string) => string): void;

  /** Clean up DOM elements and event listeners. */
  dispose(): void;
}
