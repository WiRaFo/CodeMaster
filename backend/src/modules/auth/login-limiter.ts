/**
 * Ограничение попыток входа в памяти процесса (S-008): не больше 5 попыток в минуту на пару «IP + email»
 * и 20 на IP. Для нескольких экземпляров backend счётчик нужно вынести в общее хранилище (docs/architecture.md).
 */
export class LoginLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly perAccount = 5,
    private readonly perIp = 20,
    private readonly windowMs = 60_000,
  ) {}

  /** true — попытку можно выполнять; попытка сразу учитывается. */
  take(ip: string, email: string, now = Date.now()): boolean {
    const keys: Array<[string, number]> = [
      [`a:${ip}|${email}`, this.perAccount],
      [`i:${ip}`, this.perIp],
    ];
    const allowed = keys.every(([key, limit]) => this.recent(key, now).length < limit);
    if (allowed) for (const [key] of keys) this.recent(key, now).push(now);
    return allowed;
  }

  /** После успешного входа счётчик пары сбрасывается. */
  reset(ip: string, email: string): void {
    this.hits.delete(`a:${ip}|${email}`);
  }

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.prune(now);
    return list;
  }

  private prune(now: number): void {
    for (const [key, list] of this.hits) if (list.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
  }
}
