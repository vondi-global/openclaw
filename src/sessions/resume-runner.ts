/**
 * resume-runner.ts — запуск claude --resume для исторических (завершённых) сессий
 */

import { spawnSync } from "node:child_process";

export interface ResumeRunResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Выполняет claude --resume <sessionId> -p "<message>" из нужной директории.
 * Нужно запускать из cwd проекта — иначе session ID не найдётся.
 */
export function runWithResume(sessionId: string, cwd: string, message: string): ResumeRunResult {
  // Сбрасываем CLAUDECODE чтобы разрешить вложенный вызов
  const env = { ...process.env, CLAUDECODE: "" };

  const result = spawnSync(
    "claude",
    [
      "--resume",
      sessionId,
      "-p",
      message,
      "--output-format",
      "text",
      "--dangerously-skip-permissions",
    ],
    {
      cwd,
      env,
      encoding: "utf8",
      timeout: 120_000,
    },
  );

  if (result.error) {
    return { success: false, output: "", error: String(result.error) };
  }

  if (result.status !== 0) {
    const errMsg = (result.stderr ?? "").trim();
    return {
      success: false,
      output: "",
      error: errMsg || `claude завершился с кодом ${result.status}`,
    };
  }

  const output = (result.stdout ?? "").trim();
  return { success: true, output };
}
