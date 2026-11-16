#!/usr/bin/env python3
"""Capture a bounded, best-effort CoreSimulator device snapshot."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


def _output_text(value: str | bytes | None) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value or ""


def capture_simulator_snapshot(destination: Path, timeout: float = 20) -> dict[str, object]:
    try:
        result = subprocess.run(
            ["xcrun", "simctl", "list", "devices", "-j"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        record: dict[str, object] = {
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except subprocess.TimeoutExpired as exc:
        record = {
            "timedOut": True,
            "timeoutSeconds": timeout,
            "stdout": _output_text(exc.stdout),
            "stderr": _output_text(exc.stderr),
        }
    except OSError as exc:
        record = {"error": str(exc)}

    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(record, indent=2), encoding="utf-8")
    except OSError as exc:
        print(f"Could not write simulator snapshot to {destination}: {exc}", file=sys.stderr)
    return record


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {Path(sys.argv[0]).name} OUTPUT_PATH", file=sys.stderr)
        return 2
    capture_simulator_snapshot(Path(sys.argv[1]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
