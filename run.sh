#!/bin/bash
# ==============================================================================
# Launch Zalo PC on Ubuntu / Linux via Electron
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/app-extracted"

# 1. Resolve Electron executable
find_electron() {
    # If user explicitly specified ELECTRON_BIN or ELECTRON_PATH in environment, use it
    if [ -n "$ELECTRON_BIN" ] && [ -x "$ELECTRON_BIN" ]; then
        echo "$ELECTRON_BIN"
        return 0
    fi
    if [ -n "$ELECTRON_PATH" ] && [ -x "$ELECTRON_PATH" ]; then
        echo "$ELECTRON_PATH"
        return 0
    fi

    # Check PATH
    if command -v electron >/dev/null 2>&1; then
        command -v electron
        return 0
    fi

    # Check common system, package manager, and local development locations
    local search_paths=(
        "$SCRIPT_DIR/node_modules/.bin/electron"
        "$SCRIPT_DIR/../node_modules/.bin/electron"
        "/usr/bin/electron"
        "/usr/local/bin/electron"
        "/snap/bin/electron"
        "$HOME/.local/bin/electron"
        "$HOME/.local/share/pnpm/electron"
        "$HOME/.npm-global/bin/electron"
    )

    for bin in "${search_paths[@]}"; do
        if [ -x "$bin" ]; then
            echo "$bin"
            return 0
        fi
    done

    # Check local development directories with glob expansion
    for bin in "$SCRIPT_DIR"/../node_modules/.bin/electron \
               "$HOME"/AI/*/node_modules/.bin/electron \
               "$HOME"/.cache/electron/*/electron; do
        if [ -x "$bin" ]; then
            echo "$bin"
            return 0
        fi
    done

    return 1
}

RESOLVED_ELECTRON="$(find_electron || true)"

if [ -z "$RESOLVED_ELECTRON" ] || [ ! -x "$RESOLVED_ELECTRON" ]; then
    echo "[ERROR] Electron binary not found!" >&2
    echo "Please set ELECTRON_BIN or install Electron:" >&2
    echo "  export ELECTRON_BIN=/path/to/electron" >&2
    echo "  or: npm install -g electron" >&2
    exit 1
fi

# 2. Ensure X11 display is set
if [ -z "$DISPLAY" ]; then
    if [ -S "/tmp/.X11-unix/X1" ]; then
        export DISPLAY=:1
    elif [ -S "/tmp/.X11-unix/X0" ]; then
        export DISPLAY=:0
    else
        export DISPLAY=:0
    fi
fi

echo "=================================================="
echo " Starting Zalo PC (Linux)"
echo " App Directory: $APP_DIR"
echo " Electron:      $RESOLVED_ELECTRON"
echo " Display:       $DISPLAY"
echo "=================================================="

# 3. Prepare launch flags
EXTRA_FLAGS=()
# Enable --no-sandbox if running as root or when requested (default: 1 on Linux to avoid SUID sandbox errors)
if [ "${ZALO_NO_SANDBOX:-1}" = "1" ] || [ "$(id -u)" = "0" ]; then
    EXTRA_FLAGS+=("--no-sandbox")
fi

# 4. Launch the application
cd "$APP_DIR"
exec "$RESOLVED_ELECTRON" "${EXTRA_FLAGS[@]}" . "$@"
