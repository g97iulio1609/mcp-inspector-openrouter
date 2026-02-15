/**
 * Tests for WmcpServer — DOM injection and CustomEvent request/response.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WmcpServer } from '../wmcp-server';

describe('WmcpServer', () => {
  let server: WmcpServer;

  beforeEach(() => {
    server = new WmcpServer();
  });

  afterEach(() => {
    server.dispose();
  });

  // ── DOM injection ──

  describe('exposeManifest', () => {
    it('injects a script element with wmcp+json type', () => {
      server.exposeManifest('{"tools":[]}');
      const el = document.getElementById('wmcp-manifest') as HTMLScriptElement;
      expect(el).toBeTruthy();
      expect(el.type).toBe('application/wmcp+json');
      expect(el.textContent).toBe('{"tools":[]}');
    });

    it('updates the same element on subsequent calls', () => {
      server.exposeManifest('{"tools":[]}');
      server.exposeManifest('{"tools":[{"name":"a"}]}');
      const els = document.querySelectorAll('#wmcp-manifest');
      expect(els.length).toBe(1);
      expect(els[0].textContent).toBe('{"tools":[{"name":"a"}]}');
    });
  });

  // ── CustomEvent request/response ──

  describe('onRequest', () => {
    it('responds to wmcp-request events with wmcp-response', () => {
      const handler = (_url: string): string => '{"tools":["test"]}';
      server.onRequest(handler);

      let response: string | undefined;
      document.addEventListener('wmcp-response', ((e: Event) => {
        response = (e as CustomEvent<{ manifest: string }>).detail.manifest;
      }) as EventListener, { once: true });

      document.dispatchEvent(
        new CustomEvent('wmcp-request', { detail: { url: '/test' } }),
      );

      expect(response).toBe('{"tools":["test"]}');
    });

    it('passes the requested URL to the handler', () => {
      let receivedUrl = '';
      server.onRequest((url) => {
        receivedUrl = url;
        return '{}';
      });

      document.dispatchEvent(
        new CustomEvent('wmcp-request', { detail: { url: '/api/tools' } }),
      );

      expect(receivedUrl).toBe('/api/tools');
    });

    it('handles missing url in request detail', () => {
      let receivedUrl: string | undefined;
      server.onRequest((url) => {
        receivedUrl = url;
        return '{}';
      });

      document.dispatchEvent(
        new CustomEvent('wmcp-request', { detail: {} }),
      );

      expect(receivedUrl).toBe('');
    });

    it('replaces previous handler on subsequent calls', () => {
      const results: string[] = [];

      server.onRequest(() => 'first');
      server.onRequest(() => 'second');

      document.addEventListener('wmcp-response', ((e: Event) => {
        results.push((e as CustomEvent<{ manifest: string }>).detail.manifest);
      }) as EventListener, { once: true });

      document.dispatchEvent(
        new CustomEvent('wmcp-request', { detail: {} }),
      );

      expect(results).toEqual(['second']);
    });
  });

  // ── Disposal ──

  describe('dispose', () => {
    it('removes the script element from the DOM', () => {
      server.exposeManifest('{"tools":[]}');
      expect(document.getElementById('wmcp-manifest')).toBeTruthy();

      server.dispose();
      expect(document.getElementById('wmcp-manifest')).toBeNull();
    });

    it('stops responding to wmcp-request events', () => {
      server.onRequest(() => 'response');
      server.dispose();

      let gotResponse = false;
      document.addEventListener('wmcp-response', () => {
        gotResponse = true;
      }, { once: true });

      document.dispatchEvent(
        new CustomEvent('wmcp-request', { detail: {} }),
      );

      expect(gotResponse).toBe(false);
    });

    it('is safe to call multiple times', () => {
      server.exposeManifest('{}');
      server.onRequest(() => '{}');
      server.dispose();
      server.dispose();
      expect(document.getElementById('wmcp-manifest')).toBeNull();
    });
  });
});
