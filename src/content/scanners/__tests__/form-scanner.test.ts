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

  // ── Standalone (orphan) input tests ──

  it('generates form.fill-* tool for standalone text input outside <form>', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'search-query';
    makeVisible(input);
    document.body.appendChild(input);

    const tools = new FormScanner().scan(document);

    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('form.fill-search-query');
    expect(tools[0].description).toContain('Fill field');
    expect(
      (tools[0].inputSchema as { properties: Record<string, unknown> }).properties,
    ).toHaveProperty('value');
  });

  it('generates tool with enum options for standalone <select> outside <form>', () => {
    const select = document.createElement('select');
    select.name = 'color';
    const opt1 = document.createElement('option');
    opt1.value = 'red';
    opt1.textContent = 'Red';
    const opt2 = document.createElement('option');
    opt2.value = 'blue';
    opt2.textContent = 'Blue';
    select.appendChild(opt1);
    select.appendChild(opt2);
    makeVisible(select);
    document.body.appendChild(select);

    const tools = new FormScanner().scan(document);

    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('form.fill-color');
    const schema = tools[0].inputSchema as {
      properties: Record<string, { enum?: string[] }>;
    };
    expect(schema.properties.value.enum).toEqual(['red', 'blue']);
  });

  it('generates tool for standalone <textarea> outside <form>', () => {
    const ta = document.createElement('textarea');
    ta.name = 'comments';
    makeVisible(ta);
    document.body.appendChild(ta);

    const tools = new FormScanner().scan(document);

    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('form.fill-comments');
  });

  it('does NOT generate standalone tool for input inside <form>', () => {
    const form = document.createElement('form');
    form.id = 'login';
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'user';
    makeVisible(form);
    makeVisible(input);
    form.appendChild(input);
    document.body.appendChild(form);

    const tools = new FormScanner().scan(document);

    // Only the form.submit tool, no standalone fill tool
    expect(tools.length).toBe(1);
    expect(tools[0].name).toMatch(/^form\.submit-/);
  });

  it('excludes hidden and submit inputs from standalone scan', () => {
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'csrf';
    makeVisible(hidden);
    document.body.appendChild(hidden);

    const submit = document.createElement('input');
    submit.type = 'submit';
    submit.name = 'go';
    makeVisible(submit);
    document.body.appendChild(submit);

    const tools = new FormScanner().scan(document);

    expect(tools.length).toBe(0);
  });

  it('excludes invisible standalone inputs', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'secret';
    // NOT calling makeVisible — element stays invisible
    document.body.appendChild(input);

    const tools = new FormScanner().scan(document);

    expect(tools.length).toBe(0);
  });

  it('deduplicates tool names when multiple standalone inputs share the same name', () => {
    const input1 = document.createElement('input');
    input1.type = 'text';
    input1.name = 'query';
    makeVisible(input1);
    document.body.appendChild(input1);

    const input2 = document.createElement('input');
    input2.type = 'text';
    input2.name = 'query';
    makeVisible(input2);
    document.body.appendChild(input2);

    const tools = new FormScanner().scan(document);

    expect(tools.length).toBe(2);
    expect(tools[0].name).toBe('form.fill-query');
    expect(tools[1].name).toBe('form.fill-query-2');
  });
});
