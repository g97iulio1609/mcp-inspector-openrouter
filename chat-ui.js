/**
 * chat-ui.js — Chat bubble rendering and conversation selector UI
 */

const chatContainer = document.getElementById('chatContainer');
const conversationSelect = document.getElementById('conversationSelect');

/** Scroll chat to bottom */
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/** Clear all bubbles from the chat container */
export function clearChat() {
    chatContainer.innerHTML = '';
}

/** Add a bubble to the chat UI and scroll */
export function appendBubble(role, content, meta = {}) {
    const bubble = document.createElement('div');
    bubble.className = `bubble bubble-${role}`;

    const body = document.createElement('div');
    body.className = 'bubble-body';

    switch (role) {
        case 'user':
            body.textContent = content;
            break;
        case 'ai':
            // Simple markdown-like rendering: bold, code, newlines
            body.innerHTML = formatAIText(content);
            break;
        case 'tool_call':
            body.innerHTML = `<span class="tool-icon">⚡</span> <strong>${meta.tool}</strong> <code>${JSON.stringify(meta.args)}</code>`;
            break;
        case 'tool_result':
            body.innerHTML = `<span class="tool-icon">✅</span> <strong>${meta.tool}</strong> → <code>${content}</code>`;
            break;
        case 'tool_error':
            body.innerHTML = `<span class="tool-icon">❌</span> <strong>${meta.tool}</strong> → <code>${content}</code>`;
            break;
        case 'error':
            body.innerHTML = `<span class="tool-icon">⚠️</span> ${content}`;
            break;
    }

    bubble.appendChild(body);

    // Timestamp
    const time = document.createElement('div');
    time.className = 'bubble-time';
    time.textContent = new Date(meta.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(time);

    chatContainer.appendChild(bubble);
    scrollToBottom();
}

/** Render all messages from a conversation */
export function renderConversation(messages) {
    clearChat();
    for (const msg of messages) {
        appendBubble(msg.role, msg.content, msg);
    }
}

/** Populate the conversation selector dropdown */
export function populateSelector(conversations, activeId) {
    conversationSelect.innerHTML = '';
    if (conversations.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No conversations';
        opt.disabled = true;
        opt.selected = true;
        conversationSelect.appendChild(opt);
        return;
    }
    for (const conv of conversations) {
        const opt = document.createElement('option');
        opt.value = conv.id;
        opt.textContent = conv.title;
        if (conv.id === activeId) opt.selected = true;
        conversationSelect.appendChild(opt);
    }
}

/**
 * Lightweight markdown → HTML renderer for AI chat bubbles.
 * Supports: headings, bold, italic, fenced code blocks, inline code,
 *           ordered/unordered lists, links, and paragraph breaks.
 */
function formatAIText(text) {
    if (!text) return '';

    // 1. Extract fenced code blocks to protect them from further processing
    const codeBlocks = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        codeBlocks.push(`<pre class="md-codeblock"><code class="lang-${lang || 'text'}">${escaped.trimEnd()}</code></pre>`);
        return `\x00CB${codeBlocks.length - 1}\x00`;
    });

    // 2. Escape HTML in the remaining text
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 3. Process block-level elements line by line
    const lines = text.split('\n');
    const out = [];
    let inList = null; // 'ul' | 'ol' | null

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Code block placeholder — emit as-is
        const cbMatch = line.match(/^\x00CB(\d+)\x00$/);
        if (cbMatch) {
            if (inList) { out.push(`</${inList}>`); inList = null; }
            out.push(codeBlocks[+cbMatch[1]]);
            continue;
        }

        // Headings: ### heading
        const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
        if (hMatch) {
            if (inList) { out.push(`</${inList}>`); inList = null; }
            const level = hMatch[1].length;
            out.push(`<h${level + 2} class="md-heading">${inlineFormat(hMatch[2])}</h${level + 2}>`);
            continue;
        }

        // Unordered list: - item or * item
        const ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
        if (ulMatch) {
            if (inList !== 'ul') {
                if (inList) out.push(`</${inList}>`);
                out.push('<ul>');
                inList = 'ul';
            }
            out.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
            continue;
        }

        // Ordered list: 1. item
        const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);
        if (olMatch) {
            if (inList !== 'ol') {
                if (inList) out.push(`</${inList}>`);
                out.push('<ol>');
                inList = 'ol';
            }
            out.push(`<li>${inlineFormat(olMatch[1])}</li>`);
            continue;
        }

        // Close any open list
        if (inList) { out.push(`</${inList}>`); inList = null; }

        // Empty line → paragraph break
        if (line.trim() === '') {
            out.push('<br>');
            continue;
        }

        // Regular paragraph
        out.push(`<p class="md-p">${inlineFormat(line)}</p>`);
    }

    if (inList) out.push(`</${inList}>`);
    return out.join('');
}

/** Inline formatting: bold, italic, inline code, links */
function inlineFormat(text) {
    return text
        // Bold + italic: ***text***
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        // Bold: **text**
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic: *text* (but not inside words like file_name)
        .replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<em>$1</em>')
        // Inline code: `text`
        .replace(/`([^`]+?)`/g, '<code>$1</code>')
        // Links: [text](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
