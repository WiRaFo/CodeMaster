import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Тесты БД работают с одной тестовой базой и меняют её внутри транзакций; параллельные файлы мешали бы друг другу.
    fileParallelism: false,
  },
});
