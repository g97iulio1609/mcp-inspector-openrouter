/**
 * Plan Renderer — renders AI execution plans as interactive DOM elements in the chat.
 */

import { ICONS } from './icons';

// Types are defined inline since they may not be available yet from the types module
interface PlanStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';
  detail?: string;
  children?: PlanStep[];
  toolName?: string;
}

interface Plan {
  goal: string;
  steps: PlanStep[];
  createdAt: number;
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';
}

const STATUS_ICONS: Record<string, string> = {
  pending: ICONS.square,
  in_progress: ICONS.refresh,
  done: ICONS.checkCircle,
  failed: ICONS.xCircle,
  skipped: ICONS.skipForward,
};

/** Create the full plan DOM element */
export function renderPlan(plan: Plan): HTMLElement {
  const container = document.createElement('div');
  container.className = 'plan-block';
  container.dataset.planGoal = plan.goal;

  // Header with goal and collapse toggle
  const header = document.createElement('div');
  header.className = 'plan-header';
  header.innerHTML = `
    <span class="plan-icon">${ICONS.clipboard}</span>
    <span class="plan-goal">${escapeHtml(plan.goal)}</span>
    <span class="plan-status-badge plan-status--${plan.status}">${STATUS_ICONS[plan.status] ?? ICONS.square}</span>
    <button class="plan-toggle-btn" title="Espandi/Comprimi">${ICONS.chevronDown}</button>
  `;

  // Toggle collapse
  const toggleBtn = header.querySelector('.plan-toggle-btn')!;
  toggleBtn.addEventListener('click', () => {
    container.classList.toggle('plan-block--collapsed');
    toggleBtn.innerHTML = container.classList.contains('plan-block--collapsed') ? ICONS.chevronRight : ICONS.chevronDown;
  });

  container.appendChild(header);

  // Steps list
  const stepsList = document.createElement('div');
  stepsList.className = 'plan-steps';

  for (const step of plan.steps) {
    stepsList.appendChild(renderStep(step, 0));
  }

  container.appendChild(stepsList);
  return container;
}

/** Render a single step (recursive for children) */
function renderStep(step: PlanStep, depth: number): HTMLElement {
  const el = document.createElement('div');
  el.className = `plan-step plan-step--${step.status} plan-step--depth-${Math.min(depth, 3)}`;
  el.dataset.stepId = step.id;

  const row = document.createElement('div');
  row.className = 'plan-step-row';

  const icon = document.createElement('span');
  icon.className = 'plan-step-icon';
  icon.innerHTML = STATUS_ICONS[step.status] ?? ICONS.square;

  const title = document.createElement('span');
  title.className = 'plan-step-title';
  title.textContent = `${step.id}. ${step.title}`;

  row.appendChild(icon);
  row.appendChild(title);

  if (step.detail) {
    const detail = document.createElement('span');
    detail.className = 'plan-step-detail';
    detail.textContent = step.detail;
    row.appendChild(detail);
  }

  el.appendChild(row);

  // Render children
  if (step.children?.length) {
    const childContainer = document.createElement('div');
    childContainer.className = 'plan-step-children';
    for (const child of step.children) {
      childContainer.appendChild(renderStep(child, depth + 1));
    }
    el.appendChild(childContainer);
  }

  return el;
}

/** Update a specific step's status in an existing plan DOM element */
export function updatePlanStep(
  planEl: HTMLElement,
  stepId: string,
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped',
  detail?: string,
): void {
  const stepEl = planEl.querySelector(`[data-step-id="${stepId}"]`);
  if (!stepEl) return;

  // Update class
  stepEl.className = stepEl.className.replace(/plan-step--\w+/g, '');
  stepEl.classList.add(`plan-step--${status}`);
  // Re-add depth class
  const depthMatch = stepEl.className.match(/plan-step--depth-\d/);
  if (!depthMatch) stepEl.classList.add('plan-step--depth-0');

  // Update icon
  const icon = stepEl.querySelector('.plan-step-icon');
  if (icon) icon.innerHTML = STATUS_ICONS[status] ?? ICONS.square;

  // Update detail
  if (detail) {
    let detailEl = stepEl.querySelector('.plan-step-detail') as HTMLElement | null;
    if (!detailEl) {
      detailEl = document.createElement('span');
      detailEl.className = 'plan-step-detail';
      stepEl.querySelector('.plan-step-row')?.appendChild(detailEl);
    }
    detailEl.textContent = detail;
  }

  // Update overall plan status badge
  const planBlock = planEl.closest('.plan-block') ?? planEl;
  const badge = planBlock.querySelector('.plan-status-badge');
  if (badge) {
    const allSteps = planBlock.querySelectorAll('.plan-step');
    const statuses = Array.from(allSteps).map(s => {
      const classes = s.className;
      if (classes.includes('plan-step--done')) return 'done';
      if (classes.includes('plan-step--in_progress')) return 'in_progress';
      if (classes.includes('plan-step--failed')) return 'failed';
      return 'pending';
    });
    
    let overallStatus = 'pending';
    if (statuses.every(s => s === 'done')) overallStatus = 'done';
    else if (statuses.some(s => s === 'in_progress')) overallStatus = 'in_progress';
    else if (statuses.some(s => s === 'failed')) overallStatus = 'failed';
    else if (statuses.some(s => s === 'done')) overallStatus = 'in_progress';

    badge.className = `plan-status-badge plan-status--${overallStatus}`;
    badge.innerHTML = STATUS_ICONS[overallStatus] ?? ICONS.square;
  }
}

/** Parse a plan from AI text response (looks for ```plan JSON block) */
export function parsePlanFromText(text: string): { plan: Plan; cleanText: string } | null {
  // Look for ```plan ... ``` or ```json ... ``` blocks containing plan data
  const planBlockRegex = /```(?:plan|json)\s*\n([\s\S]*?)\n```/;
  const match = text.match(planBlockRegex);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as { type?: string; goal?: string; plan?: { goal: string; steps: unknown[] }; steps?: unknown[] };
    
    let rawPlan: { goal: string; steps: unknown[] };
    
    // Support both { type: 'plan', plan: {...} } and direct { goal, steps }
    if (parsed.type === 'plan' && parsed.plan) {
      rawPlan = parsed.plan;
    } else if (parsed.goal && parsed.steps) {
      rawPlan = parsed as { goal: string; steps: unknown[] };
    } else {
      return null;
    }

    const plan: Plan = {
      goal: rawPlan.goal,
      steps: normalizeSteps(rawPlan.steps),
      createdAt: Date.now(),
      status: 'pending',
    };

    const cleanText = text.replace(planBlockRegex, '').trim();
    return { plan, cleanText };
  } catch {
    return null;
  }
}

/** Normalize raw step data into PlanStep[] */
function normalizeSteps(raw: unknown[]): PlanStep[] {
  return raw.map((item, i) => {
    const s = item as Record<string, unknown>;
    const step: PlanStep = {
      id: (s.id as string) ?? String(i + 1),
      title: (s.title as string) ?? 'Untitled step',
      status: 'pending',
    };
    if (Array.isArray(s.children) && s.children.length > 0) {
      step.children = normalizeSteps(s.children);
    }
    return step;
  });
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
