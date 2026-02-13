/**
 * Interactive executor: button clicks, toggles, tab switches, combobox selection.
 *
 * Uses live state to provide informative response messages about
 * the resulting state of interactive elements.
 */

import type { Tool } from '../../types';
import { getLiveStateManager } from '../live-state';
import { BaseExecutor, type ExecutionResult } from './base-executor';

export class InteractiveExecutor extends BaseExecutor {
  readonly category = 'interactive' as const;

  async execute(
    tool: Tool,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const el = this.findElement(tool) as HTMLElement | null;
    if (!el) return this.fail('Interactive element not found');

    // Toggle
    if (tool.name.includes('.toggle-')) {
      const parsed = this.parseArgs(args ?? {});
      if (
        (el instanceof HTMLInputElement && el.type === 'checkbox') ||
        el.getAttribute('role') === 'switch'
      ) {
        const checkbox = el as HTMLInputElement;
        const desired =
          parsed.checked !== undefined
            ? !!parsed.checked
            : !checkbox.checked;
        if (checkbox.checked !== desired) el.click();
        return this.ok(
          `Toggled "${tool.name}" to ${desired ? 'ON' : 'OFF'}`,
        );
      }
    }

    // Select option (combobox / listbox)
    if (tool.name.includes('.select-') && args) {
      const parsed = this.parseArgs(args);
      const value = parsed.value as string | undefined;
      if (value) {
        el.click();
        setTimeout(() => {
          const opts = [
            ...document.querySelectorAll('[role="option"]'),
          ];
          const match = opts.find(
            (o) =>
              (o.textContent ?? '').trim().toLowerCase() ===
              value.toLowerCase(),
          );
          if (match instanceof HTMLElement) match.click();
        }, 100);
        return this.ok(`Selected "${value}" from ${tool.name}`);
      }
    }

    // Default: click with state-aware feedback
    el.click();
    return this.ok(this.buildClickMessage(tool.name));
  }

  /** Enrich click responses with current interactive state context */
  private buildClickMessage(toolName: string): string {
    const snapshot = getLiveStateManager().getLatestSnapshot();
    if (!snapshot) return `Clicked: ${toolName}`;

    const { openModals, expandedAccordions } = snapshot.interactive;
    const parts: string[] = [`Clicked: ${toolName}`];
    if (openModals.length) parts.push(`(${openModals.length} modal(s) open)`);
    if (expandedAccordions.length) parts.push(`(${expandedAccordions.length} accordion(s) expanded)`);
    return parts.join(' ');
  }
}
