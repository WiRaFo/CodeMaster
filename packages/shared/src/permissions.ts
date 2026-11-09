/**
 * Права и системные роли (ТЗ §6.1–6.6, с. 13–15; docs/architecture.md §6).
 * Формат права: `${resource}:${action}`. Действия согласования совпадают с WORKFLOW_TRANSITIONS[*].permission.
 * Набор прав у ролей — стартовый: ТЗ требует, чтобы уровни доступа были настраиваемыми, поэтому
 * сиды создают эти связи один раз, а дальше их меняет главный администратор.
 */
export const CONTENT_RESOURCES = ['news', 'publications', 'exhibitions', 'pages', 'catalog', 'branches'] as const;
export type ContentResource = (typeof CONTENT_RESOURCES)[number];

const CONTENT_ACTIONS = ['edit', 'submit', 'review', 'publish'] as const;

export const SYSTEM_PERMISSIONS = [
  'users:manage',
  'roles:manage',
  'settings:manage',
  'locales:manage',
  'menu:manage',
  'audit:read',
  'stats:read',
  'feedback:read',
  'catalog:import',
  'catalog:export',
  'catalog:delete',
  'assets:upload',
  'translations:manage',
  'migration:manage',
  'integrations:manage',
] as const;

export const ALL_PERMISSIONS: readonly string[] = [
  ...CONTENT_RESOURCES.flatMap((r) => CONTENT_ACTIONS.map((a) => `${r}:${a}`)),
  ...SYSTEM_PERMISSIONS,
];

export const SYSTEM_ROLES = [
  'super_admin',
  'site_admin',
  'editor',
  'archivist',
  'branch_admin',
  'moderator',
  'analyst',
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

const allOf = (resources: readonly ContentResource[], actions: readonly string[]): string[] =>
  resources.flatMap((r) => actions.map((a) => `${r}:${a}`));

export const ROLE_PERMISSIONS: Readonly<Record<SystemRole, readonly string[]>> = {
  super_admin: ALL_PERMISSIONS,
  site_admin: [
    ...allOf(['news', 'publications', 'exhibitions', 'pages'], CONTENT_ACTIONS),
    'users:manage',
    'menu:manage',
    'settings:manage',
    'locales:manage',
    'translations:manage',
    'feedback:read',
    'assets:upload',
    'stats:read',
  ],
  editor: [...allOf(['news', 'publications', 'exhibitions', 'pages'], ['edit', 'submit', 'publish']), 'assets:upload'],
  archivist: [
    'catalog:edit',
    'catalog:submit',
    'catalog:import',
    'catalog:export',
    'catalog:delete',
    'assets:upload',
  ],
  // Права администратора филиала действуют только в пределах user_roles.branch_id.
  branch_admin: [...allOf(['news', 'branches', 'catalog'], ['edit', 'submit']), 'assets:upload'],
  moderator: [...allOf(CONTENT_RESOURCES, ['review']), 'feedback:read'],
  analyst: ['stats:read'],
};
