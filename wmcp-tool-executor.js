/**
 * WMCP Tool Executor v2
 * Executes inferred tools by Strategy Pattern — each category has its own execution logic.
 * 
 * Supports 12 categories including:
 * - richtext: contenteditable / WYSIWYG editors (social media composers)
 * - file-upload: file inputs and drop zones
 * - social-action: like, share, follow, comment triggers
 * 
 * Tool names use MCP dot notation: category.action-slug
 */

const WMCPExecutor = {
    /**
     * Execute an inferred tool.
     * @param {object} tool - The inferred tool object (with ._el reference)
     * @param {object} args - Parsed input arguments
     * @returns {string} Execution result description
     */
    async execute(tool, args) {
        const strategy = this.strategies[tool.category];
        if (!strategy) {
            throw new Error(`[WMCP-Executor] No strategy for category "${tool.category}"`);
        }
        console.debug(`[WMCP-Executor] Executing "${tool.name}" (${tool.category})`, args);
        return strategy(tool, args);
    },

    strategies: {
        // ── FORM ──
        form(tool, args) {
            const form = tool._el;
            if (!form) throw new Error('Form element not found');

            const parsed = typeof args === 'string' ? JSON.parse(args) : args;
            for (const [key, value] of Object.entries(parsed)) {
                const input = form.querySelector(`[name="${key}"], #${key}`);
                if (input) {
                    if (input.tagName === 'SELECT') {
                        const opt = [...input.options].find(o =>
                            o.value.toLowerCase() === String(value).toLowerCase()
                        );
                        if (opt) input.value = opt.value;
                    } else if (input.type === 'checkbox') {
                        input.checked = !!value;
                    } else if (input.type === 'radio') {
                        const radio = form.querySelector(`input[type="radio"][name="${key}"][value="${value}"]`);
                        if (radio) radio.checked = true;
                    } else {
                        input.value = value;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }

            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            return `Form "${tool.name}" submitted with ${Object.keys(parsed).length} fields`;
        },

        // ── NAVIGATION ──
        navigation(tool) {
            const link = tool._el;
            if (!link) throw new Error('Navigation link not found');
            const href = link.getAttribute('href');
            if (href) {
                link.click();
                return `Navigated to: ${href}`;
            }
            throw new Error('No href found');
        },

        // ── SEARCH ──
        search(tool, args) {
            const el = tool._el;
            if (!el) throw new Error('Search input not found');

            const parsed = typeof args === 'string' ? JSON.parse(args) : args;
            const query = parsed.query || '';

            el.value = query;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));

            // Try submitting parent form
            const form = tool._form || el.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            } else {
                // Simulate Enter key
                el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            }

            return `Searched for: "${query}"`;
        },

        // ── INTERACTIVE (click, tab, toggle, combobox) ──
        interactive(tool, args) {
            const el = tool._el;
            if (!el) throw new Error('Interactive element not found');

            // Toggle
            if (tool.name.includes('.toggle-')) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : (args || {});
                if (el.type === 'checkbox' || el.getAttribute('role') === 'switch') {
                    const desired = parsed.checked !== undefined ? !!parsed.checked : !el.checked;
                    if (el.checked !== desired) el.click();
                    return `Toggled "${tool.name}" to ${desired ? 'ON' : 'OFF'}`;
                }
            }

            // Select option (combobox / listbox)
            if (tool.name.includes('.select-') && args) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                const value = parsed.value;
                if (value) {
                    el.click();
                    setTimeout(() => {
                        const opts = [...document.querySelectorAll('[role="option"]')];
                        const match = opts.find(o => o.textContent.trim().toLowerCase() === value.toLowerCase());
                        if (match) match.click();
                    }, 100);
                    return `Selected "${value}" from ${tool.name}`;
                }
            }

            // Default: click
            el.click();
            return `Clicked: ${tool.name}`;
        },

        // ── MEDIA ──
        media(tool, args) {
            const el = tool._el;
            if (!el) throw new Error('Media element not found');

            if (tool.name.includes('.play-')) {
                el.play();
                return `Playing: ${tool.description}`;
            }
            if (tool.name.includes('.pause-')) {
                el.pause();
                return `Paused: ${tool.description}`;
            }
            if (tool.name.includes('.seek-')) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                el.currentTime = parsed.time || 0;
                return `Seeked to ${parsed.time}s: ${tool.description}`;
            }

            return 'Unknown media action';
        },

        // ── E-COMMERCE ──
        ecommerce(tool, args) {
            const el = tool._el;
            if (!el) throw new Error('E-commerce element not found');

            if (tool.name.includes('.add-to-cart-')) {
                el.click();
                return `Added to cart: ${tool.description}`;
            }

            if (tool.name.includes('.set-quantity-')) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                el.value = parsed.quantity || 1;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return `Set quantity to ${parsed.quantity}`;
            }

            el.click();
            return `E-commerce action: ${tool.name}`;
        },

        // ── AUTH ──
        auth(tool, args) {
            if (tool.name === 'auth.login') {
                const form = tool._el;
                if (!form) throw new Error('Login form not found');
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                for (const [key, value] of Object.entries(parsed)) {
                    const input = form.querySelector(`[name="${key}"], #${key}`);
                    if (input) {
                        input.value = value;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                return 'Login form submitted';
            }

            if (tool.name === 'auth.logout') {
                const el = tool._el;
                if (el) el.click();
                return 'Logout clicked';
            }

            throw new Error(`Unknown auth tool: ${tool.name}`);
        },

        // ── PAGE STATE ──
        'page-state'(tool) {
            if (tool.name === 'page.scroll-to-top') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return 'Scrolled to top';
            }
            if (tool.name === 'page.scroll-to-bottom') {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                return 'Scrolled to bottom';
            }
            if (tool.name === 'page.toggle-theme' || tool.name === 'page.click-back-to-top') {
                const el = tool._el;
                if (el) el.click();
                return `Executed: ${tool.name}`;
            }
            return 'Unknown page state action';
        },

        // ── SCHEMA.ORG ──
        'schema-org'(tool, args) {
            const action = tool._schemaAction;
            if (!action || !action.target) throw new Error('No Schema.org target');

            let url = typeof action.target === 'string'
                ? action.target
                : action.target.urlTemplate || action.target.url || '';

            if (args) {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                for (const [key, value] of Object.entries(parsed)) {
                    url = url.replace(`{${key}}`, encodeURIComponent(value));
                }
            }

            if (url) {
                window.location.href = url;
                return `Navigating to Schema.org action: ${url}`;
            }

            throw new Error('Could not resolve Schema.org action URL');
        },

        // ── RICH TEXT / CONTENTEDITABLE ──
        richtext(tool, args) {
            const parsed = typeof args === 'string' ? JSON.parse(args) : args;
            const text = parsed.text || '';
            if (!text) throw new Error('No text provided');

            // ── Helpers ──
            const isReady = (e) =>
                e && e.isConnected && e.getBoundingClientRect().height > 0;
            const esc = (s) => s
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            // Generic query: find a contenteditable on the page
            // (priority: Quill → ProseMirror → role=textbox → any)
            const findEditor = () => document.querySelector(
                '.ql-editor[contenteditable="true"], ' +
                '.ProseMirror[contenteditable="true"], ' +
                '[contenteditable="true"][role="textbox"], ' +
                '[contenteditable="true"]'
            );

            return new Promise(async (resolve) => {
                try {
                    // ── 1. RESOLVE the editable element ──
                    let editable = tool._el;
                    // If _el is a container, drill down to the actual editable child
                    if (editable && !editable.getAttribute?.('contenteditable')) {
                        editable = editable.querySelector?.('.ql-editor')
                            || editable.querySelector?.('[contenteditable="true"]')
                            || editable;
                    }

                    // ── 2. AUTO-ACTIVATION ──
                    // If the editor isn't visible (e.g. behind a "Create post" button),
                    // find a trigger button by its semantic text and click it.
                    if (!isReady(editable)) {
                        // Maybe there's already an editor elsewhere on the page
                        editable = findEditor();

                        if (!isReady(editable)) {
                            // No editor in DOM — scan for a trigger button.
                            // Generic: match by text / aria-label using content-creation
                            // keywords across languages. NOT platform-specific selectors.
                            const buttons = [...document.querySelectorAll(
                                'button, [role="button"]'
                            )];
                            const trigger = buttons.find(btn => {
                                if (!isReady(btn)) return false;
                                const label = (
                                    (btn.textContent || '') + ' ' +
                                    (btn.getAttribute('aria-label') || '')
                                ).toLowerCase();
                                return /\b(post|compose|write|create|tweet|reply|comment|scrivi|pubblica|crea|nouveau|erstellen|escribir|rédiger)\b/i.test(label);
                            });

                            if (trigger) {
                                trigger.click();
                                // Poll for editor to appear (up to ~3 s)
                                for (let i = 0; i < 15; i++) {
                                    await new Promise(r => setTimeout(r, 200));
                                    editable = findEditor();
                                    if (isReady(editable)) break;
                                }
                            }
                        }

                        if (!isReady(editable)) {
                            throw new Error(
                                'Editor not found — could not activate the composer'
                            );
                        }
                    }

                    // ── 3. FRAMEWORK DETECTION ──
                    const isQuill = editable.classList.contains('ql-editor')
                        || !!editable.closest?.('.ql-container');

                    // ── 4. FOCUS & SETTLE ──
                    editable.focus();
                    await new Promise(r => setTimeout(r, 200));

                    // ── 5. INSERT TEXT ──
                    const lines = text.split('\n');

                    if (isQuill) {
                        // QUILL: build <p> elements directly.
                        // Quill's MutationObserver syncs DOM → internal Delta.
                        editable.innerHTML = '';
                        for (const line of lines) {
                            const p = document.createElement('p');
                            if (line.trim().length === 0) {
                                p.innerHTML = '<br>';
                            } else {
                                p.textContent = line;
                            }
                            editable.appendChild(p);
                        }
                        editable.classList.remove('ql-blank');

                    } else {
                        // ALL OTHER EDITORS (Draft.js, ProseMirror, Slate, generic):
                        // Use CLIPBOARD PASTE SIMULATION.
                        //
                        // Why: React-based editors (Draft.js on X.com, Slate, etc.)
                        // maintain their own internal state. Direct DOM manipulation
                        // (execCommand, innerHTML) desynchronises that state — the
                        // text appears visually but the framework doesn't know about
                        // it, so the Post button stays disabled and the text becomes
                        // immutable.
                        //
                        // Paste events go through the editor's OWN paste handler,
                        // which properly updates internal state (Draft.js EditorState,
                        // ProseMirror Transaction, React state, etc.).

                        // a) Select all existing content (so paste replaces it)
                        const sel = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(editable);
                        sel.removeAllRanges();
                        sel.addRange(range);

                        // b) Build clipboard data (both plain text and HTML)
                        const dt = new DataTransfer();
                        dt.setData('text/plain', text);
                        dt.setData('text/html',
                            lines.map(l => `<p>${l.trim() ? esc(l) : '<br>'}</p>`).join('')
                        );

                        // c) Dispatch the paste event
                        editable.dispatchEvent(new ClipboardEvent('paste', {
                            bubbles: true,
                            cancelable: true,
                            clipboardData: dt
                        }));

                        // d) Wait for the editor framework to process the paste
                        await new Promise(r => setTimeout(r, 500));

                        // e) Verify: if paste didn't insert anything, fall back
                        //    to execCommand line-by-line (last resort)
                        const content = editable.innerText || editable.textContent || '';
                        if (content.trim().length < 5) {
                            console.warn('[WMCP-Executor] Paste simulation did not take effect, falling back to execCommand');
                            editable.focus();
                            document.execCommand('selectAll', false, null);
                            document.execCommand('delete', false, null);
                            for (let i = 0; i < lines.length; i++) {
                                if (i > 0) {
                                    document.execCommand('insertParagraph', false, null);
                                }
                                if (lines[i].length > 0) {
                                    document.execCommand('insertText', false, lines[i]);
                                }
                                if (i % 3 === 2) {
                                    await new Promise(r => setTimeout(r, 15));
                                }
                            }
                        }
                    }

                    // ── 6. NOTIFY FRAMEWORK ──
                    editable.dispatchEvent(new InputEvent('input', {
                        bubbles: true, cancelable: true,
                        inputType: 'insertText', data: text
                    }));
                    editable.dispatchEvent(new Event('change', { bubbles: true }));

                    resolve(`Wrote ${text.length} chars to "${tool.title || tool.name}"`);
                } catch (e) {
                    // Ultimate fallback: innerHTML with <p> tags
                    console.warn('[WMCP-Executor] richtext failed:', e);
                    try {
                        const fb = findEditor() || tool._el;
                        if (!fb) throw e;
                        const lns = text.split('\n');
                        fb.innerHTML = lns
                            .map(l => `<p>${l.trim() ? esc(l) : '<br>'}</p>`)
                            .join('');
                        fb.classList?.remove('ql-blank');
                        fb.dispatchEvent(new InputEvent('input', {
                            bubbles: true, cancelable: true,
                            inputType: 'insertText', data: text
                        }));
                        resolve(`Wrote ${text.length} chars (fallback) to "${tool.title || tool.name}"`);
                    } catch (e2) {
                        resolve(`Failed: ${e.message}`);
                    }
                }
            });
        },

        // ── FILE UPLOAD (NEW) ──
        'file-upload'(tool, args) {
            const el = tool._el;
            if (!el) throw new Error('Upload element not found');

            const parsed = typeof args === 'string' ? JSON.parse(args) : args;
            const filePath = parsed.file_path;

            if (!filePath) throw new Error('No file_path provided');

            // If element is a file input, we can't programmatically set files for security.
            // But we can click it to open the file dialog.
            if (el.tagName === 'INPUT' && el.type === 'file') {
                el.click();
                return `Opened file picker for: ${tool.title || tool.name}. ` +
                    `Please manually select: ${filePath}. ` +
                    `Note: For automated file upload, use Chrome DevTools MCP upload_file tool.`;
            }

            // For other elements (drop zones, buttons), just click
            el.click();
            return `Clicked upload trigger: ${tool.title || tool.name}. Please use Chrome DevTools MCP for actual file upload.`;
        },

        // ── SOCIAL ACTIONS (NEW) ──
        'social-action'(tool) {
            const el = tool._el;
            if (!el) throw new Error('Social action element not found');

            el.click();

            // Determine action type from tool name
            if (tool.name.includes('.like-')) return `Liked: ${tool.description}`;
            if (tool.name.includes('.share-')) return `Shared/Reposted: ${tool.description}`;
            if (tool.name.includes('.follow-')) return `Followed/Subscribed: ${tool.description}`;
            if (tool.name.includes('.comment-')) return `Opened comment/reply: ${tool.description}`;

            return `Social action executed: ${tool.name}`;
        }
    }
};

window.__wmcpExecutor = WMCPExecutor;
