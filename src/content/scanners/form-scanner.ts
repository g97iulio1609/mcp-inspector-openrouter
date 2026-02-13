/**
 * Form Scanner — discovers non-WMCP-native forms and their fields.
 * Only infers from forms that don't already have a `toolname` attribute.
 */

import type { Tool, ToolParameter } from '../../types';
import { BaseScanner } from './base-scanner';

function resolveFormActionPath(form: HTMLFormElement): string {
  const attrAction = form.getAttribute('action')?.trim();
  if (attrAction) {
    try {
      const url = new URL(attrAction, location.href);
      const fromPath = url.pathname.split('/').pop()?.trim();
      if (fromPath) return fromPath;
      return url.hostname || 'form';
    } catch {
      const direct = attrAction.split('/').pop()?.trim();
      if (direct) return direct;
    }
  }

  const actionValue: unknown = form.action;
  if (typeof actionValue === 'string' && actionValue.trim().length > 0) {
    const direct = actionValue.split('/').pop()?.trim();
    if (direct) return direct;
  }

  return 'form';
}

export class FormScanner extends BaseScanner {
  readonly category = 'form' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const forms = (root as ParentNode).querySelectorAll('form:not([toolname])');

    for (const form of forms) {
      const htmlForm = form as HTMLFormElement;
      const name =
        this.slugify(
          form.getAttribute('aria-label') ||
            form.id ||
            resolveFormActionPath(htmlForm) ||
            'form',
        ) || 'unnamed-form';

      const inputs = form.querySelectorAll('input, select, textarea');
      if (inputs.length === 0) continue;

      const fields: ToolParameter[] = [];
      for (const inp of inputs) {
        const inputEl = inp as HTMLInputElement;
        if (inputEl.type === 'hidden' || inputEl.type === 'submit') continue;
        const fieldName = inputEl.name || inputEl.id || this.slugify(this.getLabel(inp)) || 'field';
        const field: ToolParameter = {
          name: fieldName,
          type: inputEl.type === 'number' ? 'number' : 'string',
          description: this.getLabel(inp),
          required: inputEl.required || inp.getAttribute('aria-required') === 'true',
          // Enums for select
          ...(inp.tagName === 'SELECT'
            ? {
                enum: [...(inp as HTMLSelectElement).options]
                  .map(o => o.value)
                  .filter(Boolean),
              }
            : {}),
        };
        fields.push(field);
      }

      // Radio groups — collapse into a single enum field
      const radioGroups = new Map<string, string[]>();
      for (const radio of form.querySelectorAll('input[type="radio"]')) {
        const gName = (radio as HTMLInputElement).name || 'radio';
        if (!radioGroups.has(gName)) radioGroups.set(gName, []);
        radioGroups.get(gName)!.push((radio as HTMLInputElement).value);
      }
      for (const [gName, vals] of radioGroups) {
        const idx = fields.findIndex(f => f.name === gName);
        if (idx >= 0) fields.splice(idx, 1);
        fields.push({ name: gName, type: 'string', enum: vals });
      }

      if (fields.length === 0) continue;

      const hasAriaLabel = !!form.getAttribute('aria-label');
      const label = this.getLabel(form) || name;

      tools.push(
        this.createTool(
          `form.submit-${name}`,
          `Submit form: ${label}`,
          form as Element,
          this.makeInputSchema(fields),
          this.computeConfidence({
            hasAria: hasAriaLabel,
            hasLabel: !!this.getLabel(form),
            hasName: !!form.id,
            isVisible: this.isVisible(form as Element),
            hasRole: false,
            hasSemanticTag: true,
          }),
          {
            title: `Submit: ${label}`,
            annotations: this.makeAnnotations({ destructive: true, idempotent: false }),
          },
        ),
      );
    }

    // ── Second pass: standalone (orphan) input fields not inside any <form> ──

    const orphanSelector =
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea';
    const allInputs = (root as ParentNode).querySelectorAll(orphanSelector);

    /** Track radio groups already emitted so we collapse them into one tool */
    const emittedRadioGroups = new Set<string>();
    /** Track emitted slugs to avoid duplicate tool names */
    const emittedSlugs = new Set<string>();

    for (const el of allInputs) {
      if (tools.length >= this.maxTools) break;
      if (el.closest('form')) continue;
      if (this.isClaimed(el)) continue;
      if (!this.isVisible(el)) continue;

      const inputEl = el as HTMLInputElement;
      const inputType = inputEl.type?.toLowerCase() ?? '';

      // Radio groups — collapse into a single enum tool per group name
      if (inputType === 'radio') {
        const groupName = inputEl.name || 'radio';
        if (emittedRadioGroups.has(groupName)) continue;
        emittedRadioGroups.add(groupName);

        // Query all radios then filter by name in JS to avoid CSS selector injection
        const allRadios = (root as ParentNode).querySelectorAll('input[type="radio"]');
        const vals: string[] = [];
        for (const r of allRadios) {
          if ((r as HTMLInputElement).name === groupName && !(r as HTMLElement).closest('form')) {
            vals.push((r as HTMLInputElement).value);
            this.claim(r as Element);
          }
        }

        if (vals.length === 0) continue;

        const radioLabel = this.getLabel(el) || groupName;
        const radioSlug = this.slugify(groupName) || 'field';

        if (emittedSlugs.has(radioSlug)) continue;
        emittedSlugs.add(radioSlug);

        tools.push(
          this.createTool(
            `form.fill-${radioSlug}`,
            `Fill field: ${radioLabel}`,
            el,
            this.makeInputSchema([{ name: 'value', type: 'string', enum: vals }]),
            this.computeConfidence({
              hasAria: !!el.getAttribute('aria-label'),
              hasLabel: !!radioLabel,
              hasName: !!inputEl.name,
              isVisible: true,
              hasRole: false,
              hasSemanticTag: true,
            }),
            {
              title: `Fill: ${radioLabel}`,
              annotations: this.makeAnnotations({ destructive: false, idempotent: true }),
            },
          ),
        );
        continue;
      }

      const fieldName =
        inputEl.name || inputEl.id || this.slugify(this.getLabel(el)) || 'field';
      const orphanLabel = this.getLabel(el) || fieldName;
      let slug = this.slugify(fieldName) || 'field';

      // Deduplicate slug names
      if (emittedSlugs.has(slug)) {
        let suffix = 2;
        while (emittedSlugs.has(`${slug}-${suffix}`)) suffix++;
        slug = `${slug}-${suffix}`;
      }
      emittedSlugs.add(slug);

      let field: ToolParameter;

      if (el.tagName === 'SELECT') {
        const opts = [...(el as HTMLSelectElement).options]
          .map(o => o.value)
          .filter(Boolean);
        field = { name: 'value', type: 'string', enum: opts };
      } else if (inputType === 'checkbox') {
        field = { name: 'value', type: 'boolean' };
      } else {
        field = {
          name: 'value',
          type: inputType === 'number' ? 'number' : 'string',
        };
      }

      this.claim(el);

      tools.push(
        this.createTool(
          `form.fill-${slug}`,
          `Fill field: ${orphanLabel}`,
          el,
          this.makeInputSchema([field]),
          this.computeConfidence({
            hasAria: !!el.getAttribute('aria-label'),
            hasLabel: !!orphanLabel,
            hasName: !!inputEl.name || !!inputEl.id,
            isVisible: true,
            hasRole: false,
            hasSemanticTag: true,
          }),
          {
            title: `Fill: ${orphanLabel}`,
            annotations: this.makeAnnotations({ destructive: false, idempotent: true }),
          },
        ),
      );
    }

    return tools;
  }
}
