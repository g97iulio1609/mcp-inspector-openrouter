import { beforeEach, describe, expect, it } from 'vitest';
import { RichTextScanner } from '../richtext-scanner';

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
        width: 240,
        height: 44,
        top: 0,
        left: 0,
        right: 240,
        bottom: 44,
        toJSON: (): Record<string, never> => ({}),
      }) as DOMRect,
  });
}

describe('RichTextScanner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects textarea comment composers', () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('placeholder', 'Add a comment...');
    makeVisible(textarea);
    document.body.appendChild(textarea);

    const tools = new RichTextScanner().scan(document);
    const commentTool = tools.find((tool) => tool.name.startsWith('richtext.comment-'));

    expect(commentTool).toBeDefined();
  });

  it('detects YouTube-like comment trigger placeholders', () => {
    const renderer = document.createElement('ytd-comment-simplebox-renderer');
    const trigger = document.createElement('div');
    trigger.id = 'simplebox-placeholder';
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-label', 'Add a comment');
    makeVisible(trigger);

    renderer.appendChild(trigger);
    document.body.appendChild(renderer);

    const tools = new RichTextScanner().scan(document);
    const commentTool = tools.find((tool) => tool.name.startsWith('richtext.comment-'));

    expect(commentTool).toBeDefined();
  });
});
