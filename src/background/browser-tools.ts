/**
 * Browser control tools — executed in the background service worker.
 * These handle chrome.tabs and chrome.windows APIs.
 */

export interface BrowserToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export async function handleBrowserTool(
  action: string,
  args: Record<string, unknown>,
): Promise<BrowserToolResult> {
  switch (action) {
    case 'browser.new-tab': {
      const url = (args.url as string) || 'about:blank';
      const tab = await chrome.tabs.create({ url, active: args.active !== false });
      return { success: true, message: `Opened new tab: ${url}`, data: { tabId: tab.id, url } };
    }

    case 'browser.close-tab': {
      const tabId = args.tabId as number | undefined;
      if (tabId) {
        await chrome.tabs.remove(tabId);
        return { success: true, message: `Closed tab ${tabId}` };
      }
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await chrome.tabs.remove(activeTab.id);
        return { success: true, message: 'Closed active tab' };
      }
      return { success: false, message: 'No tab to close' };
    }

    case 'browser.list-tabs': {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const tabList = tabs.map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        active: t.active,
        index: t.index,
      }));
      return { success: true, message: `Found ${tabList.length} tabs`, data: tabList };
    }

    case 'browser.focus-tab': {
      const targetId = args.tabId as number;
      if (!targetId) return { success: false, message: 'tabId is required' };
      await chrome.tabs.update(targetId, { active: true });
      const tab = await chrome.tabs.get(targetId);
      return { success: true, message: `Focused tab: ${tab.title}`, data: { tabId: targetId, title: tab.title } };
    }

    case 'browser.go-back': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) return { success: false, message: 'No active tab' };
      await chrome.tabs.goBack(activeTab.id);
      return { success: true, message: 'Navigated back' };
    }

    case 'browser.go-forward': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) return { success: false, message: 'No active tab' };
      await chrome.tabs.goForward(activeTab.id);
      return { success: true, message: 'Navigated forward' };
    }

    case 'browser.reload': {
      const targetId = (args.tabId as number) || undefined;
      if (targetId) {
        await chrome.tabs.reload(targetId);
        return { success: true, message: `Reloaded tab ${targetId}` };
      }
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await chrome.tabs.reload(activeTab.id);
        return { success: true, message: 'Reloaded active tab' };
      }
      return { success: false, message: 'No tab to reload' };
    }

    default:
      return { success: false, message: `Unknown browser tool: ${action}` };
  }
}

/** Check if a tool name is a browser tool */
export function isBrowserTool(name: string): boolean {
  return name.startsWith('browser.');
}
