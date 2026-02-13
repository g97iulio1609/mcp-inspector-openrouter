import { beforeEach, describe, expect, it } from 'vitest';
import type { Tool } from '../../../types';
import { RichTextExecutor } from '../richtext-executor';

function buildTool(el: Element, name = 'richtext.comment-demo'): Tool {
  return {
    name,
    description: 'Comment composer',
    category: 'richtext',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    },
    _el: el,
  };
}

describe('RichTextExecutor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: (_command: string, _showUI?: boolean, _value?: string): boolean => {
        const target = document.activeElement as HTMLElement | null;
        if (!target) return true;

        if (_command === 'delete') {
          target.textContent = '';
          return true;
        }

        if (_command === 'insertParagraph') {
          target.textContent = `${target.textContent ?? ''}\n`;
          return true;
        }

        if (_command === 'insertText' && typeof _value === 'string') {
          target.textContent = `${target.textContent ?? ''}${_value}`;
          return true;
        }

        return true;
      },
    });
  });

  it('writes text into textarea comment boxes', async () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('placeholder', 'Add a comment...');
    Object.defineProperty(textarea, 'getBoundingClientRect', {
      configurable: true,
      value: (): DOMRect =>
        ({
          x: 0,
          y: 0,
          width: 300,
          height: 60,
          top: 0,
          left: 0,
          right: 300,
          bottom: 60,
          toJSON: (): Record<string, never> => ({}),
        }) as DOMRect,
    });
    document.body.appendChild(textarea);

    const executor = new RichTextExecutor();
    const result = await executor.execute(buildTool(textarea), { text: 'Great post!' });

    expect(result.success).toBe(true);
    expect(textarea.value).toBe('Great post!');
  });

  it('activates trigger and writes into spawned contenteditable editor', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-label', 'Add a comment');
    trigger.addEventListener('click', () => {
      if (!document.querySelector('#inline-editor')) {
        const editor = document.createElement('div');
        editor.id = 'inline-editor';
        editor.setAttribute('contenteditable', 'true');
        editor.setAttribute('role', 'textbox');
        editor.addEventListener('paste', (event: Event): void => {
          const clipboardEvent = event as ClipboardEvent;
          const pasted = clipboardEvent.clipboardData?.getData('text/plain') ?? '';
          editor.textContent = pasted;
          event.preventDefault();
        });
        Object.defineProperty(editor, 'getBoundingClientRect', {
          configurable: true,
          value: (): DOMRect =>
            ({
              x: 0,
              y: 0,
              width: 300,
              height: 120,
              top: 0,
              left: 0,
              right: 300,
              bottom: 120,
              toJSON: (): Record<string, never> => ({}),
            }) as DOMRect,
        });
        document.body.appendChild(editor);
      }
    });
    document.body.appendChild(trigger);

    const executor = new RichTextExecutor();
    const result = await executor.execute(buildTool(trigger), { text: 'Trigger comment' });

    expect(result.success).toBe(true);
    expect(document.body.textContent || '').toContain('Trigger comment');
  });
});
