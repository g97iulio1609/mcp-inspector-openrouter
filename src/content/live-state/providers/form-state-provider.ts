/**
 * FormStateProvider — collects live state for forms on the page.
 *
 * Enumerates all <form> elements, counts fields, detects dirty/invalid
 * state, and computes a completion percentage.
 */

import type { IStateProvider, FormLiveState } from '../../../types/live-state.types';

/** Input-like elements whose value can be inspected */
const FIELD_SELECTOR = 'input, select, textarea';

/** Truncate a string to a maximum length */
function truncate(value: string, max = 100): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Check whether a form field has a non-empty value */
function isFilled(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    return el.value.trim().length > 0;
  }
  return el.value.trim().length > 0;
}

/** Derive a human-readable label for a field */
function fieldLabel(el: Element): string {
  const name =
    (el as HTMLInputElement).name ||
    el.id ||
    el.getAttribute('aria-label') ||
    '';
  return truncate(name);
}

export class FormStateProvider implements IStateProvider<FormLiveState> {
  readonly category = 'form' as const;

  collect(root: Document | Element): FormLiveState[] {
    const forms = root.querySelectorAll('form');
    const results: FormLiveState[] = [];

    forms.forEach((form, index) => {
      const fields = form.querySelectorAll(FIELD_SELECTOR);
      const totalFields = fields.length;
      let filledFields = 0;
      const dirtyFields: string[] = [];
      let hasValidationErrors = false;

      fields.forEach((field) => {
        const el = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

        if (isFilled(el)) filledFields++;

        if (
          el instanceof HTMLInputElement &&
          (el.type === 'checkbox' || el.type === 'radio')
        ) {
          if (el.checked !== el.defaultChecked) dirtyFields.push(fieldLabel(el));
        } else if (el instanceof HTMLSelectElement) {
          const isDirty = Array.from(el.options).some(
            (opt) => opt.selected !== opt.defaultSelected,
          );
          if (isDirty) dirtyFields.push(fieldLabel(el));
        } else if ('defaultValue' in el && el.value !== (el as HTMLInputElement).defaultValue) {
          dirtyFields.push(fieldLabel(el));
        }

        if (el.matches(':invalid')) {
          hasValidationErrors = true;
        }
      });

      const completionPercent =
        totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

      results.push({
        formId: form.id || form.getAttribute('toolname') || String(index),
        toolName: form.getAttribute('toolname') || '',
        totalFields,
        filledFields,
        dirtyFields,
        hasValidationErrors,
        completionPercent,
      });
    });

    return results;
  }

  dispose(): void {
    /* no-op */
  }
}
