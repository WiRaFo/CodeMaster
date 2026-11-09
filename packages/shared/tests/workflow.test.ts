import { describe, expect, it } from 'vitest';
import { applyWorkflowAction, availableWorkflowActions } from '../src/workflow.ts';
import { PUBLICATION_STATUSES } from '../src/enums.ts';

describe('workflow (ТЗ §6.7)', () => {
  it('проводит материал через полный цикл согласования', () => {
    let status = 'draft' as const as (typeof PUBLICATION_STATUSES)[number];
    for (const action of ['submit', 'request_changes', 'submit', 'approve', 'publish', 'archive', 'restore'] as const) {
      const result = applyWorkflowAction(status, action);
      expect(result.ok, `${status} → ${action}`).toBe(true);
      if (result.ok) status = result.to;
    }
    expect(status).toBe('published');
  });

  it('не позволяет опубликовать без одобрения', () => {
    expect(applyWorkflowAction('draft', 'publish')).toEqual({ ok: false, reason: 'INVALID_STATUS_TRANSITION' });
    expect(applyWorkflowAction('in_review', 'publish')).toEqual({ ok: false, reason: 'INVALID_STATUS_TRANSITION' });
  });

  it('требует разных прав для проверки и публикации', () => {
    const approve = applyWorkflowAction('in_review', 'approve');
    const publish = applyWorkflowAction('approved', 'publish');
    expect(approve.ok && approve.permission).toBe('review');
    expect(publish.ok && publish.permission).toBe('publish');
  });

  it('для каждого статуса есть хотя бы одно действие', () => {
    for (const status of PUBLICATION_STATUSES) {
      expect(availableWorkflowActions(status).length, status).toBeGreaterThan(0);
    }
  });
});
