/**
 * tab-mention.ts — @mention autocomplete for cross-tab references.
 * When the user types `@` in the chat input, shows a dropdown of open tabs.
 */

export interface TabMention {
  tabId: number;
  title: string;
  url: string;
}

export interface MentionAutocomplete {
  /** Clean up event listeners */
  destroy: () => void;
  /** Extract mentions from text and return clean text + mentioned tabs */
  parseMentions: (text: string) => { cleanText: string; mentions: TabMention[] };
}

/** Fuzzy match: checks if query chars appear in order in target */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Score a tab against a query — higher is better */
function scoreTab(query: string, tab: chrome.tabs.Tab): number {
  const q = query.toLowerCase();
  const title = (tab.title ?? '').toLowerCase();
  const url = (tab.url ?? '').toLowerCase();

  // Exact prefix match in title (best)
  if (title.startsWith(q)) return 100;
  // Title contains query
  if (title.includes(q)) return 80;
  // Domain contains query
  try {
    const hostname = new URL(tab.url ?? '').hostname.toLowerCase();
    if (hostname.includes(q)) return 70;
  } catch { /* ignore */ }
  // URL contains query
  if (url.includes(q)) return 50;
  // Fuzzy match on title
  if (fuzzyMatch(q, title)) return 30;
  return 0;
}

export function createMentionAutocomplete(
  textarea: HTMLTextAreaElement,
  container: HTMLElement,
): MentionAutocomplete {
  let dropdown: HTMLDivElement | null = null;
  let allTabs: chrome.tabs.Tab[] = [];
  let mentionStart = -1;
  let selectedIndex = 0;

  const onInput = async () => {
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;

    // Find @ before cursor
    const beforeCursor = text.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf('@');

    if (atIndex === -1 || (atIndex > 0 && beforeCursor[atIndex - 1] !== ' ' && beforeCursor[atIndex - 1] !== '\n')) {
      hideDropdown();
      return;
    }

    const query = beforeCursor.slice(atIndex + 1);

    // If query has a space, the mention is "closed"
    if (query.includes(' ') || query.includes('\n')) {
      hideDropdown();
      return;
    }

    mentionStart = atIndex;

    // Fetch tabs
    allTabs = await chrome.tabs.query({ currentWindow: true });

    // Filter and score
    let matches = allTabs
      .filter(t => t.id != null && t.url && !t.url.startsWith('chrome://'))
      .map(t => ({ tab: t, score: query.length > 0 ? scoreTab(query, t) : 50 }))
      .filter(m => m.score > 0 || query.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    // Don't show current active tab in the list
    matches = matches.filter(m => !m.tab.active);

    if (matches.length === 0) {
      hideDropdown();
      return;
    }

    selectedIndex = 0;
    showDropdown(matches.map(m => m.tab), query);
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (!dropdown) return;

    const items = dropdown.querySelectorAll('.mention-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      updateSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateSelection(items);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (dropdown) {
        e.preventDefault();
        const selected = items[selectedIndex] as HTMLElement;
        if (selected) selectTab(selected);
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  };

  function updateSelection(items: NodeListOf<Element>) {
    items.forEach((item, i) => {
      (item as HTMLElement).classList.toggle('mention-item--selected', i === selectedIndex);
    });
  }

  function selectTab(item: HTMLElement) {
    const tabId = parseInt(item.dataset.tabId ?? '0', 10);
    const title = item.dataset.tabTitle ?? '';

    // Replace @query with @Title[tabId]
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    const before = text.slice(0, mentionStart);
    const after = text.slice(cursorPos);
    const mention = `@${title}[${tabId}] `;

    textarea.value = before + mention + after;
    textarea.selectionStart = textarea.selectionEnd = before.length + mention.length;
    textarea.focus();

    hideDropdown();
  }

  function showDropdown(tabs: chrome.tabs.Tab[], _query: string) {
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'mention-dropdown';
      container.appendChild(dropdown);
    }

    dropdown.innerHTML = '';

    for (const tab of tabs) {
      const item = document.createElement('div');
      item.className = 'mention-item';
      item.dataset.tabId = String(tab.id);
      item.dataset.tabTitle = tab.title ?? '';

      // Favicon
      const favicon = document.createElement('img');
      favicon.className = 'mention-favicon';
      favicon.src = tab.favIconUrl ?? '';
      favicon.width = 16;
      favicon.height = 16;
      favicon.onerror = () => { favicon.style.display = 'none'; };
      item.appendChild(favicon);

      // Title + URL
      const info = document.createElement('div');
      info.className = 'mention-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'mention-title';
      titleEl.textContent = tab.title ?? 'Untitled';
      info.appendChild(titleEl);

      const urlEl = document.createElement('div');
      urlEl.className = 'mention-url';
      try {
        urlEl.textContent = new URL(tab.url ?? '').hostname;
      } catch {
        urlEl.textContent = tab.url ?? '';
      }
      info.appendChild(urlEl);

      item.appendChild(info);

      item.addEventListener('click', () => selectTab(item));
      item.addEventListener('mouseenter', () => {
        selectedIndex = Array.from(dropdown!.children).indexOf(item);
        updateSelection(dropdown!.querySelectorAll('.mention-item'));
      });

      dropdown.appendChild(item);
    }

    // Highlight first
    updateSelection(dropdown.querySelectorAll('.mention-item'));
  }

  function hideDropdown() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
    mentionStart = -1;
  }

  // Parse @Title[tabId] mentions from text
  function parseMentions(text: string): { cleanText: string; mentions: TabMention[] } {
    const mentions: TabMention[] = [];
    const mentionRegex = /@([^[]+)\[(\d+)\]/g;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const title = match[1].trim();
      const tabId = parseInt(match[2], 10);
      const tab = allTabs.find(t => t.id === tabId);
      mentions.push({
        tabId,
        title,
        url: tab?.url ?? '',
      });
    }

    const cleanText = text.replace(/@[^[]+\[\d+\]\s?/g, '').trim();
    return { cleanText, mentions };
  }

  textarea.addEventListener('input', onInput);
  textarea.addEventListener('keydown', onKeydown);

  // Close dropdown on outside click
  const onOutsideClick = (e: MouseEvent) => {
    if (dropdown && !dropdown.contains(e.target as Node) && e.target !== textarea) {
      hideDropdown();
    }
  };
  document.addEventListener('click', onOutsideClick);

  return {
    destroy: () => {
      textarea.removeEventListener('input', onInput);
      textarea.removeEventListener('keydown', onKeydown);
      document.removeEventListener('click', onOutsideClick);
      hideDropdown();
    },
    parseMentions,
  };
}
