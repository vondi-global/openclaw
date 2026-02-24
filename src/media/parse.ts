// Shared helpers for parsing MEDIA/BUTTONS tokens from command/stdout text.

import { parseFenceSpans } from "../markdown/fences.js";
import type { TelegramInlineButton, TelegramInlineButtons } from "../telegram/button-types.js";
import { parseAudioTag } from "./audio-tags.js";

// Allow optional wrapping backticks and punctuation after the token; capture the core token.
export const MEDIA_TOKEN_RE = /\bMEDIA:\s*`?([^\n]+)`?/gi;

export function normalizeMediaSource(src: string) {
  return src.startsWith("file://") ? src.replace("file://", "") : src;
}

function cleanCandidate(raw: string) {
  return raw.replace(/^[`"'[{(]+/, "").replace(/[`"'\\})\],]+$/, "");
}

const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const HAS_FILE_EXT = /\.\w{1,10}$/;

// Recognize local file path patterns. Security validation is deferred to the
// load layer (loadWebMedia / resolveSandboxedMediaSource) which has the context
// needed to enforce sandbox roots and allowed directories.
function isLikelyLocalPath(candidate: string): boolean {
  return (
    candidate.startsWith("/") ||
    candidate.startsWith("./") ||
    candidate.startsWith("../") ||
    candidate.startsWith("~") ||
    WINDOWS_DRIVE_RE.test(candidate) ||
    candidate.startsWith("\\\\") ||
    (!SCHEME_RE.test(candidate) && (candidate.includes("/") || candidate.includes("\\")))
  );
}

function isValidMedia(
  candidate: string,
  opts?: { allowSpaces?: boolean; allowBareFilename?: boolean },
) {
  if (!candidate) {
    return false;
  }
  if (candidate.length > 4096) {
    return false;
  }
  if (!opts?.allowSpaces && /\s/.test(candidate)) {
    return false;
  }
  if (/^https?:\/\//i.test(candidate)) {
    return true;
  }

  if (isLikelyLocalPath(candidate)) {
    return true;
  }

  // Accept bare filenames (e.g. "image.png") only when the caller opts in.
  // This avoids treating space-split path fragments as separate media items.
  if (opts?.allowBareFilename && !SCHEME_RE.test(candidate) && HAS_FILE_EXT.test(candidate)) {
    return true;
  }

  return false;
}

function unwrapQuoted(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return undefined;
  }
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (first !== last) {
    return undefined;
  }
  if (first !== `"` && first !== "'" && first !== "`") {
    return undefined;
  }
  return trimmed.slice(1, -1).trim();
}

// Check if a character offset is inside any fenced code block
function isInsideFence(fenceSpans: Array<{ start: number; end: number }>, offset: number): boolean {
  return fenceSpans.some((span) => offset >= span.start && offset < span.end);
}

export function splitMediaFromOutput(raw: string): {
  text: string;
  mediaUrls?: string[];
  mediaUrl?: string; // legacy first item for backward compatibility
  audioAsVoice?: boolean; // true if [[audio_as_voice]] tag was found
} {
  // KNOWN: Leading whitespace is semantically meaningful in Markdown (lists, indented fences).
  // We only trim the end; token cleanup below handles removing `MEDIA:` lines.
  const trimmedRaw = raw.trimEnd();
  if (!trimmedRaw.trim()) {
    return { text: "" };
  }

  const media: string[] = [];
  let foundMediaToken = false;

  // Parse fenced code blocks to avoid extracting MEDIA tokens from inside them
  const fenceSpans = parseFenceSpans(trimmedRaw);

  // Collect tokens line by line so we can strip them cleanly.
  const lines = trimmedRaw.split("\n");
  const keptLines: string[] = [];

  let lineOffset = 0; // Track character offset for fence checking
  for (const line of lines) {
    // Skip MEDIA extraction if this line is inside a fenced code block
    if (isInsideFence(fenceSpans, lineOffset)) {
      keptLines.push(line);
      lineOffset += line.length + 1; // +1 for newline
      continue;
    }

    const trimmedStart = line.trimStart();
    if (!trimmedStart.startsWith("MEDIA:")) {
      keptLines.push(line);
      lineOffset += line.length + 1; // +1 for newline
      continue;
    }

    const matches = Array.from(line.matchAll(MEDIA_TOKEN_RE));
    if (matches.length === 0) {
      keptLines.push(line);
      lineOffset += line.length + 1; // +1 for newline
      continue;
    }

    const pieces: string[] = [];
    let cursor = 0;

    for (const match of matches) {
      const start = match.index ?? 0;
      pieces.push(line.slice(cursor, start));

      const payload = match[1];
      const unwrapped = unwrapQuoted(payload);
      const payloadValue = unwrapped ?? payload;
      const parts = unwrapped ? [unwrapped] : payload.split(/\s+/).filter(Boolean);
      const mediaStartIndex = media.length;
      let validCount = 0;
      const invalidParts: string[] = [];
      let hasValidMedia = false;
      for (const part of parts) {
        const candidate = normalizeMediaSource(cleanCandidate(part));
        if (isValidMedia(candidate, unwrapped ? { allowSpaces: true } : undefined)) {
          media.push(candidate);
          hasValidMedia = true;
          foundMediaToken = true;
          validCount += 1;
        } else {
          invalidParts.push(part);
        }
      }

      const trimmedPayload = payloadValue.trim();
      const looksLikeLocalPath =
        isLikelyLocalPath(trimmedPayload) || trimmedPayload.startsWith("file://");
      if (
        !unwrapped &&
        validCount === 1 &&
        invalidParts.length > 0 &&
        /\s/.test(payloadValue) &&
        looksLikeLocalPath
      ) {
        const fallback = normalizeMediaSource(cleanCandidate(payloadValue));
        if (isValidMedia(fallback, { allowSpaces: true })) {
          media.splice(mediaStartIndex, media.length - mediaStartIndex, fallback);
          hasValidMedia = true;
          foundMediaToken = true;
          validCount = 1;
          invalidParts.length = 0;
        }
      }

      if (!hasValidMedia) {
        const fallback = normalizeMediaSource(cleanCandidate(payloadValue));
        if (isValidMedia(fallback, { allowSpaces: true, allowBareFilename: true })) {
          media.push(fallback);
          hasValidMedia = true;
          foundMediaToken = true;
          invalidParts.length = 0;
        }
      }

      if (hasValidMedia) {
        if (invalidParts.length > 0) {
          pieces.push(invalidParts.join(" "));
        }
      } else if (looksLikeLocalPath) {
        // Strip MEDIA: lines with local paths even when invalid (e.g. absolute paths
        // from internal tools like TTS). They should never leak as visible text.
        foundMediaToken = true;
      } else {
        // If no valid media was found in this match, keep the original token text.
        pieces.push(match[0]);
      }

      cursor = start + match[0].length;
    }

    pieces.push(line.slice(cursor));

    const cleanedLine = pieces
      .join("")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    // If the line becomes empty, drop it.
    if (cleanedLine) {
      keptLines.push(cleanedLine);
    }
    lineOffset += line.length + 1; // +1 for newline
  }

  let cleanedText = keptLines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  // Detect and strip [[audio_as_voice]] tag
  const audioTagResult = parseAudioTag(cleanedText);
  const hasAudioAsVoice = audioTagResult.audioAsVoice;
  if (audioTagResult.hadTag) {
    cleanedText = audioTagResult.text.replace(/\n{2,}/g, "\n").trim();
  }

  if (media.length === 0) {
    const result: ReturnType<typeof splitMediaFromOutput> = {
      // Return cleaned text if we found a media token OR audio tag, otherwise original
      text: foundMediaToken || hasAudioAsVoice ? cleanedText : trimmedRaw,
    };
    if (hasAudioAsVoice) {
      result.audioAsVoice = true;
    }
    return result;
  }

  return {
    text: cleanedText,
    mediaUrls: media,
    mediaUrl: media[0],
    ...(hasAudioAsVoice ? { audioAsVoice: true } : {}),
  };
}

// Regex: matches BUTTONS: token (word boundary, case-insensitive) anywhere in text.
// Supports both single-row [{...}] and multi-row [[{...}],[{...}]] formats.
export const BUTTONS_TOKEN_RE = /\bBUTTONS:\s*/gi;

function isValidButtonRow(row: unknown): row is TelegramInlineButton[] {
  if (!Array.isArray(row) || row.length === 0) {
    return false;
  }
  return row.every(
    (btn) =>
      btn &&
      typeof btn === "object" &&
      typeof (btn as TelegramInlineButton).text === "string" &&
      (btn as TelegramInlineButton).text.trim().length > 0 &&
      typeof (btn as TelegramInlineButton).callback_data === "string" &&
      (btn as TelegramInlineButton).callback_data.trim().length > 0 &&
      Buffer.byteLength((btn as TelegramInlineButton).callback_data.trim(), "utf8") <= 64,
  );
}

function parseButtonsJson(raw: string): TelegramInlineButtons | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return undefined;
  }
  // Detect format: [[{btn}, {btn}], [{btn}]] (array of rows) vs [{btn}, {btn}] (single row)
  const isMultiRow = Array.isArray(parsed[0]);
  const rows: TelegramInlineButton[][] = isMultiRow
    ? (parsed as unknown[][]).map((r) => r as TelegramInlineButton[])
    : [parsed as TelegramInlineButton[]];
  const validRows = rows.filter(isValidButtonRow);
  if (validRows.length === 0) {
    return undefined;
  }
  return validRows;
}

export function splitButtonsFromOutput(raw: string): {
  text: string;
  telegramButtons?: TelegramInlineButtons;
} {
  const trimmedRaw = raw.trimEnd();
  if (!trimmedRaw.trim()) {
    return { text: "" };
  }

  const fenceSpans = parseFenceSpans(trimmedRaw);
  const lines = trimmedRaw.split("\n");

  // Find BUTTONS: anywhere in a line (not just at line start), collect multi-line JSON.
  // Text before BUTTONS: on the same line is preserved as output text.
  const outputLines: string[] = [];
  let buttons: TelegramInlineButtons | undefined;

  let i = 0;
  let lineOffset = 0;
  while (i < lines.length) {
    const line = lines[i];

    const buttonsMatch = !isInsideFence(fenceSpans, lineOffset)
      ? /\bBUTTONS:\s*/i.exec(line)
      : null;

    if (buttonsMatch) {
      const textBefore = line.slice(0, buttonsMatch.index).trimEnd();
      const jsonStart = line.slice(buttonsMatch.index + buttonsMatch[0].length).trim();

      // Collect JSON: may continue on subsequent lines until blank line or next directive
      const jsonLines: string[] = [jsonStart];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (/\bBUTTONS:/i.test(nextLine) || /\bMEDIA:/i.test(nextLine)) {
          break; // next directive
        }
        if (nextLine.trim() === "" && jsonLines.join("").trim().endsWith("]")) {
          break; // end of JSON block
        }
        jsonLines.push(nextLine);
        j++;
      }
      const jsonStr = jsonLines.join("\n").trim();
      const parsed = parseButtonsJson(jsonStr);
      if (parsed) {
        if (!buttons) {
          buttons = parsed; // use first valid BUTTONS block
        }
        // Keep any text that appeared before BUTTONS: on the same line
        if (textBefore) {
          outputLines.push(textBefore);
        }
        i = j;
        lineOffset = lines.slice(0, j).reduce((acc, l) => acc + l.length + 1, 0);
        continue;
      }
    }

    outputLines.push(line);
    lineOffset += line.length + 1;
    i++;
  }

  if (!buttons) {
    return { text: trimmedRaw };
  }

  const cleanedText = outputLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: cleanedText, telegramButtons: buttons };
}
