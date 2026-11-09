import type { PublicationStatus } from './enums.ts';

/**
 * Переходы согласования публикаций (ТЗ §6.7, с. 15; docs/architecture.md §6).
 * Каждое действие требует собственного права; проверку прав выполняет backend.
 */
export const WORKFLOW_ACTIONS = [
  'submit',
  'request_changes',
  'approve',
  'publish',
  'archive',
  'restore',
] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

interface Transition {
  from: readonly PublicationStatus[];
  to: PublicationStatus;
  /** Суффикс права: `${resource}:${permission}`. */
  permission: 'submit' | 'review' | 'publish';
}

export const WORKFLOW_TRANSITIONS: Readonly<Record<WorkflowAction, Transition>> = {
  submit: { from: ['draft', 'needs_changes'], to: 'in_review', permission: 'submit' },
  request_changes: { from: ['in_review'], to: 'needs_changes', permission: 'review' },
  approve: { from: ['in_review'], to: 'approved', permission: 'review' },
  publish: { from: ['approved'], to: 'published', permission: 'publish' },
  archive: { from: ['published'], to: 'archived', permission: 'publish' },
  restore: { from: ['archived'], to: 'published', permission: 'publish' },
};

export type TransitionResult =
  | { ok: true; to: PublicationStatus; permission: Transition['permission'] }
  | { ok: false; reason: 'INVALID_STATUS_TRANSITION' };

export function applyWorkflowAction(current: PublicationStatus, action: WorkflowAction): TransitionResult {
  const transition = WORKFLOW_TRANSITIONS[action];
  if (!transition.from.includes(current)) {
    return { ok: false, reason: 'INVALID_STATUS_TRANSITION' };
  }
  return { ok: true, to: transition.to, permission: transition.permission };
}

/** Действия, доступные из текущего статуса (для кнопок админки; права проверяются отдельно). */
export function availableWorkflowActions(current: PublicationStatus): WorkflowAction[] {
  return WORKFLOW_ACTIONS.filter((action) => WORKFLOW_TRANSITIONS[action].from.includes(current));
}
