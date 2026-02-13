import { beforeEach, describe, expect, it } from 'vitest';
import { SocialScanner } from '../social-scanner';

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
        width: 140,
        height: 40,
        top: 0,
        left: 0,
        right: 140,
        bottom: 40,
        toJSON: (): Record<string, never> => ({}),
      }) as DOMRect,
  });
}

describe('SocialScanner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects like/share/comment/message/save actions', () => {
    const likeBtn = document.createElement('button');
    likeBtn.setAttribute('aria-label', 'Like this post');
    makeVisible(likeBtn);

    const shareBtn = document.createElement('button');
    shareBtn.setAttribute('aria-label', 'Share this post');
    makeVisible(shareBtn);

    const commentBtn = document.createElement('button');
    commentBtn.setAttribute('aria-label', 'Comment on this post');
    makeVisible(commentBtn);

    const messageBtn = document.createElement('button');
    messageBtn.setAttribute('aria-label', 'Send message on WhatsApp');
    makeVisible(messageBtn);

    const saveBtn = document.createElement('button');
    saveBtn.setAttribute('aria-label', 'Save this post');
    makeVisible(saveBtn);

    document.body.append(likeBtn, shareBtn, commentBtn, messageBtn, saveBtn);

    const tools = new SocialScanner().scan(document);
    const names = tools.map((tool) => tool.name);

    expect(names.some((name) => name.startsWith('social.like-'))).toBe(true);
    expect(names.some((name) => name.startsWith('social.share-'))).toBe(true);
    expect(names.some((name) => name.startsWith('social.comment-'))).toBe(true);
    expect(names.some((name) => name.startsWith('social.message-'))).toBe(true);
    expect(names.some((name) => name.startsWith('social.save-'))).toBe(true);
  });

  it('skips contenteditable boxes to avoid overlapping richtext tools', () => {
    const editable = document.createElement('div');
    editable.setAttribute('aria-label', 'Comment');
    editable.setAttribute('contenteditable', 'true');
    makeVisible(editable);
    document.body.appendChild(editable);

    const tools = new SocialScanner().scan(document);
    expect(tools.length).toBe(0);
  });
});
