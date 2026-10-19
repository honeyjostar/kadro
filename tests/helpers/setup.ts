// Между тестами даём событийному циклу «вздохнуть»: интеграционные тесты подолгу ждут ffmpeg синхронно,
// и без этого ответы vitest-у копятся, а он считает воркер зависшим (Timeout calling "onTaskUpdate").
import { beforeEach } from 'vitest';

beforeEach(async () => {
  await new Promise((r) => setImmediate(r));
});
