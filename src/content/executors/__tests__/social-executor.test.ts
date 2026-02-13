import { beforeEach, describe, expect, it } from 'vitest';
import type { Tool } from '../../../types';
import { SocialExecutor } from '../social-executor';

function buildTool(el: Element, name: string): Tool {
  return {
    name,
    description: `Tool ${name}`,
    category: 'social-action',
    inputSchema: { type: 'object', properties: {} },
    _el: el,
  };
}

describe('SocialExecutor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('executes message action', async () => {
    const btn = document.createElement('button');
    btn.addEventListener('click', () => btn.setAttribute('data-clicked', '1'));
    document.body.appendChild(btn);

    const executor = new SocialExecutor();
    const result = await executor.execute(buildTool(btn, 'social.message-demo'), {});

    expect(result.success).toBe(true);
    expect(result.message).toContain('message/chat');
    expect(btn.getAttribute('data-clicked')).toBe('1');
  });

  it('executes save action', async () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    const executor = new SocialExecutor();
    const result = await executor.execute(buildTool(btn, 'social.save-demo'), {});

    expect(result.success).toBe(true);
    expect(result.message).toContain('Saved/bookmarked');
  });
});
