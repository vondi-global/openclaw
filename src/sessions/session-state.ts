/**
 * session-state.ts — хранилище активных прокси-сессий по chat_id
 *
 * Файл: ~/.openclaw/session-state.json
 * Структура: { "<chat_id>": SessionEntry }
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SessionMode = "tmux" | "resume";

export type SessionEntry = {
  mode: SessionMode;
  /** Имя tmux сессии (для mode=tmux) */
  tmuxSession?: string;
  /** Claude session UUID (для mode=resume) */
  resumeId?: string;
  /** Рабочая директория проекта (для mode=resume) */
  cwd?: string;
  /** Краткое описание сессии для отображения */
  label?: string;
  switchedAt: string;
};

type StateStore = Record<string, SessionEntry>;

const STATE_PATH = join(homedir(), ".openclaw", "session-state.json");

function loadState(): StateStore {
  try {
    const raw = readFileSync(STATE_PATH, "utf8");
    return JSON.parse(raw) as StateStore;
  } catch {
    return {};
  }
}

function saveState(store: StateStore): void {
  const dir = join(homedir(), ".openclaw");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(STATE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function getSession(chatId: string): SessionEntry | null {
  const store = loadState();
  return store[chatId] ?? null;
}

export function setTmuxSession(chatId: string, tmuxSession: string, label: string): void {
  const store = loadState();
  store[chatId] = {
    mode: "tmux",
    tmuxSession,
    label,
    switchedAt: new Date().toISOString(),
  };
  saveState(store);
}

export function setResumeSession(
  chatId: string,
  resumeId: string,
  cwd: string,
  label: string,
): void {
  const store = loadState();
  store[chatId] = {
    mode: "resume",
    resumeId,
    cwd,
    label,
    switchedAt: new Date().toISOString(),
  };
  saveState(store);
}

export function clearSession(chatId: string): boolean {
  const store = loadState();
  if (!store[chatId]) {
    return false;
  }
  delete store[chatId];
  saveState(store);
  return true;
}

export function getAllSessions(): StateStore {
  return loadState();
}
