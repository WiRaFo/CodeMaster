import { applyWorkflowAction, availableWorkflowActions, type PublicationStatus, type WorkflowAction } from '@archive-vko/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useAnnounce } from '../app/Announcer.tsx';
import { AdminHeading, ErrorMessage, useAuth } from './AdminApp.tsx';
import { adminRequest, errorText } from './api.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { ACCESS_LABEL, ACTION_LABEL, STATUS_LABEL, actionPath } from './labels.ts';
import { useAdminData } from './useAdminData.ts';

interface Node {
  id: string;
  number: string;
  title: string | null;
  status: PublicationStatus;
  access: string;
}
interface Tree {
  fonds: Array<Node & { inventories: Array<Node & { cases: Node[] }> }>;
}
interface Reference {
  branches: Array<{ slug: string; name: string }>;
}
type Entity = 'fonds' | 'inventories' | 'cases';
type Pending = { entity: Entity; id: string; action: WorkflowAction; label: string };

/**
 * Фонды, описи и дела (F-144, простые формы ЭТАПА 10a): дерево со статусами, создание черновиков
 * и согласование тем же циклом, что и документы. Документ виден на сайте, только если вся цепочка опубликована.
 */
export function HierarchyPage() {
  const { can } = useAuth();
  const announce = useAnnounce();
  const tree = useAdminData<Tree>('/admin/catalog/tree');
  const ref = useAdminData<Reference>('/admin/reference');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [openConfirm, setOpenConfirm] = useState<null | { entity: Entity; body: Record<string, unknown> }>(null);

  const act = async (p: Pending, comment: string) => {
    setError(null);
    try {
      await adminRequest('POST', `/admin/${p.entity}/${p.id}/${actionPath(p.action)}`, { ...(comment ? { comment } : {}), ...(p.action === 'archive' ? { confirm: true } : {}) });
      announce(`${p.label}: ${ACTION_LABEL[p.action]} — выполнено`);
      tree.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const create = async (entity: Entity, body: Record<string, unknown>) => {
    setError(null);
    if (body['accessLevel'] === 'open' && !body['confirmOpenAccess']) {
      setOpenConfirm({ entity, body });
      return false;
    }
    try {
      await adminRequest('POST', `/admin/${entity}`, body);
      announce('Черновик создан');
      tree.reload();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };

  const actions = (entity: Entity, node: Node, label: string) =>
    availableWorkflowActions(node.status)
      .filter((a) => {
        const r = applyWorkflowAction(node.status, a);
        return r.ok && can(`catalog:${r.permission}`);
      })
      .map((a) => (
        <button
          key={a}
          type="button"
          className="btn-secondary"
          aria-label={`${ACTION_LABEL[a]}: ${label}`}
          onClick={() => (a === 'request_changes' || a === 'archive' ? setPending({ entity, id: node.id, action: a, label }) : void act({ entity, id: node.id, action: a, label }, ''))}
        >
          {ACTION_LABEL[a]}
        </button>
      ));

  const nodeLine = (entity: Entity, prefix: string, node: Node) => {
    const label = `${prefix} ${node.number}${node.title ? ` «${node.title}»` : ''}`;
    return (
      <div className="flex flex-wrap items-center gap-2 py-1">
        <span className="font-semibold">{label}</span>
        <span className="status-badge" data-status={node.status}>{STATUS_LABEL[node.status]}</span>
        <span className="text-sm text-muted">доступ: {ACCESS_LABEL[node.access]}</span>
        {actions(entity, node, label)}
      </div>
    );
  };

  return (
    <>
      <AdminHeading title="Фонды, описи, дела" />
      <p className="mb-4 max-w-3xl">Документ появляется на сайте, только когда опубликованы он сам, его дело, опись, фонд и филиал. Эффективный доступ — самый строгий в этой цепочке.</p>
      <ErrorMessage error={error ?? tree.error} />
      {can('catalog:edit') ? (
        <CreateForm
          legend="Новый фонд"
          extra={
            <div className="admin-field">
              <label htmlFor="new-fond-branch">Филиал</label>
              <select id="new-fond-branch" name="branchSlug" className="input" defaultValue="main">
                {ref.data?.branches.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
              </select>
            </div>
          }
          idPrefix="new-fond"
          onCreate={(body) => create('fonds', body)}
        />
      ) : null}
      <ul className="mt-6 grid gap-4">
        {tree.data?.fonds.map((f) => (
          <li key={f.id} className="rounded border border-border p-3">
            {nodeLine('fonds', 'Фонд', f)}
            <ul className="ml-4 border-l border-border pl-4">
              {f.inventories.map((i) => (
                <li key={i.id}>
                  {nodeLine('inventories', 'Опись', i)}
                  <ul className="ml-4 border-l border-border pl-4">
                    {i.cases.map((c) => <li key={c.id}>{nodeLine('cases', 'Дело', c)}</li>)}
                  </ul>
                  {can('catalog:edit') ? (
                    <details className="ml-4">
                      <summary className="cursor-pointer">Добавить дело в опись {i.number}</summary>
                      <CreateForm legend={`Новое дело в описи ${i.number}`} idPrefix={`new-case-${i.id}`} parent={{ inventoryId: i.id }} onCreate={(body) => create('cases', body)} />
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
            {can('catalog:edit') ? (
              <details className="ml-4">
                <summary className="cursor-pointer">Добавить опись в фонд {f.number}</summary>
                <CreateForm legend={`Новая опись в фонде ${f.number}`} idPrefix={`new-inv-${f.id}`} parent={{ fondId: f.id }} onCreate={(body) => create('inventories', body)} />
              </details>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pending?.action === 'request_changes'}
        title="Вернуть на доработку"
        description={<p>{pending?.label}</p>}
        withComment="Что нужно исправить"
        confirmLabel="Вернуть на доработку"
        onCancel={() => setPending(null)}
        onConfirm={(comment) => {
          if (pending) void act(pending, comment);
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={pending?.action === 'archive'}
        title="Снять с публикации?"
        description={<p>{pending?.label} и все вложенные документы исчезнут с сайта.</p>}
        confirmLabel="Снять с публикации"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) void act(pending, '');
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={openConfirm !== null}
        title="Создать с открытым доступом?"
        description={<p>Открытые материалы после публикации увидят все посетители сайта.</p>}
        confirmLabel="Да, открытый доступ"
        onCancel={() => setOpenConfirm(null)}
        onConfirm={() => {
          if (openConfirm) void create(openConfirm.entity, { ...openConfirm.body, confirmOpenAccess: true });
          setOpenConfirm(null);
        }}
      />
    </>
  );
}

function CreateForm({
  legend,
  idPrefix,
  parent = {},
  extra,
  onCreate,
}: {
  legend: string;
  idPrefix: string;
  parent?: Record<string, string>;
  extra?: ReactNode;
  onCreate: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const num = (k: string) => (String(f.get(k) ?? '').trim() ? Number(f.get(k)) : null);
    const ok = await onCreate({
      ...parent,
      ...(f.get('branchSlug') ? { branchSlug: String(f.get('branchSlug')) } : {}),
      number: String(f.get('number') ?? ''),
      title: String(f.get('title') ?? ''),
      yearFrom: num('yearFrom'),
      yearTo: num('yearTo'),
      accessLevel: String(f.get('accessLevel') ?? 'closed'),
      dataOrigin: String(f.get('dataOrigin') ?? 'demo'),
    });
    if (ok) formEl.reset();
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="my-3 rounded border border-border p-3">
      <fieldset>
        <legend className="mb-2 text-lg font-semibold">{legend}</legend>
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          {extra}
          <div className="admin-field">
            <label htmlFor={`${idPrefix}-number`}>Номер *</label>
            <input id={`${idPrefix}-number`} name="number" required className="input" />
          </div>
          <div className="admin-field">
            <label htmlFor={`${idPrefix}-title`}>Название *</label>
            <input id={`${idPrefix}-title`} name="title" required className="input" />
          </div>
          <div className="admin-field">
            <label htmlFor={`${idPrefix}-yearFrom`}>Год с</label>
            <input id={`${idPrefix}-yearFrom`} name="yearFrom" inputMode="numeric" className="input" />
          </div>
          <div className="admin-field">
            <label htmlFor={`${idPrefix}-yearTo`}>Год по</label>
            <input id={`${idPrefix}-yearTo`} name="yearTo" inputMode="numeric" className="input" />
          </div>
          <div className="admin-field">
            <label htmlFor={`${idPrefix}-access`}>Доступ</label>
            <select id={`${idPrefix}-access`} name="accessLevel" className="input" defaultValue="closed">
              <option value="closed">Закрытый</option>
              <option value="restricted">Ограниченный</option>
              <option value="open">Открытый</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor={`${idPrefix}-origin`}>Происхождение</label>
            <select id={`${idPrefix}-origin`} name="dataOrigin" className="input" defaultValue="demo">
              <option value="demo">Демонстрационная запись</option>
              <option value="verified">Проверенные сведения</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn-primary">Создать черновик</button>
      </fieldset>
    </form>
  );
}
