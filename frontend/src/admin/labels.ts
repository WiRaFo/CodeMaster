/** Подписи панели управления. Панель пока только на русском языке (docs/handoff.md, ЭТАП 10a). */
export const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  in_review: 'На проверке',
  needs_changes: 'Требует доработки',
  approved: 'Одобрено',
  published: 'Опубликовано',
  archived: 'Архивировано',
};

export const ACCESS_LABEL: Record<string, string> = {
  open: 'Открытый',
  restricted: 'Ограниченный',
  closed: 'Закрытый',
};

export const ACTION_LABEL: Record<string, string> = {
  submit: 'Отправить на проверку',
  request_changes: 'Вернуть на доработку',
  approve: 'Одобрить',
  publish: 'Опубликовать',
  archive: 'Снять с публикации',
  restore: 'Опубликовать снова',
};

export const AUDIT_LABEL: Record<string, string> = {
  login: 'Вход',
  login_failed: 'Неудачный вход',
  account_locked: 'Блокировка учётной записи',
  logout: 'Выход',
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
  status_change: 'Смена статуса',
  access_change: 'Смена доступа',
  upload: 'Загрузка файла',
};

export const actionPath = (action: string) => action.replace(/_/g, '-');
