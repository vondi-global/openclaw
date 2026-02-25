import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FOLLOWUP_QUEUES } from "../auto-reply/reply/queue/state.js";
import { resolveStateDir } from "../config/paths.js";
import { callGateway } from "../gateway/call.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const handoffLog = createSubsystemLogger("restart-handoff");

function resolveHandoffPath(): string {
  const stateDir = resolveStateDir(process.env);
  return path.join(stateDir, "restart-handoff.json");
}

/**
 * Serializable subset of FollowupRun — only the fields needed to replay
 * the message after a gateway restart. Non-serialisable fields (config,
 * skill snapshots, etc.) are intentionally omitted.
 */
type HandoffItem = {
  prompt: string;
  messageId?: string;
  summaryLine?: string;
  enqueuedAt: number;
  originatingChannel?: string;
  originatingTo?: string;
  originatingAccountId?: string;
  originatingThreadId?: string | number;
  sessionKey?: string;
};

type HandoffQueue = {
  key: string;
  mode: string;
  items: HandoffItem[];
};

export type HandoffData = {
  savedAt: number;
  version: 1;
  queues: HandoffQueue[];
};

const HANDOFF_MAX_AGE_MS = 5 * 60 * 1_000; // 5 minutes

/**
 * Serialise pending FOLLOWUP_QUEUES items to disk synchronously.
 *
 * Only queues that have at least one item with an `originatingTo` value are
 * persisted — these are the items that must be delivered back to a Telegram
 * chat (or other external channel) and would be silently lost otherwise.
 *
 * Must be called synchronously before server.close() so nothing is lost
 * in the tear-down window.
 */
export function saveRestartHandoff(): void {
  const queues: HandoffQueue[] = [];

  for (const [key, queue] of FOLLOWUP_QUEUES) {
    if (queue.items.length === 0) {
      continue;
    }

    // Only persist items that need to be routed back to an external channel.
    const serializableItems: HandoffItem[] = queue.items
      .filter((item) => Boolean(item.originatingTo))
      .map((item) => ({
        prompt: item.prompt,
        messageId: item.messageId,
        summaryLine: item.summaryLine,
        enqueuedAt: item.enqueuedAt,
        originatingChannel: item.originatingChannel,
        originatingTo: item.originatingTo,
        originatingAccountId: item.originatingAccountId,
        originatingThreadId: item.originatingThreadId,
        sessionKey: item.run?.sessionKey,
      }));

    if (serializableItems.length === 0) {
      continue;
    }

    queues.push({ key, mode: queue.mode, items: serializableItems });
  }

  if (queues.length === 0) {
    return;
  }

  const data: HandoffData = { savedAt: Date.now(), version: 1, queues };
  const handoffPath = resolveHandoffPath();
  const dir = path.dirname(handoffPath);

  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(handoffPath, JSON.stringify(data, null, 2), "utf8");
    const totalItems = queues.reduce((sum, q) => sum + q.items.length, 0);
    handoffLog.info(
      `saved ${totalItems} pending item(s) across ${queues.length} queue(s) to ${handoffPath}`,
    );
  } catch (err) {
    handoffLog.error(`failed to save restart handoff: ${String(err)}`);
  }
}

/**
 * Read and immediately delete the handoff file.
 *
 * Returns null when:
 * - the file does not exist (clean start)
 * - the file is malformed
 * - the file is older than HANDOFF_MAX_AGE_MS (guards against infinite
 *   replay loops if the gateway keeps crashing on replay)
 */
export function loadAndClearRestartHandoff(): HandoffData | null {
  const handoffPath = resolveHandoffPath();
  try {
    if (!existsSync(handoffPath)) {
      return null;
    }
    const raw = readFileSync(handoffPath, "utf8");
    // Delete the file immediately regardless of parse success so a
    // crash during replay does not re-trigger an infinite loop.
    try {
      unlinkSync(handoffPath);
    } catch {
      // Best-effort — if unlink fails the stale-age guard below will
      // prevent an infinite replay on the next restart.
    }
    const data = JSON.parse(raw) as HandoffData;
    if (Date.now() - data.savedAt > HANDOFF_MAX_AGE_MS) {
      handoffLog.warn("restart handoff file is stale (>5 min); ignoring");
      return null;
    }
    const totalItems = data.queues?.reduce(
      (sum: number, q: HandoffQueue) => sum + (q.items?.length ?? 0),
      0,
    );
    handoffLog.info(
      `loaded restart handoff: ${totalItems} item(s) across ${data.queues?.length ?? 0} queue(s)`,
    );
    return data;
  } catch {
    return null;
  }
}

/**
 * Replay pending items from a handoff snapshot by re-submitting each one
 * through the gateway `agent` method.
 *
 * Errors on individual items are swallowed — a best-effort replay is
 * preferable to crashing the gateway during startup.
 */
export async function replayHandoffQueues(handoff: HandoffData): Promise<void> {
  for (const queue of handoff.queues) {
    for (const item of queue.items) {
      try {
        handoffLog.info(
          `replaying item (queue=${queue.key}, to=${item.originatingTo ?? "?"}, enqueued=${item.enqueuedAt})`,
        );
        await callGateway({
          method: "agent",
          params: {
            sessionKey: item.sessionKey ?? queue.key,
            message: item.prompt,
            deliver: true,
            channel: item.originatingChannel,
            to: item.originatingTo,
            accountId: item.originatingAccountId,
            threadId:
              item.originatingThreadId != null ? String(item.originatingThreadId) : undefined,
          },
          expectFinal: false,
          timeoutMs: 5_000,
        });
      } catch (err) {
        handoffLog.warn(
          `replay failed for item (queue=${queue.key}, to=${item.originatingTo ?? "?"}): ${String(err)}`,
        );
      }
    }
  }
}
