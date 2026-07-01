#!/bin/sh
# Lint all shell scripts under infrastructure/ using shellcheck.
# Follows POSIX sh conventions from infrastructure/n8n/lib.sh.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- Check for shellcheck ---

if ! command -v shellcheck >/dev/null 2>&1; then
    printf "shellcheck not found.\n" >&2
    printf "Install it:\n" >&2
    printf "  macOS:  brew install shellcheck\n" >&2
    printf "  Debian: apt-get install shellcheck\n" >&2
    printf "  Arch:   pacman -S shellcheck\n" >&2
    exit 1
fi

# --- Find and lint shell scripts ---

FOUND=0
FAILED=0

while IFS= read -r f; do
    FOUND=$((FOUND + 1))
    if ! shellcheck -s sh "$f"; then
        FAILED=$((FAILED + 1))
    fi
done << EOF
$(find "$REPO_ROOT/infrastructure" -name '*.sh' -type f 2>/dev/null)
EOF

if [ "$FOUND" -eq 0 ]; then
    printf "No .sh files found under infrastructure/\n"
    exit 0
fi

printf "\n--- Results ---\n"
printf "Files checked: %d\n" "$FOUND"
printf "Files with issues: %d\n" "$FAILED"

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi

printf "All clean!\n"
