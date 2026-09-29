#!/usr/bin/env bash
# ==============================================================================
# Install Zalo PC Desktop Entry, Icon & Autostart on Linux
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_SH="$SCRIPT_DIR/run.sh"
ICON_SOURCE="$SCRIPT_DIR/app-extracted/pc-dist/favicon-512x512.png"

APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"

DESKTOP_FILE="$APPS_DIR/zalo.desktop"
AUTOSTART_FILE="$AUTOSTART_DIR/zalo.desktop"
INSTALLED_ICON="$ICONS_DIR/zalo.png"

show_help() {
    cat <<EOF
Usage: ./install-desktop.sh [OPTIONS]

Options:
  --install       Install desktop entry and application icon (default)
  --autostart     Install desktop entry and enable autostart on system boot
  --no-autostart  Disable autostart on boot (removes autostart entry)
  --uninstall     Remove desktop entry, autostart, and installed icons
  --help, -h      Show this help message
EOF
}

uninstall_desktop() {
    echo "Removing Zalo PC desktop integration..."
    rm -f "$DESKTOP_FILE"
    rm -f "$AUTOSTART_FILE"
    rm -f "$INSTALLED_ICON"

    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$APPS_DIR" 2>/dev/null || true
    fi
    if command -v gtk-update-icon-cache >/dev/null 2>&1; then
        gtk-update-icon-cache -q -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" 2>/dev/null || true
    fi

    echo "✅ Zalo PC desktop integration successfully removed."
}

install_desktop() {
    local enable_autostart="${1:-false}"

    echo "Installing Zalo PC desktop integration..."
    if ! mkdir -p "$APPS_DIR" 2>/dev/null; then
        echo "❌ Cannot create applications directory: $APPS_DIR" >&2
        echo "   Please check write permissions for $APPS_DIR" >&2
        return 1
    fi

    # 1. Copy icon
    ICON_ENTRY="$ICON_SOURCE"
    if [ -f "$ICON_SOURCE" ]; then
        if mkdir -p "$ICONS_DIR" 2>/dev/null; then
            if cp -f "$ICON_SOURCE" "$INSTALLED_ICON" 2>/dev/null; then
                ICON_ENTRY="zalo"
            fi
        fi
    fi

    # 2. Create desktop application launcher
    cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Zalo
GenericName=Chat & Instant Messaging
Comment=Zalo Desktop Client for Linux
Exec="$RUN_SH" %U
Icon=$ICON_ENTRY
Terminal=false
StartupWMClass=Zalo
Categories=Network;InstantMessaging;Chat;
MimeType=x-scheme-handler/zalo;
Keywords=zalo;chat;message;vng;im;

Actions=Cyberpunk;Stock;

[Desktop Action Cyberpunk]
Name=Mở Zalo (Cyberpunk Theme)
Exec=env ZALO_THEME=cyberpunk "$RUN_SH"

[Desktop Action Stock]
Name=Mở Zalo (Giao diện chuẩn)
Exec=env ZALO_THEME=default "$RUN_SH"
EOF

    chmod +x "$DESKTOP_FILE"

    # 3. Handle Autostart
    if [ "$enable_autostart" = "true" ]; then
        mkdir -p "$AUTOSTART_DIR"
        cat > "$AUTOSTART_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Zalo (Autostart)
Comment=Zalo Desktop Client (Start Minimized)
Exec="$RUN_SH" --minimized
Icon=$ICON_ENTRY
Terminal=false
StartupWMClass=Zalo
Categories=Network;InstantMessaging;Chat;
X-GNOME-Autostart-enabled=true
EOF
        chmod +x "$AUTOSTART_FILE"
        echo "✅ Autostart enabled: Zalo will start minimized to tray on boot."
    fi

    # 4. Update system caches & MIME association
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$APPS_DIR" 2>/dev/null || true
    fi
    if command -v gtk-update-icon-cache >/dev/null 2>&1; then
        gtk-update-icon-cache -q -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" 2>/dev/null || true
    fi
    if command -v xdg-mime >/dev/null 2>&1; then
        xdg-mime default zalo.desktop x-scheme-handler/zalo 2>/dev/null || true
    fi

    echo "✅ Zalo desktop launcher installed: $DESKTOP_FILE"
    echo "✅ Application icon installed: $INSTALLED_ICON"
    echo "🎉 Zalo is now available in your Application Launcher!"
}

ACTION="install"
ENABLE_AUTOSTART="false"

while [ $# -gt 0 ]; do
    case "$1" in
        --install)
            ACTION="install"
            shift
            ;;
        --autostart)
            ACTION="install"
            ENABLE_AUTOSTART="true"
            shift
            ;;
        --no-autostart)
            rm -f "$AUTOSTART_FILE"
            echo "✅ Autostart disabled."
            exit 0
            ;;
        --uninstall)
            ACTION="uninstall"
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            show_help
            exit 1
            ;;
    esac
done

if [ "$ACTION" = "uninstall" ]; then
    uninstall_desktop
else
    install_desktop "$ENABLE_AUTOSTART"
fi
