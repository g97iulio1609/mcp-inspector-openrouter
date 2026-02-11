/**
 * WMCP Auto-Inference Engine v3
 * Scans the DOM across 12 categories to discover actionable tools.
 * 
 * MCP-Compliant:
 * - Tool names use dot notation for grouping: category.action-slug
 * - Each tool has: name, title, description, category, inputSchema, annotations, confidence
 * - Annotations follow MCP spec: readOnlyHint, destructiveHint, idempotentHint, openWorldHint
 *
 * v3 fixes:
 * - Precision filtering: social-action uses exact first-word matching, not substring
 * - Interactive scanner skips buttons already claimed by social/nav/search scanners
 * - File-upload drops overbroad aria-label*=foto selectors
 * - Per-category cap (MAX_TOOLS_PER_CATEGORY) prevents noise explosion
 * - Global element dedup across scanners
 */

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MAX_TOOLS_PER_CATEGORY = 15;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Global set of DOM elements already claimed by a scanner, used for cross-scanner dedup */
const _claimedElements = new WeakSet();

function slugify(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64);
}

function getLabel(el) {
    // 1. aria-label
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    // 2. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const ref = document.getElementById(labelledBy);
        if (ref) return ref.textContent.trim();
    }
    // 3. <label> with for= matching id
    if (el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) return lbl.textContent.trim();
    }
    // 4. title attribute
    if (el.title) return el.title.trim();
    // 5. placeholder
    if (el.placeholder) return el.placeholder.trim();
    // 6. data-placeholder (used by many rich text editors)
    if (el.dataset?.placeholder) return el.dataset.placeholder.trim();
    // 7. innerText (capped, single line only — avoids garbage from nested elements)
    const txt = el.textContent?.trim();
    if (txt && txt.length < 60 && !txt.includes('\n')) return txt;
    return '';
}

function computeConfidence(signals) {
    // signals: { hasAria, hasLabel, hasName, isVisible, hasRole, hasSemanticTag }
    let score = 0.4; // baseline
    if (signals.hasAria) score += 0.15;
    if (signals.hasLabel) score += 0.15;
    if (signals.hasName) score += 0.1;
    if (signals.hasRole) score += 0.1;
    if (signals.hasSemanticTag) score += 0.1;
    if (signals.isVisible === false) score -= 0.2;
    return Math.min(1, Math.max(0, score));
}

function isVisible(el) {
    if (!el.offsetParent && el.style?.display !== 'fixed') return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Check if an element has meaningful size — skips tiny/hidden utility buttons.
 * minW/minH in CSS pixels.
 */
function hasMeaningfulSize(el, minW = 24, minH = 24) {
    const rect = el.getBoundingClientRect?.();
    if (!rect) return true; // can't measure, assume ok
    return rect.width >= minW && rect.height >= minH;
}

function makeInputSchema(fields) {
    const props = {};
    const required = [];
    for (const f of fields) {
        const prop = { type: f.type || 'string' };
        if (f.description) prop.description = f.description;
        if (f.enum) prop.enum = f.enum;
        if (f.default !== undefined) prop.default = f.default;
        props[f.name] = prop;
        if (f.required) required.push(f.name);
    }
    return JSON.stringify({
        type: 'object',
        properties: props,
        ...(required.length ? { required } : {})
    });
}

/**
 * Build MCP-compliant annotations object.
 * @param {object} hints - { readOnly, destructive, idempotent, openWorld }
 * @returns {object} MCP annotations
 */
function makeAnnotations(hints = {}) {
    return {
        readOnlyHint: hints.readOnly ?? false,
        destructiveHint: hints.destructive ?? false,
        idempotentHint: hints.idempotent ?? false,
        openWorldHint: hints.openWorld ?? true
    };
}

/**
 * Test if a label string indicates a social action (like, share, follow, comment).
 * Uses word-boundary matching instead of substring.
 */
const SOCIAL_KEYWORDS_RE = /\b(like|mi piace|consiglia|upvote|heart|share|condividi|diffondi|repost|retweet|follow|segui|subscribe|iscriviti|comment|commenta|reply|rispondi)\b/i;
function isSocialKeyword(label) {
    return SOCIAL_KEYWORDS_RE.test(label);
}

/**
 * Recursively collect open Shadow DOM roots from a root element.
 * Returns an array of shadowRoot nodes that can be scanned.
 */
function collectShadowRoots(root, maxDepth = 5) {
    const roots = [];
    if (maxDepth <= 0) return roots;
    const walk = (node, depth) => {
        if (depth > maxDepth) return;
        if (node.shadowRoot) {
            roots.push(node.shadowRoot);
            walk(node.shadowRoot, depth + 1);
        }
        const children = node.children || node.querySelectorAll?.('*') || [];
        for (const child of children) {
            if (child.shadowRoot) {
                roots.push(child.shadowRoot);
                walk(child.shadowRoot, depth + 1);
            }
        }
    };
    walk(root, 0);
    return roots;
}

// ──────────────────────────────────────────────
// 1. FORMS (non-WMCP native)
// ──────────────────────────────────────────────

function extractFormTools(root) {
    const tools = [];
    // Only infer from forms that DON'T already have toolname (those are declarative)
    const forms = root.querySelectorAll('form:not([toolname])');

    for (const form of forms) {
        const name = slugify(
            form.getAttribute('aria-label') ||
            form.id ||
            form.action?.split('/').pop() ||
            'form'
        ) || 'unnamed-form';

        const inputs = form.querySelectorAll('input, select, textarea');
        if (inputs.length === 0) continue;

        const fields = [];
        for (const inp of inputs) {
            if (inp.type === 'hidden' || inp.type === 'submit') continue;
            const fieldName = inp.name || inp.id || slugify(getLabel(inp)) || 'field';
            const field = {
                name: fieldName,
                type: inp.type === 'number' ? 'number' : 'string',
                description: getLabel(inp),
                required: inp.required || inp.getAttribute('aria-required') === 'true'
            };
            // Enums for select/radio
            if (inp.tagName === 'SELECT') {
                field.enum = [...inp.options].map(o => o.value).filter(Boolean);
            }
            fields.push(field);
        }

        // Radio groups
        const radioGroups = new Map();
        for (const radio of form.querySelectorAll('input[type="radio"]')) {
            const gName = radio.name || 'radio';
            if (!radioGroups.has(gName)) radioGroups.set(gName, []);
            radioGroups.get(gName).push(radio.value);
        }
        for (const [gName, vals] of radioGroups) {
            const idx = fields.findIndex(f => f.name === gName);
            if (idx >= 0) fields.splice(idx, 1);
            fields.push({ name: gName, type: 'string', enum: vals });
        }

        if (fields.length === 0) continue;

        const hasAriaLabel = !!form.getAttribute('aria-label');
        tools.push({
            name: `form.submit-${name}`,
            title: `Submit: ${getLabel(form) || name}`,
            description: `Submit form: ${getLabel(form) || name}`,
            category: 'form',
            inputSchema: makeInputSchema(fields),
            annotations: makeAnnotations({ destructive: true, idempotent: false }),
            confidence: computeConfidence({
                hasAria: hasAriaLabel,
                hasLabel: !!getLabel(form),
                hasName: !!form.id,
                isVisible: isVisible(form),
                hasRole: false,
                hasSemanticTag: true
            }),
            _source: 'inferred',
            _el: form
        });
    }
    return tools;
}

// ──────────────────────────────────────────────
// 2. NAVIGATION
// ──────────────────────────────────────────────

function extractNavigationTools(root) {
    const tools = [];
    const navLinks = root.querySelectorAll('nav a[href], [role="navigation"] a[href]');
    for (const link of navLinks) {
        const href = link.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:')) continue;
        const label = getLabel(link) || link.textContent.trim();
        if (!label) continue;

        tools.push({
            name: `nav.go-${slugify(label)}`,
            title: `Navigate: ${label}`,
            description: `Navigate to: ${label}`,
            category: 'navigation',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({ readOnly: true, idempotent: true }),
            confidence: computeConfidence({
                hasAria: !!link.getAttribute('aria-label'),
                hasLabel: true,
                hasName: true,
                isVisible: isVisible(link),
                hasRole: true,
                hasSemanticTag: true
            }),
            _source: 'inferred',
            _el: link
        });
    }
    return tools;
}

// ──────────────────────────────────────────────
// 3. SEARCH
// ──────────────────────────────────────────────

function extractSearchTools(root) {
    const tools = [];
    const searchInputs = root.querySelectorAll(
        'input[type="search"], [role="search"] input, input[name*="search" i], input[name*="query" i], input[name="q"], input[name="s"]'
    );

    for (const inp of searchInputs) {
        const form = inp.closest('form');
        const name = slugify(
            inp.getAttribute('aria-label') ||
            inp.placeholder ||
            'search'
        );

        tools.push({
            name: `search.query-${name}`,
            title: `Search: ${getLabel(inp) || 'site search'}`,
            description: `Search: ${getLabel(inp) || 'site search'}`,
            category: 'search',
            inputSchema: makeInputSchema([{
                name: 'query',
                type: 'string',
                description: 'Search query',
                required: true
            }]),
            annotations: makeAnnotations({ readOnly: true, idempotent: true }),
            confidence: computeConfidence({
                hasAria: !!inp.getAttribute('aria-label'),
                hasLabel: !!getLabel(inp),
                hasName: true,
                isVisible: isVisible(inp),
                hasRole: !!inp.closest('[role="search"]'),
                hasSemanticTag: inp.type === 'search'
            }),
            _source: 'inferred',
            _el: inp,
            _form: form
        });
    }
    return tools;
}

// ──────────────────────────────────────────────
// 4. INTERACTIVE CONTROLS (buttons, toggles, tabs)
// ──────────────────────────────────────────────

function extractInteractiveTools(root) {
    const tools = [];

    // ── Buttons ──
    // Only capture buttons that are:
    //   1. Visible and meaningfully sized
    //   2. Not already claimed by another scanner (social-action, nav, search)
    //   3. Not a submit inside a form
    //   4. Have a clean, short label (skip garbage)
    //   5. Not a social-action keyword (those belong to social-action scanner)
    const buttons = root.querySelectorAll(
        'button:not(form[toolname] button), [role="button"]:not(a), input[type="button"]'
    );
    for (const btn of buttons) {
        if (tools.length >= MAX_TOOLS_PER_CATEGORY) break;
        if (btn.type === 'submit' && btn.closest('form:not([toolname])')) continue;
        if (_claimedElements.has(btn)) continue;
        if (!isVisible(btn)) continue;
        if (!hasMeaningfulSize(btn, 30, 20)) continue;

        const label = getLabel(btn);
        if (!label || label.length < 2 || label.length > 60) continue;
        // Skip social actions — they belong to the social-action scanner
        if (isSocialKeyword(label)) continue;
        // Skip generic accessibility skip-links
        if (/^(vai a|skip to|go to content)/i.test(label)) continue;

        _claimedElements.add(btn);
        tools.push({
            name: `ui.click-${slugify(label)}`,
            title: `Click: ${label}`,
            description: `Click: ${label}`,
            category: 'interactive',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({ destructive: false, idempotent: false }),
            confidence: computeConfidence({
                hasAria: !!btn.getAttribute('aria-label'),
                hasLabel: true,
                hasName: !!btn.id,
                isVisible: true,
                hasRole: btn.getAttribute('role') === 'button' || btn.tagName === 'BUTTON',
                hasSemanticTag: btn.tagName === 'BUTTON'
            }),
            _source: 'inferred',
            _el: btn
        });
    }

    // ── Tabs ──
    const tabs = root.querySelectorAll('[role="tab"]');
    for (const tab of tabs) {
        if (_claimedElements.has(tab)) continue;
        const label = getLabel(tab);
        if (!label) continue;
        _claimedElements.add(tab);
        tools.push({
            name: `ui.select-tab-${slugify(label)}`,
            title: `Tab: ${label}`,
            description: `Select tab: ${label}`,
            category: 'interactive',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({ readOnly: true, idempotent: true }),
            confidence: 0.85,
            _source: 'inferred',
            _el: tab
        });
    }

    // ── Toggle switches ──
    const toggles = root.querySelectorAll(
        '[role="switch"], input[type="checkbox"][role="switch"]'
    );
    for (const toggle of toggles) {
        if (_claimedElements.has(toggle)) continue;
        const label = getLabel(toggle);
        if (!label) continue;
        _claimedElements.add(toggle);
        tools.push({
            name: `ui.toggle-${slugify(label)}`,
            title: `Toggle: ${label}`,
            description: `Toggle: ${label}`,
            category: 'interactive',
            inputSchema: makeInputSchema([{
                name: 'checked',
                type: 'boolean',
                description: 'Desired state'
            }]),
            annotations: makeAnnotations({ destructive: false, idempotent: true }),
            confidence: 0.9,
            _source: 'inferred',
            _el: toggle
        });
    }

    // ── Dropdowns / comboboxes ──
    const combos = root.querySelectorAll('[role="combobox"], [role="listbox"]');
    for (const combo of combos) {
        if (_claimedElements.has(combo)) continue;
        const label = getLabel(combo);
        if (!label) continue;
        _claimedElements.add(combo);
        const options = [...combo.querySelectorAll('[role="option"]')].map(
            o => o.textContent.trim()
        );
        tools.push({
            name: `ui.select-${slugify(label)}`,
            title: `Select: ${label}`,
            description: `Select option from: ${label}`,
            category: 'interactive',
            inputSchema: makeInputSchema([{
                name: 'value',
                type: 'string',
                description: 'Option to select',
                ...(options.length ? { enum: options } : {})
            }]),
            annotations: makeAnnotations({ destructive: false, idempotent: true }),
            confidence: 0.85,
            _source: 'inferred',
            _el: combo
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 5. MEDIA
// ──────────────────────────────────────────────

function extractMediaTools(root) {
    const tools = [];

    const videos = root.querySelectorAll('video');
    for (const video of videos) {
        const label = getLabel(video) || video.getAttribute('aria-label') || 'video';
        const id = slugify(video.id || label);

        tools.push({
            name: `media.play-${id}`,
            title: `Play: ${label}`,
            description: `Play video: ${label}`,
            category: 'media',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({ readOnly: true, idempotent: true }),
            confidence: 0.9,
            _source: 'inferred',
            _el: video
        });

        tools.push({
            name: `media.pause-${id}`,
            title: `Pause: ${label}`,
            description: `Pause video: ${label}`,
            category: 'media',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({ readOnly: true, idempotent: true }),
            confidence: 0.9,
            _source: 'inferred',
            _el: video
        });

        if (video.duration) {
            tools.push({
                name: `media.seek-${id}`,
                title: `Seek: ${label}`,
                description: `Seek video to time: ${label}`,
                category: 'media',
                inputSchema: makeInputSchema([{
                    name: 'time',
                    type: 'number',
                    description: 'Time in seconds'
                }]),
                annotations: makeAnnotations({ readOnly: true, idempotent: true }),
                confidence: 0.85,
                _source: 'inferred',
                _el: video
            });
        }
    }

    const audios = root.querySelectorAll('audio');
    for (const audio of audios) {
        const label = getLabel(audio) || 'audio';
        const id = slugify(audio.id || label);
        tools.push({
            name: `media.play-audio-${id}`,
            title: `Play Audio: ${label}`,
            description: `Play audio: ${label}`,
            category: 'media',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({ readOnly: true, idempotent: true }),
            confidence: 0.9,
            _source: 'inferred',
            _el: audio
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 6. E-COMMERCE
// ──────────────────────────────────────────────

function extractEcommerceTools(root) {
    const tools = [];

    const addToCart = root.querySelectorAll(
        '[data-action="add-to-cart"], button[class*="add-to-cart" i], button[id*="add-to-cart" i], ' +
        'button[aria-label*="add to cart" i], [data-mcp-type="add-to-cart"]'
    );
    for (const btn of addToCart) {
        const product = btn.closest('[itemtype*="Product"], [data-product-id], .product');
        const productName = product?.querySelector('[itemprop="name"]')?.textContent?.trim() || '';
        const productId = product?.dataset?.productId || slugify(productName) || 'item';

        tools.push({
            name: `shop.add-to-cart-${slugify(productId)}`,
            title: `Add to Cart: ${productName || productId}`,
            description: `Add to cart: ${productName || productId}`,
            category: 'ecommerce',
            inputSchema: makeInputSchema([{
                name: 'quantity',
                type: 'number',
                description: 'Quantity to add',
                default: 1
            }]),
            annotations: makeAnnotations({ destructive: true, idempotent: false }),
            confidence: 0.9,
            _source: 'inferred',
            _el: btn
        });
    }

    const qtyInputs = root.querySelectorAll(
        'input[name*="quantity" i], input[name*="qty" i], [data-mcp-type="quantity"]'
    );
    for (const inp of qtyInputs) {
        const product = inp.closest('[itemtype*="Product"], [data-product-id], .product');
        const label = product?.querySelector('[itemprop="name"]')?.textContent?.trim() || 'item';

        tools.push({
            name: `shop.set-quantity-${slugify(label)}`,
            title: `Set Quantity: ${label}`,
            description: `Set quantity for: ${label}`,
            category: 'ecommerce',
            inputSchema: makeInputSchema([{
                name: 'quantity',
                type: 'number',
                description: 'Desired quantity',
                required: true
            }]),
            annotations: makeAnnotations({ destructive: false, idempotent: true }),
            confidence: 0.8,
            _source: 'inferred',
            _el: inp
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 7. AUTHENTICATION
// ──────────────────────────────────────────────

function extractAuthTools(root) {
    const tools = [];

    const passwordInputs = root.querySelectorAll('input[type="password"]');
    for (const pwd of passwordInputs) {
        const form = pwd.closest('form');
        if (!form || form.getAttribute('toolname')) continue;

        const emailInput = form.querySelector(
            'input[type="email"], input[name*="email" i], input[name*="user" i], input[name*="login" i]'
        );

        const fields = [];
        if (emailInput) {
            fields.push({
                name: emailInput.name || 'email',
                type: 'string',
                description: 'Email or username',
                required: true
            });
        }
        fields.push({
            name: pwd.name || 'password',
            type: 'string',
            description: 'Password',
            required: true
        });

        tools.push({
            name: 'auth.login',
            title: 'Sign In',
            description: 'Sign in / Log in',
            category: 'auth',
            inputSchema: makeInputSchema(fields),
            annotations: makeAnnotations({ destructive: true, idempotent: false }),
            confidence: 0.95,
            _source: 'inferred',
            _el: form
        });
    }

    const logoutEls = root.querySelectorAll(
        'a[href*="logout" i], a[href*="sign-out" i], a[href*="signout" i], ' +
        'button[class*="logout" i], [data-action="logout"]'
    );
    for (const el of logoutEls) {
        tools.push({
            name: 'auth.logout',
            title: 'Sign Out',
            description: 'Sign out / Log out',
            category: 'auth',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({ destructive: true, idempotent: true }),
            confidence: 0.9,
            _source: 'inferred',
            _el: el
        });
        break;
    }

    return tools;
}

// ──────────────────────────────────────────────
// 8. PAGE STATE (scroll, print, theme)
// ──────────────────────────────────────────────

function extractPageStateTools(root) {
    const tools = [];

    tools.push({
        name: 'page.scroll-to-top',
        title: 'Scroll to Top',
        description: 'Scroll to the top of the page',
        category: 'page-state',
        inputSchema: makeInputSchema([]),
        annotations: makeAnnotations({ readOnly: true, idempotent: true }),
        confidence: 1.0,
        _source: 'inferred',
        _el: null
    });

    tools.push({
        name: 'page.scroll-to-bottom',
        title: 'Scroll to Bottom',
        description: 'Scroll to the bottom of the page',
        category: 'page-state',
        inputSchema: makeInputSchema([]),
        annotations: makeAnnotations({ readOnly: true, idempotent: true }),
        confidence: 1.0,
        _source: 'inferred',
        _el: null
    });

    const backToTop = root.querySelector(
        '[aria-label*="back to top" i], [class*="back-to-top" i], #back-to-top'
    );
    if (backToTop) {
        tools.push({
            name: 'page.click-back-to-top',
            title: 'Back to Top Button',
            description: 'Click the back-to-top button',
            category: 'page-state',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({ readOnly: true, idempotent: true }),
            confidence: 0.9,
            _source: 'inferred',
            _el: backToTop
        });
    }

    const themeToggle = root.querySelector(
        '[aria-label*="dark mode" i], [aria-label*="theme" i], ' +
        'button[class*="theme" i], [data-action="toggle-theme"]'
    );
    if (themeToggle) {
        tools.push({
            name: 'page.toggle-theme',
            title: 'Toggle Theme',
            description: 'Toggle dark/light mode',
            category: 'page-state',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({ readOnly: false, idempotent: false }),
            confidence: 0.85,
            _source: 'inferred',
            _el: themeToggle
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 9. SCHEMA.ORG POTENTIAL ACTIONS
// ──────────────────────────────────────────────

function extractSchemaOrgActions(root) {
    const tools = [];

    const ldScripts = root.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
        try {
            const data = JSON.parse(script.textContent);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
                if (!item.potentialAction) continue;
                const actions = Array.isArray(item.potentialAction) ? item.potentialAction : [item.potentialAction];
                for (const action of actions) {
                    const actionType = action['@type'] || 'Action';
                    const target = action.target;
                    const name = slugify(action.name || actionType);

                    const fields = [];
                    if (typeof target === 'object' && target['query-input']) {
                        const match = target['query-input'].match(/name=(\w+)/);
                        fields.push({
                            name: match ? match[1] : 'query',
                            type: 'string',
                            description: `Input for ${actionType}`,
                            required: true
                        });
                    } else if (typeof target === 'string' && target.includes('{')) {
                        const placeholders = target.match(/\{([^}]+)\}/g) || [];
                        for (const ph of placeholders) {
                            fields.push({
                                name: ph.replace(/[{}]/g, ''),
                                type: 'string',
                                description: `Parameter: ${ph.replace(/[{}]/g, '')}`,
                                required: true
                            });
                        }
                    }

                    tools.push({
                        name: `schema.${name}`,
                        title: `${actionType}: ${action.name || ''}`.trim(),
                        description: `${actionType}: ${action.name || ''}`.trim(),
                        category: 'schema-org',
                        inputSchema: makeInputSchema(fields),
                        annotations: makeAnnotations({ readOnly: true, idempotent: true }),
                        confidence: 0.95,
                        _source: 'inferred',
                        _el: null,
                        _schemaAction: action
                    });
                }
            }
        } catch (e) {
            // Invalid JSON-LD, skip
        }
    }

    return tools;
}

// ──────────────────────────────────────────────
// 10. RICH TEXT / CONTENTEDITABLE (NEW)
//     Detects social media post composers, WYSIWYG editors,
//     contenteditable divs, role="textbox" outside <form>
// ──────────────────────────────────────────────

function extractRichTextTools(root) {
    const tools = [];
    const seen = new Set(); // Avoid duplicates

    // Selectors for rich text editing surfaces
    const richTextSelectors = [
        // Generic contenteditable (the core selector)
        '[contenteditable="true"]',
        '[contenteditable="plaintext-only"]',
        // ARIA textbox not inside a standard form
        '[role="textbox"]:not(input):not(textarea)',
        // Platform-specific selectors
        '[data-testid*="tweetTextarea" i]',              // X.com / Twitter
        '[data-testid="post-composer" i]',                // Generic
        '[aria-label*="post" i][contenteditable]',        // LinkedIn, Facebook
        '[aria-label*="What\'s on your mind" i]',         // Facebook
        '[aria-label*="Start a post" i]',                 // LinkedIn
        '[aria-label*="write a comment" i]',              // Comments
        '[aria-label*="write a reply" i]',                // Replies
        '[aria-label*="scrivi un post" i]',               // LinkedIn IT
        '[aria-label*="componi" i]',                      // Generic IT
        // Popular WYSIWYG editors
        '.DraftEditor-root [contenteditable]',            // Draft.js (Facebook)
        '.ProseMirror',                                   // ProseMirror (many apps)
        '.ql-editor',                                     // Quill.js
        '.tox-edit-area__iframe',                         // TinyMCE (iframe)
        '.ck-editor__editable',                           // CKEditor 5
        '[data-slate-editor="true"]',                     // Slate.js
        '.CodeMirror-code',                               // CodeMirror
        '.monaco-editor .inputarea',                      // Monaco Editor
    ];

    const elements = root.querySelectorAll(richTextSelectors.join(', '));

    for (const el of elements) {
        if (tools.length >= MAX_TOOLS_PER_CATEGORY) break;
        if (_claimedElements.has(el)) continue;

        // Skip if too small (likely a hidden or utility element)
        const rect = el.getBoundingClientRect?.();
        if (rect && (rect.width < 50 || rect.height < 20)) continue;

        // Skip if inside a form that already has toolname
        if (el.closest('form[toolname]')) continue;

        // Build a unique key for dedup
        const label = getLabel(el);
        const elId = el.id || el.getAttribute('data-testid') || '';
        const dedupKey = `${label}::${elId}::${el.tagName}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        // Determine a human-readable name
        const slug = slugify(label || elId || 'editor');

        // Detect platform context for better descriptions
        const host = location.hostname;
        let platform = '';
        if (host.includes('linkedin')) platform = 'LinkedIn';
        else if (host.includes('twitter') || host.includes('x.com')) platform = 'X/Twitter';
        else if (host.includes('facebook') || host.includes('fb.com')) platform = 'Facebook';
        else if (host.includes('instagram')) platform = 'Instagram';
        else if (host.includes('threads.net')) platform = 'Threads';
        else if (host.includes('reddit')) platform = 'Reddit';
        else if (host.includes('mastodon') || host.includes('fosstodon')) platform = 'Mastodon';

        const descPrefix = platform ? `${platform} — ` : '';

        // Determine if this is a comment/reply vs a main post
        const isComment = /comment|reply|risposta|commento/i.test(label || '');
        const toolType = isComment ? 'comment' : 'compose';

        _claimedElements.add(el);
        tools.push({
            name: `richtext.${toolType}-${slug}`,
            title: `${descPrefix}${isComment ? 'Comment' : 'Compose'}: ${label || 'text editor'}`,
            description: `${descPrefix}Write text in: ${label || 'rich text editor'}`,
            category: 'richtext',
            inputSchema: makeInputSchema([{
                name: 'text',
                type: 'string',
                description: `Content to write${platform ? ` on ${platform}` : ''}`,
                required: true
            }]),
            annotations: makeAnnotations({ destructive: false, idempotent: true }),
            confidence: computeConfidence({
                hasAria: !!el.getAttribute('aria-label'),
                hasLabel: !!label,
                hasName: !!elId,
                isVisible: true,
                hasRole: el.getAttribute('role') === 'textbox' || el.isContentEditable,
                hasSemanticTag: false
            }),
            _source: 'inferred',
            _el: el
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 11. FILE UPLOAD (NEW)
//     Detects file inputs, drag-drop zones, image upload buttons
// ──────────────────────────────────────────────

function extractFileUploadTools(root) {
    const tools = [];

    // Standard file inputs — these are unambiguous
    const fileInputs = root.querySelectorAll('input[type="file"]');
    for (const inp of fileInputs) {
        if (tools.length >= MAX_TOOLS_PER_CATEGORY) break;
        if (_claimedElements.has(inp)) continue;
        const label = getLabel(inp) || inp.accept || 'file';
        const slug = slugify(label);
        const accept = inp.accept || '*/*';

        _claimedElements.add(inp);
        tools.push({
            name: `upload.file-${slug}`,
            title: `Upload: ${label}`,
            description: `Upload file (${accept}): ${label}`,
            category: 'file-upload',
            inputSchema: makeInputSchema([{
                name: 'file_path',
                type: 'string',
                description: `Path to file to upload (accepts: ${accept})`,
                required: true
            }]),
            annotations: makeAnnotations({ destructive: true, idempotent: false }),
            confidence: 0.95,
            _source: 'inferred',
            _el: inp
        });
    }

    // Drop zones — ONLY match explicit drop-zone/upload patterns in classes or data-testid.
    // Removed overbroad aria-label*=foto/photo/image which falsely matched
    // LinkedIn photo buttons, profile images, etc.
    const dropZones = root.querySelectorAll(
        '[class*="drop-zone" i], [class*="dropzone" i], [class*="upload-area" i], ' +
        '[data-testid*="upload" i], [data-testid*="dropzone" i]'
    );
    for (const zone of dropZones) {
        if (tools.length >= MAX_TOOLS_PER_CATEGORY) break;
        if (zone.tagName === 'INPUT' && zone.type === 'file') continue;
        if (_claimedElements.has(zone)) continue;
        if (!isVisible(zone)) continue;

        const label = getLabel(zone) || 'upload area';
        // Skip if label is too long / garbage (multi-line text fragments)
        if (label.length > 60 || label.includes('\n')) continue;
        const slug = slugify(label);

        const hiddenInput = zone.querySelector('input[type="file"]') ||
            zone.parentElement?.querySelector('input[type="file"]');

        _claimedElements.add(zone);
        tools.push({
            name: `upload.drop-${slug}`,
            title: `Upload: ${label}`,
            description: `Upload via drop zone: ${label}`,
            category: 'file-upload',
            inputSchema: makeInputSchema([{
                name: 'file_path',
                type: 'string',
                description: 'Path to file to upload',
                required: true
            }]),
            annotations: makeAnnotations({ destructive: true, idempotent: false }),
            confidence: 0.7,
            _source: 'inferred',
            _el: hiddenInput || zone
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// 12. SOCIAL ACTIONS (NEW)
//     Detects like, share, comment, repost, follow, subscribe
//     buttons common on social media platforms
// ──────────────────────────────────────────────

function extractSocialActionTools(root) {
    const tools = [];
    const seen = new Set();

    // ── Strategy: iterate ALL clickable elements with aria-label and
    //    classify them based on the FIRST meaningful word(s) of the label.
    //    This avoids the old approach of broad CSS substring selectors
    //    (aria-label*=share) which matched irrelevant buttons.

    const candidates = root.querySelectorAll(
        '[aria-label], [data-testid*="like" i], [data-testid*="share" i], ' +
        '[data-testid*="retweet" i], [data-testid*="follow" i], [data-testid*="comment" i], ' +
        '[data-testid*="reply" i]'
    );

    // Keyword patterns — must match as whole word at the START of the label
    // or as the PRIMARY action verb. Uses word-boundary regex.
    const LIKE_RE = /^(reagisci|like|mi piace|consiglia|upvote|heart)/i;
    const SHARE_RE = /^(share|condividi|diffondi|repost|retweet|diffusione)/i;
    const FOLLOW_RE = /^(follow|segui|subscribe|iscriviti)/i;
    const COMMENT_RE = /^(comment|commenta|reply|rispondi|risposta)/i;

    for (const btn of candidates) {
        if (tools.length >= MAX_TOOLS_PER_CATEGORY) break;
        if (_claimedElements.has(btn)) continue;
        if (!isVisible(btn)) continue;
        if (!hasMeaningfulSize(btn)) continue;

        const label = (btn.getAttribute('aria-label') || '').trim();
        const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (!label && !testId) continue;

        // Classify by label or data-testid
        let actionType = null;
        if (LIKE_RE.test(label) || testId.includes('like') || testId.includes('heart')) {
            actionType = 'like';
        } else if (SHARE_RE.test(label) || testId.includes('share') || testId.includes('retweet')) {
            actionType = 'share';
        } else if (FOLLOW_RE.test(label) || testId.includes('follow')) {
            actionType = 'follow';
        } else if (COMMENT_RE.test(label) || testId.includes('comment') || testId.includes('reply')) {
            // Skip if this is actually a contenteditable (handled by richtext scanner)
            if (btn.isContentEditable) continue;
            actionType = 'comment';
        }

        if (!actionType) continue;

        // Use a short, clean slug — just the action type + a short context
        const shortLabel = label.length > 40 ? label.slice(0, 40) : label;
        const slug = slugify(shortLabel) || actionType;
        const key = `${actionType}-${slug}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const descriptions = {
            like: 'Like/React',
            share: 'Share/Repost',
            follow: 'Follow/Subscribe',
            comment: 'Open comment/reply'
        };
        const titles = {
            like: 'Like',
            share: 'Share',
            follow: 'Follow',
            comment: 'Comment'
        };

        _claimedElements.add(btn);
        tools.push({
            name: `social.${actionType}-${slug}`,
            title: `${titles[actionType]}: ${shortLabel || actionType}`,
            description: `${descriptions[actionType]}: ${shortLabel || actionType}`,
            category: 'social-action',
            inputSchema: makeInputSchema([]),
            annotations: makeAnnotations({
                destructive: actionType !== 'comment',
                idempotent: actionType === 'comment'
            }),
            confidence: 0.8,
            _source: 'inferred',
            _el: btn
        });
    }

    return tools;
}

// ──────────────────────────────────────────────
// MASTER SCANNER CLASS
// ──────────────────────────────────────────────

class WMCPInferenceEngine {
    constructor() {
        this.cache = new Map(); // url → tools[]
        this.CACHE_TTL = 30000; // 30s
        this.AI_CONFIDENCE_THRESHOLD = 0.7; // below this → send to AI
        this.MIN_CONFIDENCE = 0.5; // below this → discard

        /**
         * All 12 category scanners in priority order.
         * IMPORTANT: Specialized scanners (social-action, richtext, file-upload)
         * run BEFORE the generic interactive scanner. This is critical because
         * interactive would otherwise claim all buttons, and _claimedElements
         * dedup means the first scanner to claim an element wins.
         */
        this.scanners = [
            { name: 'form', fn: extractFormTools },
            { name: 'navigation', fn: extractNavigationTools },
            { name: 'search', fn: extractSearchTools },
            { name: 'richtext', fn: extractRichTextTools },        // before interactive
            { name: 'social-action', fn: extractSocialActionTools }, // before interactive
            { name: 'file-upload', fn: extractFileUploadTools },    // before interactive
            { name: 'interactive', fn: extractInteractiveTools },   // generic — runs last among UI scanners
            { name: 'media', fn: extractMediaTools },
            { name: 'ecommerce', fn: extractEcommerceTools },
            { name: 'auth', fn: extractAuthTools },
            { name: 'page-state', fn: extractPageStateTools },
            { name: 'schema-org', fn: extractSchemaOrgActions },
        ];
    }

    /**
     * Scan the entire page across all 12 categories.
     * Low-confidence tools are auto-sent to the AI classifier for refinement.
     * Returns inferred tools array.
     */
    async scanPage(root = document) {
        // Reset the global element dedup set for each scan
        // (WeakSet doesn't have .clear() so we recreate conceptually by scanning fresh)
        // Note: _claimedElements is a WeakSet — entries are GC'd when elements are removed
        // We don't need to clear it explicitly since each scan runs sequentially.

        // Check cache
        const cacheKey = location.href;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.ts < this.CACHE_TTL)) {
            console.debug(`[WMCP-Inference] Cache hit for ${cacheKey} (${cached.tools.length} tools)`);
            return cached.tools;
        }

        const allTools = [];

        // Run all 12 category scanners on main root
        for (const scanner of this.scanners) {
            try {
                allTools.push(...scanner.fn(root));
            } catch (e) {
                console.warn(`[WMCP-Inference] Scanner "${scanner.name}" failed:`, e.message);
            }
        }

        // Also scan open Shadow DOM roots
        const shadowRoots = collectShadowRoots(root);
        if (shadowRoots.length > 0) {
            console.debug(`[WMCP-Inference] Found ${shadowRoots.length} open Shadow DOM root(s)`);
            for (const sr of shadowRoots) {
                for (const scanner of this.scanners) {
                    try {
                        allTools.push(...scanner.fn(sr));
                    } catch (e) {
                        console.warn(`[WMCP-Inference] Shadow scanner "${scanner.name}" failed:`, e.message);
                    }
                }
            }
        }

        // Deduplicate by name within inferred set (keep highest confidence)
        const deduped = new Map();
        for (const tool of allTools) {
            const existing = deduped.get(tool.name);
            if (!existing || tool.confidence > existing.confidence) {
                deduped.set(tool.name, tool);
            }
        }
        const final = [...deduped.values()];

        // Split into high-confidence and ambiguous
        const highConfidence = final.filter(t => t.confidence >= this.AI_CONFIDENCE_THRESHOLD);
        const ambiguous = final.filter(
            t => t.confidence >= this.MIN_CONFIDENCE && t.confidence < this.AI_CONFIDENCE_THRESHOLD
        );

        // Auto-trigger AI classifier for ambiguous tools
        let aiRefined = [];
        if (ambiguous.length > 0 && window.__wmcpAIClassifier) {
            try {
                const pageContext = {
                    url: location.href,
                    title: document.title,
                    description: document.querySelector('meta[name="description"]')?.content || ''
                };
                aiRefined = await window.__wmcpAIClassifier.classifyElements(ambiguous, pageContext);
                console.debug(
                    `[WMCP-Inference] AI refined ${aiRefined.length}/${ambiguous.length} ambiguous tools`
                );
            } catch (e) {
                console.warn('[WMCP-Inference] AI classification failed, keeping heuristic results:', e.message);
                aiRefined = ambiguous;
            }
        } else {
            aiRefined = ambiguous;
        }

        // Merge: high-confidence + AI-refined ambiguous
        const viable = [...highConfidence, ...aiRefined];

        // Cache result
        this.cache.set(cacheKey, { tools: viable, ts: Date.now() });

        console.debug(
            `[WMCP-Inference] Scanned ${location.href}: ${viable.length} tools ` +
            `(${highConfidence.length} high + ${aiRefined.length} AI-refined)`,
            { byCategory: this._countByCategory(viable) }
        );

        return viable;
    }

    /** Invalidate cache (e.g. on DOM mutation) */
    invalidateCache() {
        this.cache.clear();
    }

    _countByCategory(tools) {
        const counts = {};
        for (const t of tools) {
            counts[t.category] = (counts[t.category] || 0) + 1;
        }
        return counts;
    }
}

// Export singleton for use in content.js
window.__wmcpInferenceEngine = new WMCPInferenceEngine();
