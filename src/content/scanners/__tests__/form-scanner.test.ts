import { beforeEach, describe, expect, it } from 'vitest';
import { FormScanner } from '../form-scanner';

function makeVisible(el: HTMLElement): void {
  Object.defineProperty(el, 'offsetParent', {
    configurable: true,
    value: document.body,
  });
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect =>
      ({
        x: 0,
        y: 0,
        width: 360,
        height: 120,
        top: 0,
        left: 0,
        right: 360,
        bottom: 120,
        toJSON: (): Record<string, never> => ({}),
      }) as DOMRect,
  });
}

describe('FormScanner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not throw when form.action is shadowed with non-string value', () => {
    const form = document.createElement('form');
    form.id = 'checkout';

    Object.defineProperty(form, 'action', {
      configurable: true,
      value: { not: 'a-string' },
    });

    const input = document.createElement('input');
    input.name = 'email';
    input.type = 'email';

    makeVisible(form);
    makeVisible(input);
    form.appendChild(input);
    document.body.appendChild(form);

    const scanner = new FormScanner();
    const tools = scanner.scan(document);

    expect(tools.length).toBe(1);
    expect(tools[0].name.startsWith('form.submit-')).toBe(true);
  });

  it('derives form name from action attribute safely', () => {
    const form = document.createElement('form');
    form.setAttribute('action', '/api/checkout/submit-order');

    const input = document.createElement('input');
    input.name = 'quantity';
    input.type = 'number';

    makeVisible(form);
    makeVisible(input);
    form.appendChild(input);
    document.body.appendChild(form);

    const tools = new FormScanner().scan(document);

    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('form.submit-submit-order');
  });
});
