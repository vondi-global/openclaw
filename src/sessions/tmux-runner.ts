/**
 * tmux-runner.ts — отправка команд в активную tmux сессию + получение ответа
 *
 * Используется когда claude запущен в tmux и сессия активна.
 * Отправляет сообщение через send-keys, ждёт ответа через capture-pane.
 */

import { spawnSync } from "node:child_process";

/** Интервал поллинга (мс) */
const POLL_INTERVAL_MS = 2000;
/** Максимальное время ожидания (мс) */
const MAX_WAIT_MS = 120_000;
/** Время стабильности пана до признания "ответ готов" (мс) */
const STABLE_DURATION_MS = 5000;
/** Начальная задержка после отправки команды (мс) */
const INITIAL_WAIT_MS = 3000;

export interface TmuxRunResult {
  success: boolean;
  output: string;
  error?: string;
}

function tmuxHasSession(sessionName: string): boolean {
  const result = spawnSync("tmux", ["has-session", "-t", sessionName], {
    timeout: 5000,
  });
  return result.status === 0;
}

function tmuxCapturePaneFull(sessionName: string): string {
  // Захватываем последние 500 строк scrollback + текущий экран
  const result = spawnSync("tmux", ["capture-pane", "-t", sessionName, "-p", "-S", "-500"], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout ?? "";
}

/**
 * Проверяет, закончил ли claude отвечать.
 * Признак: на экране виден prompt ❯ и нет признаков работы.
 */
function isResponseComplete(pane: string): boolean {
  const lines = pane.trimEnd().split("\n");
  // Смотрим последние 8 строк
  const tail = lines.slice(-8).join("\n");

  const hasPrompt = tail.includes("❯") || tail.includes("> ") || /^\s*[$#]\s*$/.test(tail);

  const isBusy =
    tail.includes("Fluttering") ||
    tail.includes("Thinking") ||
    tail.includes("Analyzing") ||
    tail.includes("⏵⏵") ||
    tail.includes("● ") ||
    tail.includes("✻ ") ||
    tail.includes("↓ ") ||
    /\(\d+s ·/.test(tail); // spinner "(60s · ↓ 1.2k tokens)"

  return hasPrompt && !isBusy;
}

/**
 * Извлекает ответ ассистента из diff между состоянием до и после.
 */
function extractNewContent(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  // Ищем точку расхождения
  let divergeIdx = beforeLines.length;
  for (let i = 0; i < Math.min(beforeLines.length, afterLines.length); i++) {
    if (beforeLines[i] !== afterLines[i]) {
      divergeIdx = i;
      break;
    }
  }

  const newLines = afterLines.slice(divergeIdx);

  // Фильтруем служебные строки
  const filtered = newLines
    .filter(
      (l) =>
        (!l.trim().startsWith("❯") &&
          !l.includes("⏵⏵ bypass permissions") &&
          !l.includes("──────────────") &&
          !l.match(/^\s*$/)) ||
        // Оставляем пустые строки внутри блока текста
        (newLines.indexOf(l) > 0 && newLines.indexOf(l) < newLines.length - 3),
    )
    .join("\n")
    .trim();

  return filtered || "(нет ответа)";
}

/**
 * Отправляет сообщение в tmux сессию и возвращает ответ claude.
 */
export async function sendToTmux(sessionName: string, message: string): Promise<TmuxRunResult> {
  if (!tmuxHasSession(sessionName)) {
    return {
      success: false,
      output: "",
      error: `tmux сессия '${sessionName}' не найдена`,
    };
  }

  // Снимок экрана ДО отправки
  const before = tmuxCapturePaneFull(sessionName);

  // Отправляем сообщение
  spawnSync("tmux", ["send-keys", "-t", sessionName, "-l", "--", message], {
    timeout: 5000,
  });
  spawnSync("tmux", ["send-keys", "-t", sessionName, "Enter"], {
    timeout: 5000,
  });

  // Начальная задержка — ждём пока claude начнёт обрабатывать
  await new Promise((r) => setTimeout(r, INITIAL_WAIT_MS));

  // Поллинг до ответа
  const startTime = Date.now();
  let lastCapture = "";
  let stableStart = 0;

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const current = tmuxCapturePaneFull(sessionName);

    if (current === lastCapture) {
      // Пан не меняется
      if (stableStart === 0) {
        stableStart = Date.now();
      }
      const stableMs = Date.now() - stableStart;
      if (stableMs >= STABLE_DURATION_MS && isResponseComplete(current)) {
        const output = extractNewContent(before, current);
        return { success: true, output };
      }
    } else {
      // Пан изменился — сбрасываем таймер стабильности
      stableStart = 0;
      lastCapture = current;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Таймаут — возвращаем что есть
  const final = tmuxCapturePaneFull(sessionName);
  const output = extractNewContent(before, final);
  return {
    success: true,
    output: output + "\n\n_(таймаут ожидания — ответ может быть неполным)_",
  };
}

/**
 * Проверяет доступность tmux сессии без отправки сообщений.
 */
export function checkTmuxSession(sessionName: string): boolean {
  return tmuxHasSession(sessionName);
}

/**
 * Снимает текущий экран tmux сессии (для мониторинга).
 */
export function captureTmuxScreen(sessionName: string): string {
  return tmuxCapturePaneFull(sessionName);
}
