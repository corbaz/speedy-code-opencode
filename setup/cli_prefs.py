"""OpenCode's own preferences the plugin wants the same on every machine, set in ~/.config/opencode/cli.json.

Usage: cli_prefs.py [--check] [path]

Only the keys in PREFS are touched: one missing is added, one with another value is changed, and
everything else in the file (theme, keybinds, plugins) stays as it is. A copy of the file as it was
goes to cli.json.bak before any change, and the file is replaced whole at once, never half written.
A file OpenCode has not made yet is written with these keys alone.

Prints one line, what it did: "session.sidebar: auto → hide", or "ya estaba bien". With --check it
changes nothing and prints "ok oculta" or "fail a la vista". Exits 1, with the reason, when the file
cannot be read or written, and when --check finds the sidebar in sight.
"""

import json
import os
import shutil
import sys
import tempfile

# The session sidebar stays hidden: the plugin's own status line and footer say what it says.
PREFS = {("session", "sidebar"): "hide"}


def load(path: str) -> dict:
    if not os.path.exists(path):
        return {"$schema": "https://opencode.ai/v2/cli.json"}
    with open(path, encoding="utf-8") as source:
        config = json.load(source)
    if not isinstance(config, dict):
        raise ValueError("no es un objeto JSON")
    return config


def pending(config: dict) -> list:
    """The keys that still hold another value, each as (section, key, now, wanted)."""
    found = []
    for (section, key), value in PREFS.items():
        held = config.get(section)
        now = held.get(key) if isinstance(held, dict) else None
        if now != value:
            found.append((section, key, now, value))
    return found


def apply(path: str) -> str:
    config = load(path)
    changes = pending(config)
    if not changes:
        return "ya estaba bien"
    if os.path.exists(path):
        shutil.copyfile(path, f"{path}.bak")
    for section, key, _, value in changes:
        if not isinstance(config.get(section), dict):
            config[section] = {}
        config[section][key] = value
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=".cli.json.", dir=folder)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as target:
            json.dump(config, target, indent=2, ensure_ascii=False)
        os.replace(temporary, path)
    except BaseException:
        if os.path.exists(temporary):
            os.remove(temporary)
        raise
    return ", ".join(f"{section}.{key}: {now if now is not None else '—'} → {value}" for section, key, now, value in changes)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    arguments = [one for one in sys.argv[1:] if one != "--check"]
    path = arguments[0] if arguments else os.path.join(os.path.expanduser("~"), ".config", "opencode", "cli.json")
    try:
        if "--check" in sys.argv[1:]:
            hidden = not pending(load(path))
            print("ok oculta" if hidden else "fail a la vista")
            return 0 if hidden else 1
        print(apply(path))
        return 0
    except (OSError, ValueError) as error:
        print(f"no pude cambiar {os.path.basename(path)}: {error}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
