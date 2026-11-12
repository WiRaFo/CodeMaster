import type { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError, assertIfMatch, notFound } from '../../http/errors.ts';
import { requirePermission, type Staff } from '../../http/staff.ts';
import { writeAudit } from '../audit/audit.ts';

/**
 * Сотрудники и роли (ТЗ §6.1–6.6; F-142, F-143). Право users:manage.
 * Защита от повышения прав: назначить роль можно, только если у назначающего есть глобально все её права;
 * менять сотрудника с более широкими правами нельзя. Свои роли и блокировку себя менять нельзя (не запереть систему).
 * Роль администратора филиала всегда привязана к филиалу, остальные — глобальные.
 * Блокировка и смена пароля закрывают все сессии сотрудника. Пароли и их хеши в ответы и журнал не попадают.
 */

const roleRefSchema = z.object({ code: z.string().trim().min(1).max(40), branchSlug: z.string().trim().min(1).max(60).nullish().transform((v) => v ?? null) });
const passwordSchema = z.string().min(12).max(200);

const createSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  fullName: z.string().trim().min(3).max(200),
  password: passwordSchema,
  roles: z.array(roleRefSchema).min(1).max(10),
});
const updateSchema = z.object({
  fullName: z.string().trim().min(3).max(200),
  isActive: z.boolean(),
  roles: z.array(roleRefSchema).min(1).max(10),
  password: passwordSchema.optional(),
});

interface RoleInfo { id: string; code: string; name: string; permissions: string[] }

export async function userAdminRoutes(app: FastifyInstance, { db }: { db: PrismaClient }): Promise<void> {
  const loadRoles = async (): Promise<RoleInfo[]> =>
    (await db.role.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, nameRu: true, permissions: { select: { permission: { select: { code: true } } } } } }))
      .map((r) => ({ id: r.id, code: r.code, name: r.nameRu, permissions: r.permissions.map((p) => p.permission.code) }));

  const canGrant = (staff: Staff, role: RoleInfo) => role.permissions.every((p) => staff.grants.global.has(p));

  /** Роли из запроса → строки user_roles; ошибки — 400 или 403 с понятным кодом. */
  async function resolveRoles(staff: Staff, refs: Array<{ code: string; branchSlug: string | null }>, roles: RoleInfo[]) {
    const out: Array<{ roleId: string; branchId: string | null; code: string; branchSlug: string | null }> = [];
    for (const [i, ref] of refs.entries()) {
      const role = roles.find((r) => r.code === ref.code);
      if (!role) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown role', [{ path: ['roles', i, 'code'], code: 'unknown' }]);
      if (!canGrant(staff, role)) throw new ApiError(403, 'FORBIDDEN', `You cannot grant role ${role.code}`);
      const needsBranch = role.code === 'branch_admin';
      if (needsBranch !== (ref.branchSlug !== null)) {
        throw new ApiError(400, 'VALIDATION_FAILED', needsBranch ? 'Branch is required for branch_admin' : 'Only branch_admin is limited to a branch', [{ path: ['roles', i, 'branchSlug'], code: needsBranch ? 'required' : 'not_allowed' }]);
      }
      let branchId: string | null = null;
      if (ref.branchSlug) {
        const b = await db.branch.findFirst({ where: { slug: ref.branchSlug, deletedAt: null }, select: { id: true } });
        if (!b) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown branch', [{ path: ['roles', i, 'branchSlug'], code: 'unknown' }]);
        branchId = b.id;
      }
      if (!out.some((o) => o.roleId === role.id && o.branchId === branchId)) out.push({ roleId: role.id, branchId, code: role.code, branchSlug: ref.branchSlug });
    }
    return out;
  }

  const userSelect = {
    id: true, email: true, fullName: true, isActive: true, lastLoginAt: true, lockedUntil: true, updatedAt: true,
    roles: { select: { role: { select: { code: true, nameRu: true } }, branch: { select: { slug: true, translations: { where: { locale: 'ru' as const }, select: { shortName: true, fullName: true } } } } } },
  } as const;
  type UserRow = Awaited<ReturnType<typeof db.user.findFirstOrThrow<{ select: typeof userSelect }>>>;
  const out = (u: UserRow) => ({
    id: u.id, email: u.email, fullName: u.fullName, isActive: u.isActive, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    locked: u.lockedUntil !== null && u.lockedUntil > new Date(), updatedAt: u.updatedAt.toISOString(),
    roles: u.roles.map((r) => ({ code: r.role.code, name: r.role.nameRu, branchSlug: r.branch?.slug ?? null, branchName: r.branch ? (r.branch.translations[0]?.shortName ?? r.branch.translations[0]?.fullName ?? r.branch.slug) : null })),
  });

  /** Сотрудник, чьи роли назначающий не мог бы выдать, для него недоступен. */
  async function requireManageable(staff: Staff, id: string, roles: RoleInfo[]) {
    const user = await db.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
    if (!user) throw notFound();
    const held = user.roles.map((r) => roles.find((x) => x.code === r.role.code)).filter((r): r is RoleInfo => r !== undefined);
    if (held.some((r) => !canGrant(staff, r))) throw new ApiError(403, 'FORBIDDEN', 'This staff member has wider permissions than you');
    return user;
  }

  app.get('/admin/users', async (request) => {
    const staff = requirePermission(request, 'users:manage');
    const [users, roles, branches] = await Promise.all([
      db.user.findMany({ where: { deletedAt: null }, orderBy: { fullName: 'asc' }, select: userSelect }),
      loadRoles(),
      db.branch.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, select: { slug: true, translations: { where: { locale: 'ru' }, select: { shortName: true, fullName: true } } } }),
    ]);
    return {
      items: users.map(out),
      roles: roles.map((r) => ({ code: r.code, name: r.name, grantable: canGrant(staff, r), branchScoped: r.code === 'branch_admin' })),
      branches: branches.map((b) => ({ slug: b.slug, name: b.translations[0]?.shortName ?? b.translations[0]?.fullName ?? b.slug })),
      me: staff.session.userId,
    };
  });

  app.post('/admin/users', async (request: FastifyRequest, reply) => {
    const staff = requirePermission(request, 'users:manage');
    const input = createSchema.parse(request.body);
    const roles = await loadRoles();
    const assigned = await resolveRoles(staff, input.roles, roles);
    if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw new ApiError(409, 'CONFLICT', 'Email is already used');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email: input.email, fullName: input.fullName, passwordHash } });
      await tx.userRole.createMany({ data: assigned.map((a) => ({ userId: u.id, roleId: a.roleId, branchId: a.branchId })) });
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'create', entityType: 'user', entityId: u.id,
        summary: `Создан сотрудник ${input.email}: ${assigned.map((a) => (a.branchSlug ? `${a.code} (${a.branchSlug})` : a.code)).join(', ')}`,
        changes: { roles: assigned.map((a) => ({ code: a.code, branch: a.branchSlug })) },
      });
      return tx.user.findUniqueOrThrow({ where: { id: u.id }, select: userSelect });
    });
    return reply.status(201).send(out(user));
  });

  app.patch('/admin/users/:id', async (request) => {
    const staff = requirePermission(request, 'users:manage');
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const input = updateSchema.parse(request.body);
    const roles = await loadRoles();
    const before = await requireManageable(staff, id, roles);
    assertIfMatch(request, before.updatedAt);
    const assigned = await resolveRoles(staff, input.roles, roles);
    const key = (code: string, slug: string | null) => `${code}@${slug ?? ''}`;
    const beforeRoles = before.roles.map((r) => key(r.role.code, r.branch?.slug ?? null)).sort();
    const afterRoles = assigned.map((a) => key(a.code, a.branchSlug)).sort();
    const rolesChanged = beforeRoles.join() !== afterRoles.join();
    if (id === staff.session.userId && (rolesChanged || !input.isActive)) {
      throw new ApiError(400, 'SELF_CHANGE', 'You cannot change your own roles or block yourself');
    }
    const passwordHash = input.password ? await argon2.hash(input.password, { type: argon2.argon2id }) : null;
    const user = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { fullName: input.fullName, isActive: input.isActive, ...(passwordHash ? { passwordHash, failedLoginCount: 0, lockedUntil: null } : {}) },
      });
      if (rolesChanged) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: assigned.map((a) => ({ userId: id, roleId: a.roleId, branchId: a.branchId })) });
      }
      // Блокировка, новые роли и новый пароль действуют сразу: открытые сессии закрываются.
      if (!input.isActive || passwordHash || rolesChanged) await tx.session.deleteMany({ where: { userId: id } });
      const changes: Record<string, unknown> = {};
      if (before.fullName !== input.fullName) changes['fullName'] = { from: before.fullName, to: input.fullName };
      if (before.isActive !== input.isActive) changes['isActive'] = { from: before.isActive, to: input.isActive };
      if (rolesChanged) changes['roles'] = { from: beforeRoles, to: afterRoles };
      if (passwordHash) changes['password'] = 'изменён';
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: rolesChanged || before.isActive !== input.isActive ? 'access_change' : 'update', entityType: 'user', entityId: id,
        summary: `Сотрудник ${before.email}: ${Object.keys(changes).length ? Object.keys(changes).join(', ') : 'без изменений'}`,
        changes: JSON.parse(JSON.stringify(changes)) as Record<string, string>,
      });
      return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    });
    return out(user);
  });
}
