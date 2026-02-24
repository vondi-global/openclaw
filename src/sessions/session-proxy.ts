/**
 * session-proxy.ts — перехватчик входящих сообщений для роутинга в сессии
 *
 * Логика:
 * 1. Проверяем session-state.json для chat_id
 * 2. Если нет активной сессии → возвращаем { handled: false } → обычный поток openclaw
 * 3. Если mode=tmux → tmux send-keys + capture-pane
 * 4. Если mode=resume → claude --resume
 * 5. Если пользователь написал "назад" → очищаем состояние и возвращаем в openclaw
 */

import { runWithResume } from "./resume-runner.js";
import { clearSession, getSession } from "./session-state.js";
import { captureTmuxScreen, checkTmuxSession, sendToTmux } from "./tmux-runner.js";

/** Команды для возврата в обычный режим openclaw */
const BACK_COMMANDS = new Set([
  "назад",
  "back",
  "вернись",
  "выйти",
  "выйди",
  "отключить",
  "detach",
  "exit session",
  "выход из сессии",
  "вернуться",
]);

/** Команды для просмотра экрана без отправки */
const SCREEN_COMMANDS = new Set([
  "экран",
  "screen",
  "что там",
  "покажи экран",
  "capture",
  "статус",
]);

export interface ProxyResult {
  /** true — сообщение обработано, не нужно передавать в openclaw agent */
  handled: boolean;
  /** Текст ответа для отправки пользователю */
  response?: string;
}

function isBackCommand(text: string): boolean {
  return BACK_COMMANDS.has(text.toLowerCase().trim());
}

function isScreenCommand(text: string): boolean {
  return SCREEN_COMMANDS.has(text.toLowerCase().trim());
}

function formatLabel(label: string | undefined, sessionId: string): string {
  const displayLabel = label ?? sessionId.slice(0, 8);
  const truncated = displayLabel.length > 40 ? displayLabel.slice(0, 40) + "…" : displayLabel;
  return `[Сессия: ${truncated}]`;
}

/**
 * Главный метод — проверяет наличие активной proxy-сессии и роутит сообщение.
 * Вызывается из bot-message.ts ДО dispatchTelegramMessage.
 */
export async function tryProxyMessage(chatId: string, messageText: string): Promise<ProxyResult> {
  const session = getSession(chatId);
  if (!session) {
    return { handled: false };
  }

  // Команда возврата
  if (isBackCommand(messageText)) {
    clearSession(chatId);
    const mode =
      session.mode === "tmux"
        ? `tmux:${session.tmuxSession}`
        : `resume:${session.resumeId?.slice(0, 8)}`;
    return {
      handled: true,
      response: `Вернулся в основную сессию.\n_(была подключена: ${mode})_`,
    };
  }

  // === Режим tmux ===
  if (session.mode === "tmux" && session.tmuxSession) {
    const tmuxName = session.tmuxSession;
    const label = formatLabel(session.label, tmuxName);

    // Проверяем что сессия ещё живёт
    if (!checkTmuxSession(tmuxName)) {
      clearSession(chatId);
      return {
        handled: true,
        response: `tmux сессия '${tmuxName}' не найдена — возможно была закрыта.\nВернулся в обычный режим.`,
      };
    }

    // Команда просмотра экрана
    if (isScreenCommand(messageText)) {
      const screen = captureTmuxScreen(tmuxName);
      const trimmed = screen.trim().slice(-3000); // последние 3000 символов
      return {
        handled: true,
        response: `${label} — текущий экран:\n\`\`\`\n${trimmed}\n\`\`\``,
      };
    }

    // Отправляем сообщение в tmux
    const result = await sendToTmux(tmuxName, messageText);
    if (!result.success) {
      return {
        handled: true,
        response: `${label}\n\nОшибка tmux: ${result.error}`,
      };
    }

    const output = result.output.slice(0, 4000); // лимит Telegram
    return {
      handled: true,
      response: `${label}\n\n${output}`,
    };
  }

  // === Режим resume ===
  if (session.mode === "resume" && session.resumeId && session.cwd) {
    const label = formatLabel(session.label, session.resumeId);

    const result = runWithResume(session.resumeId, session.cwd, messageText);
    if (!result.success) {
      return {
        handled: true,
        response: `${label}\n\nОшибка resume: ${result.error}`,
      };
    }

    const output = result.output.slice(0, 4000);
    return {
      handled: true,
      response: `${label}\n\n${output}`,
    };
  }

  return { handled: false };
}
