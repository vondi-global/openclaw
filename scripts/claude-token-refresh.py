#!/usr/bin/env python3
"""Auto-refresh Claude CLI OAuth token before it expires.

Refreshes proactively when less than 2 hours remain on the access token.
Returns exit code 0 on success/no-refresh-needed, 1 on failure.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse

CREDS_FILE = os.path.expanduser("~/.claude/.credentials.json")
TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token"
CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
REFRESH_THRESHOLD_HOURS = 2


def load_credentials():
    with open(CREDS_FILE) as f:
        return json.load(f)


def save_credentials(creds):
    # Write atomically to temp file first, then rename
    tmp = CREDS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(creds, f, indent=2)
    os.replace(tmp, CREDS_FILE)


def do_refresh(refresh_token_val: str) -> dict:
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token_val,
        "client_id": CLIENT_ID,
    }).encode()

    req = urllib.request.Request(
        TOKEN_ENDPOINT,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def main():
    try:
        creds = load_credentials()
    except Exception as e:
        print(f"ERROR: Cannot read credentials: {e}", file=sys.stderr)
        sys.exit(1)

    oauth = creds.get("claudeAiOauth", {})
    expires_at = oauth.get("expiresAt", 0)
    now_ms = int(time.time() * 1000)
    remaining_ms = expires_at - now_ms
    remaining_h = remaining_ms / 1000 / 3600

    if remaining_ms > REFRESH_THRESHOLD_HOURS * 3600 * 1000:
        print(f"OK: Token valid for {remaining_h:.1f}h, no refresh needed")
        sys.exit(0)

    if remaining_ms <= 0:
        print(f"WARN: Token EXPIRED {abs(remaining_h):.1f}h ago, trying refresh")
    else:
        print(f"INFO: Token expires in {remaining_h:.1f}h, refreshing proactively")

    refresh_tok = oauth.get("refreshToken", "")
    if not refresh_tok:
        print("ERROR: No refresh token in credentials", file=sys.stderr)
        sys.exit(1)

    try:
        result = do_refresh(refresh_tok)
    except Exception as e:
        print(f"ERROR: Refresh request failed: {e}", file=sys.stderr)
        sys.exit(1)

    access_token = result.get("access_token", "")
    new_refresh = result.get("refresh_token", "")
    expires_in = result.get("expires_in", 28800)

    if not access_token:
        err = result.get("error", result.get("error_description", str(result)))
        print(f"ERROR: No access token in response: {err}", file=sys.stderr)
        sys.exit(1)

    # Update credentials atomically
    creds["claudeAiOauth"]["accessToken"] = access_token
    if new_refresh:
        creds["claudeAiOauth"]["refreshToken"] = new_refresh
    creds["claudeAiOauth"]["expiresAt"] = int((time.time() + expires_in) * 1000)

    try:
        save_credentials(creds)
    except Exception as e:
        print(f"ERROR: Failed to save credentials: {e}", file=sys.stderr)
        sys.exit(1)

    new_expires_h = expires_in / 3600
    print(f"OK: Token refreshed, valid for {new_expires_h:.1f}h")
    sys.exit(0)


if __name__ == "__main__":
    main()
