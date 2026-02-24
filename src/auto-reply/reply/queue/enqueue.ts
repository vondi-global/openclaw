import { appendFile } from "node:fs/promises";
import * as path from "node:path";
import { logVerbose } from "../../../globals.js";
import { applyQueueDropPolicy, shouldSkipQueueItem } from "../../../utils/queue-helpers.js";
import { getExistingFollowupQueue, getFollowupQueue } from "./state.js";
import type { FollowupRun, QueueDedupeMode, QueueSettings } from "./types.js";

function isRunAlreadyQueued(
  run: FollowupRun,
  items: FollowupRun[],
  allowPromptFallback = false,
): boolean {
  const hasSameRouting = (item: FollowupRun) =>
    item.originatingChannel === run.originatingChannel &&
    item.originatingTo === run.originatingTo &&
    item.originatingAccountId === run.originatingAccountId &&
    item.originatingThreadId === run.originatingThreadId;

  const messageId = run.messageId?.trim();
  if (messageId) {
    return items.some((item) => item.messageId?.trim() === messageId && hasSameRouting(item));
  }
  if (!allowPromptFallback) {
    return false;
  }
  return items.some((item) => item.prompt === run.prompt && hasSameRouting(item));
}

export function enqueueFollowupRun(
  key: string,
  run: FollowupRun,
  settings: QueueSettings,
  dedupeMode: QueueDedupeMode = "message-id",
): boolean {
  const queue = getFollowupQueue(key, settings);
  const dedupe =
    dedupeMode === "none"
      ? undefined
      : (item: FollowupRun, items: FollowupRun[]) =>
          isRunAlreadyQueued(item, items, dedupeMode === "prompt");

  // Deduplicate: skip if the same message is already queued.
  if (shouldSkipQueueItem({ item: run, items: queue.items, dedupe })) {
    return false;
  }

  queue.lastEnqueuedAt = Date.now();
  queue.lastRun = run.run;

  const shouldEnqueue = applyQueueDropPolicy({
    queue,
    summarize: (item) => item.summaryLine?.trim() || item.prompt.trim(),
  });
  if (!shouldEnqueue) {
    return false;
  }

  queue.items.push(run);

  // Variant C: if agent is actively running, also write message to OPENCLAW_INBOX.md
  // so the Claude Code process can check it between tool calls.
  if (queue.draining) {
    // Prefer workspaceDir from the current run; fall back to the last known run in this queue.
    const workspaceDir = run.run?.workspaceDir || queue.lastRun?.workspaceDir;
    if (workspaceDir) {
      const inboxFile = path.join(workspaceDir, "OPENCLAW_INBOX.md");
      const timestamp = new Date().toISOString();
      const entry = `\n---\n[${timestamp}]\n${run.prompt.trim()}\n`;
      logVerbose(`[inbox] writing mid-task message to ${inboxFile}`);
      void appendFile(inboxFile, entry, "utf8").catch((err) => {
        logVerbose(`[inbox] failed to write to ${inboxFile}: ${String(err)}`);
      });
    } else {
      logVerbose(`[inbox] queue.draining=true but no workspaceDir available (key=${key})`);
    }
  }

  return true;
}

export function getFollowupQueueDepth(key: string): number {
  const queue = getExistingFollowupQueue(key);
  if (!queue) {
    return 0;
  }
  return queue.items.length;
}
