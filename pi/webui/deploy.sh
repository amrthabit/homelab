#!/bin/bash
# Fast deploy. Skips work that hasn't changed. Times every critical section.
set -e
START=$(date +%s)

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEBUI="$REPO_ROOT/pi/webui"
STAMP_DIR="$WEBUI/.deploy-stamps"
mkdir -p "$STAMP_DIR"

# step <label> <cmd...>  — runs cmd, prints "[deploy] label  Ns"
step() {
    local label=$1
    shift
    local s=$(date +%s)
    "$@"
    local d=$(($(date +%s) - s))
    printf "[deploy] %-22s %2ds\n" "$label" "$d"
}

changed() {
    local file="$1"
    local stamp="$STAMP_DIR/$(basename "$file")"
    [ ! -f "$stamp" ] || ! cmp -s "$file" "$stamp"
}
mark() { cp "$1" "$STAMP_DIR/$(basename "$1")"; }

PREV_SHA=$(cat "$STAMP_DIR/.last_deployed_sha" 2>/dev/null || echo "")
step "git pull" git -C "$REPO_ROOT" pull --ff-only -q

CUR_SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD)
BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
SUBJECT=$(git -C "$REPO_ROOT" log -1 --pretty=%s)
echo "[deploy] HEAD                    $BRANCH @ $CUR_SHA  $SUBJECT"
if [ -n "$PREV_SHA" ] && [ "$PREV_SHA" != "$CUR_SHA" ]; then
    NCOMMITS=$(git -C "$REPO_ROOT" rev-list --count "$PREV_SHA..HEAD" 2>/dev/null || echo "?")
    NFILES=$(git -C "$REPO_ROOT" diff --name-only "$PREV_SHA" HEAD 2>/dev/null | wc -l)
    echo "[deploy] since last deploy       $NCOMMITS commits, $NFILES files changed (was $PREV_SHA)"
elif [ -z "$PREV_SHA" ]; then
    echo "[deploy] (first deploy on this Pi)"
else
    echo "[deploy] no new commits"
fi

[ -d "$WEBUI/venv" ] || python3 -m venv "$WEBUI/venv"
if changed "$WEBUI/backend/requirements.txt"; then
    step "pip install" "$WEBUI/venv/bin/pip" install -q -r "$WEBUI/backend/requirements.txt"
    mark "$WEBUI/backend/requirements.txt"
fi

cd "$WEBUI/frontend"
if [ ! -d node_modules ] || changed package.json || ([ -f package-lock.json ] && changed package-lock.json); then
    step "npm install" npm install --silent
    mark package.json
    [ -f package-lock.json ] && mark package-lock.json
fi

# Skip vite build if no frontend files changed since the last deploy
NEED_BUILD=1
if [ -n "$PREV_SHA" ] && [ -d "$WEBUI/frontend/dist" ]; then
    if ! git -C "$REPO_ROOT" diff --name-only "$PREV_SHA" HEAD 2>/dev/null | grep -qE '^pi/webui/frontend/(src|public|index\.html|vite\.config\.ts|tsconfig\.json|package\.json|package-lock\.json)'; then
        NEED_BUILD=0
        echo "[deploy] vite build              skipped (no frontend changes)"
    fi
fi
[ $NEED_BUILD -eq 1 ] && step "vite build" npx vite build --logLevel warn

step "dnsmasq config" cp "$REPO_ROOT/pi/dnsmasq.conf" /etc/dnsmasq.d/homelab.conf
step "nftables apply" "$WEBUI/venv/bin/python" -c "
import sys
sys.path.insert(0, '$WEBUI')
from backend.services import state, nftables
nftables.apply(state.load())
"
step "dnsmasq reload" systemctl reload-or-restart dnsmasq

if changed "$WEBUI/homelab-ui.service.template"; then
    step "ui service unit" bash -c "sed -e 's|__WEBUI__|$WEBUI|g' -e 's|__REPO__|$REPO_ROOT|g' '$WEBUI/homelab-ui.service.template' > /etc/systemd/system/homelab-ui.service && systemctl daemon-reload"
    mark "$WEBUI/homelab-ui.service.template"
fi
if changed "$WEBUI/homelab-poll.service.template"; then
    step "poll service unit" bash -c "sed -e 's|__WEBUI__|$WEBUI|g' -e 's|__REPO__|$REPO_ROOT|g' '$WEBUI/homelab-poll.service.template' > /etc/systemd/system/homelab-poll.service && systemctl daemon-reload"
    mark "$WEBUI/homelab-poll.service.template"
fi
if changed "$WEBUI/homelab-poll.timer"; then
    step "poll timer" bash -c "cp '$WEBUI/homelab-poll.timer' /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now homelab-poll.timer >/dev/null"
    mark "$WEBUI/homelab-poll.timer"
fi

if changed "$REPO_ROOT/pi/homelab-backup.service" || changed "$REPO_ROOT/pi/homelab-backup.timer"; then
    step "backup units" bash -c "cp '$REPO_ROOT/pi/homelab-backup.service' '$REPO_ROOT/pi/homelab-backup.timer' /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now homelab-backup.timer >/dev/null"
    mark "$REPO_ROOT/pi/homelab-backup.service"
    mark "$REPO_ROOT/pi/homelab-backup.timer"
    chmod +x "$REPO_ROOT/pi/backup.sh"
fi

# Skip ui restart if neither frontend (dist changed) nor backend changed
NEED_RESTART=1
if [ -n "$PREV_SHA" ] && [ "$NEED_BUILD" -eq 0 ]; then
    if ! git -C "$REPO_ROOT" diff --name-only "$PREV_SHA" HEAD 2>/dev/null | grep -qE '^pi/webui/(backend/|poll\.py)'; then
        NEED_RESTART=0
        echo "[deploy] ui restart              skipped (no backend changes)"
    fi
fi
[ $NEED_RESTART -eq 1 ] && step "ui restart" systemctl restart homelab-ui

echo "$CUR_SHA" > "$STAMP_DIR/.last_deployed_sha"
printf "[deploy] %-22s %2ds — http://%s  (sha %s)\n" "TOTAL" "$(($(date +%s) - START))" "$(hostname -I | awk '{print $1}')" "$CUR_SHA"
