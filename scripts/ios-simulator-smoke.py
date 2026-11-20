#!/usr/bin/env python3
"""
R20-4 iOS Simulator runtime acceptance smoke runner.

Creates an ephemeral iOS Simulator for the installed iOS 26.4 runtime, installs
the unsigned App.app build, exercises cold launch + process survival + terminate
without uninstall + relaunch + process survival via `xcrun simctl`, then runs
the `AppUITests` bundle (`xcodebuild test`) to verify the bundled WKWebView
entrypoint renders real UI, survives background/foreground transitions, and
persists onboarding state across process termination/relaunch.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import plistlib
import pty
import re
import select
import shutil
import struct
import subprocess
import sys
import time
from typing import Any, Callable


class SimulatorInfrastructureError(RuntimeError):
    """Raised when CoreSimulator / simctl fails due to infrastructure or transport issues."""


def run_cmd(
    args: list[str],
    *,
    timeout: int = 60,
    check: bool = True,
    capture: bool = True,
    step_timings: list[dict[str, Any]] | None = None,
    step_name: str | None = None,
) -> subprocess.CompletedProcess[str]:
    print(f"+ {' '.join(args)}", flush=True)
    started = time.monotonic()
    try:
        proc = subprocess.run(
            args,
            timeout=timeout,
            check=check,
            text=True,
            capture_output=capture,
        )
    except subprocess.TimeoutExpired:
        elapsed = round(time.monotonic() - started, 3)
        if step_timings is not None:
            step_timings.append(
                {
                    "step": step_name or " ".join(args[:3]),
                    "command": args,
                    "elapsedSeconds": elapsed,
                    "timedOut": True,
                    "timeoutSeconds": timeout,
                    "returncode": None,
                }
            )
        raise
    except subprocess.CalledProcessError as exc:
        elapsed = round(time.monotonic() - started, 3)
        if step_timings is not None:
            step_timings.append(
                {
                    "step": step_name or " ".join(args[:3]),
                    "command": args,
                    "elapsedSeconds": elapsed,
                    "timedOut": False,
                    "returncode": exc.returncode,
                }
            )
        raise

    elapsed = round(time.monotonic() - started, 3)
    if step_timings is not None:
        step_timings.append(
            {
                "step": step_name or " ".join(args[:3]),
                "command": args,
                "elapsedSeconds": elapsed,
                "timedOut": False,
                "returncode": proc.returncode,
            }
        )
    return proc


def run_cmd_best_effort(
    args: list[str],
    *,
    timeout: int = 30,
    step_timings: list[dict[str, Any]] | None = None,
    step_name: str | None = None,
) -> dict[str, Any]:
    """Run a command without raising on non-zero exit, timeout, or OS errors."""
    started = time.monotonic()
    try:
        proc = run_cmd(
            args,
            timeout=timeout,
            check=False,
            capture=True,
            step_timings=step_timings,
            step_name=step_name,
        )
        return {
            "command": args,
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "timedOut": False,
            "elapsedSeconds": round(time.monotonic() - started, 3),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "command": args,
            "ok": False,
            "returncode": None,
            "timedOut": True,
            "timeoutSeconds": timeout,
            "error": str(exc),
            "elapsedSeconds": round(time.monotonic() - started, 3),
        }
    except OSError as exc:
        return {
            "command": args,
            "ok": False,
            "returncode": None,
            "timedOut": False,
            "error": str(exc),
            "elapsedSeconds": round(time.monotonic() - started, 3),
        }


TRANSIENT_SIMCTL_ERROR_MARKERS = (
    "coresimulatorservice",
    "connection invalidated",
    "connection interrupted",
    "xpc",
    "unable to lookup",
    "service exited",
    "bootstrap failed",
    "timed out",
    "timeout",
    "resource temporarily unavailable",
    "simlaunchhost",
)


def is_transient_simctl_error(exc: subprocess.CalledProcessError) -> bool:
    """Return True only for identifiable CoreSimulator transport/service errors."""
    combined = f"{exc.stderr or ''}\n{exc.stdout or ''}".lower()
    return any(marker in combined for marker in TRANSIENT_SIMCTL_ERROR_MARKERS)


def run_simctl_with_retry(
    args: list[str],
    *,
    timeout: int,
    retries: int = 1,
    retry_delay_s: float = 3.0,
    step_timings: list[dict[str, Any]] | None = None,
    step_name: str | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a simctl command, retrying only timeouts or identifiable CoreSimulator transport failures."""
    last_exc: Exception | None = None
    for attempt in range(1 + retries):
        try:
            return run_cmd(
                args,
                timeout=timeout,
                check=True,
                step_timings=step_timings,
                step_name=step_name,
            )
        except subprocess.TimeoutExpired as exc:
            last_exc = exc
            if attempt < retries:
                print(
                    f"Transient simctl timeout on attempt {attempt + 1}/{1 + retries}: {exc}; "
                    f"retrying in {retry_delay_s}s...",
                    file=sys.stderr,
                    flush=True,
                )
                time.sleep(retry_delay_s)
        except subprocess.CalledProcessError as exc:
            if not is_transient_simctl_error(exc):
                raise
            last_exc = exc
            if attempt < retries:
                print(
                    f"Transient CoreSimulator transport failure on attempt {attempt + 1}/{1 + retries}: {exc}; "
                    f"retrying in {retry_delay_s}s...",
                    file=sys.stderr,
                    flush=True,
                )
                time.sleep(retry_delay_s)
    raise SimulatorInfrastructureError(f"simctl command failed after {1 + retries} attempt(s): {last_exc}") from last_exc


def get_simulator_state(udid: str) -> str | None:
    try:
        proc = run_cmd(["xcrun", "simctl", "list", "devices", "-j"], timeout=30, check=False)
    except subprocess.TimeoutExpired:
        return None
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None
    for devices in data.get("devices", {}).values():
        if not isinstance(devices, list):
            continue
        for dev in devices:
            if isinstance(dev, dict) and dev.get("udid") == udid:
                state = dev.get("state")
                return str(state) if state is not None else None
    return None


def is_springboard_ready(launchctl_output: str) -> bool:
    for line in launchctl_output.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[0].isdigit() and "com.apple.SpringBoard" in parts[2]:
            return True
    return False


def wait_for_simulator_ready(
    udid: str,
    *,
    timeout_s: float = 120.0,
    poll_interval_s: float = 2.0,
    settle_s: float = 2.0,
    step_timings: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Poll CoreSimulator and launchd_sim until the booted simulator services are responsive."""
    started = time.monotonic()
    deadline = started + timeout_s
    attempts = 0
    last_reason = "not checked"

    while time.monotonic() < deadline:
        attempts += 1
        state = get_simulator_state(udid)
        if state != "Booted":
            last_reason = (
                "simctl list devices timed out or unavailable"
                if state is None
                else f"device state is {state!r}, expected 'Booted'"
            )
            time.sleep(poll_interval_s)
            continue

        try:
            launchctl_proc = run_cmd(
                ["xcrun", "simctl", "spawn", udid, "launchctl", "list"],
                timeout=30,
                check=False,
            )
            if launchctl_proc.returncode != 0:
                last_reason = f"launchctl list exited {launchctl_proc.returncode}"
            elif not is_springboard_ready(launchctl_proc.stdout):
                last_reason = "SpringBoard not yet active in launchctl list"
            else:
                if settle_s > 0:
                    time.sleep(settle_s)
                elapsed = round(time.monotonic() - started, 3)
                info = {
                    "ready": True,
                    "attempts": attempts,
                    "elapsedSeconds": elapsed,
                    "settleSeconds": settle_s,
                    "state": state,
                }
                if step_timings is not None:
                    step_timings.append(
                        {
                            "step": "wait_for_simulator_ready",
                            "elapsedSeconds": elapsed,
                            "attempts": attempts,
                            "timedOut": False,
                            "returncode": 0,
                        }
                    )
                return info
        except subprocess.TimeoutExpired:
            last_reason = "launchctl list timed out"
        time.sleep(poll_interval_s)

    elapsed = round(time.monotonic() - started, 3)
    if step_timings is not None:
        step_timings.append(
            {
                "step": "wait_for_simulator_ready",
                "elapsedSeconds": elapsed,
                "attempts": attempts,
                "timedOut": True,
                "returncode": None,
            }
        )
    raise SimulatorInfrastructureError(
        f"Simulator {udid} did not become service-ready within {timeout_s}s "
        f"after {attempts} poll(s): {last_reason}"
    )


def _tail_file(src: Path, dest: Path, max_lines: int = 500) -> bool:
    if not src.is_file():
        return False
    try:
        lines = src.read_text(encoding="utf-8", errors="replace").splitlines()
        dest.write_text("\n".join(lines[-max_lines:]) + "\n", encoding="utf-8")
        return True
    except OSError:
        return False


def collect_simulator_diagnostics(
    udid: str | None,
    evidence_dir: Path,
    label: str,
) -> dict[str, Any]:
    """Best-effort capture of CoreSimulator state and logs; never raises."""
    diag_dir = evidence_dir / "diagnostics"
    captured: dict[str, Any] = {"label": label, "files": []}
    try:
        diag_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        captured["error"] = f"Could not create diagnostics directory {diag_dir}: {exc}"
        return captured

    for name, cmd in (
        (f"{label}-simctl-devices.json", ["xcrun", "simctl", "list", "devices", "-j"]),
        (f"{label}-simctl-runtimes.json", ["xcrun", "simctl", "list", "runtimes", "-j"]),
    ):
        try:
            proc = run_cmd(cmd, timeout=20, check=False)
            out_path = diag_dir / name
            out_path.write_text(proc.stdout or proc.stderr or "", encoding="utf-8")
            captured["files"].append(str(out_path.relative_to(evidence_dir)))
        except (subprocess.TimeoutExpired, OSError):
            pass

    if udid:
        try:
            proc = run_cmd(
                ["xcrun", "simctl", "spawn", udid, "launchctl", "list"],
                timeout=15,
                check=False,
            )
            out_path = diag_dir / f"{label}-launchctl-list.txt"
            out_path.write_text(proc.stdout or proc.stderr or "", encoding="utf-8")
            captured["files"].append(str(out_path.relative_to(evidence_dir)))
        except (subprocess.TimeoutExpired, OSError):
            pass

        device_sys_log = Path.home() / "Library" / "Logs" / "CoreSimulator" / udid / "system.log"
        dest_sys_log = diag_dir / f"{label}-device-system.log"
        if _tail_file(device_sys_log, dest_sys_log):
            captured["files"].append(str(dest_sys_log.relative_to(evidence_dir)))

    coresim_log = Path.home() / "Library" / "Logs" / "CoreSimulator" / "CoreSimulator.log"
    dest_coresim_log = diag_dir / f"{label}-CoreSimulator.log"
    if _tail_file(coresim_log, dest_coresim_log):
        captured["files"].append(str(dest_coresim_log.relative_to(evidence_dir)))

    return captured


def cleanup_simulator(
    udid: str,
    bundle_id: str,
    step_timings: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Best-effort, exception-safe simulator teardown."""
    return {
        "udid": udid,
        "terminate": run_cmd_best_effort(
            ["xcrun", "simctl", "terminate", udid, bundle_id],
            timeout=30,
            step_timings=step_timings,
            step_name="cleanup_terminate",
        ),
        "shutdown": run_cmd_best_effort(
            ["xcrun", "simctl", "shutdown", udid],
            timeout=30,
            step_timings=step_timings,
            step_name="cleanup_shutdown",
        ),
        "delete": run_cmd_best_effort(
            ["xcrun", "simctl", "delete", udid],
            timeout=30,
            step_timings=step_timings,
            step_name="cleanup_delete",
        ),
    }


def write_summary_safe(evidence_dir: Path, summary: dict[str, Any]) -> None:
    try:
        evidence_dir.mkdir(parents=True, exist_ok=True)
        (evidence_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    except OSError as exc:
        print(f"::warning::Failed to write summary.json: {exc}", file=sys.stderr, flush=True)


def select_ios_runtime(target_version: str) -> dict[str, str]:
    proc = run_cmd(["xcrun", "simctl", "list", "runtimes", "-j"], timeout=30)
    data = json.loads(proc.stdout)
    runtimes = data.get("runtimes", [])
    matching = [
        r
        for r in runtimes
        if r.get("isAvailable")
        and (
            r.get("version") == target_version
            or r.get("name") == f"iOS {target_version}"
            or str(r.get("version", "")).startswith(f"{target_version}.")
        )
    ]
    if not matching:
        raise RuntimeError(f"No available iOS {target_version} simulator runtime found.")
    chosen = matching[0]
    return {
        "identifier": str(chosen["identifier"]),
        "name": str(chosen.get("name", "")),
        "version": str(chosen.get("version", "")),
        "buildversion": str(chosen.get("buildversion", "")),
    }


def select_iphone_devicetype(runtime: dict[str, str]) -> dict[str, str]:
    proc = run_cmd(["xcrun", "simctl", "list", "devicetypes", "-j"], timeout=30)
    data = json.loads(proc.stdout)
    devicetypes = [
        dt
        for dt in data.get("devicetypes", [])
        if dt.get("productFamily") == "iPhone"
        and str(dt.get("identifier", "")).startswith("com.apple.CoreSimulator.SimDeviceType.iPhone")
    ]
    if not devicetypes:
        raise RuntimeError("No iPhone simulator device types found.")

    def sort_key(dt: dict[str, object]) -> tuple[int, str]:
        name = str(dt.get("name", ""))
        # Prefer standard modern non-Pro/Max/SE/e models when available, deterministically.
        if re.fullmatch(r"iPhone \d+", name):
            num = int(name.split()[-1])
            return (0, f"{999 - num:03d}-{name}")
        if "Pro" not in name and "Max" not in name and "Plus" not in name and "SE" not in name:
            return (1, name)
        return (2, name)

    devicetypes.sort(key=sort_key)

    # Filter by supportedRuntime if Xcode exposes it, otherwise try sorted list.
    for dt in devicetypes:
        supported = dt.get("supportedRuntimes")
        if isinstance(supported, list) and supported:
            if runtime["identifier"] not in supported:
                continue
        return {
            "identifier": str(dt["identifier"]),
            "name": str(dt.get("name", "")),
        }

    # Fallback to the highest-ranked iPhone devicetype.
    return {
        "identifier": str(devicetypes[0]["identifier"]),
        "name": str(devicetypes[0].get("name", "")),
    }


def try_parse_simctl_launch_pid(output: str, bundle_id: str) -> int | None:
    pattern = re.compile(rf"^{re.escape(bundle_id)}:\s*(\d+)$")
    for line in output.splitlines():
        match = pattern.match(line.strip())
        if match:
            pid = int(match.group(1))
            if pid > 0:
                return pid
    return None


def parse_simctl_launch_pid(output: str, bundle_id: str) -> int:
    pid = try_parse_simctl_launch_pid(output, bundle_id)
    if pid is not None:
        return pid
    raise RuntimeError(f"Could not parse launched PID for {bundle_id} from: {output!r}")


def _normalize_exec_path(path_str: str) -> str:
    cleaned = path_str.strip()
    if not cleaned:
        return ""
    try:
        if os.path.exists(cleaned):
            return os.path.realpath(cleaned)
    except OSError:
        pass
    return os.path.normpath(cleaned)


def parse_ps_line(line: str) -> dict[str, Any] | None:
    """Parse one row from `ps -o pid=,ppid=,stat=,etime=,comm=`."""
    parts = line.strip().split(None, 4)
    if len(parts) < 5:
        return None
    pid_str, ppid_str, stat, etime, comm = parts
    if not pid_str.isdigit() or not ppid_str.isdigit():
        return None
    comm_clean = comm.strip()
    if not comm_clean:
        return None
    return {
        "pid": int(pid_str),
        "ppid": int(ppid_str),
        "stat": stat,
        "etime": etime,
        "comm": comm_clean,
    }


def inspect_host_process(pid: int) -> dict[str, Any]:
    """Inspect a host PID via `ps`, distinguishing absent, alive, zombie, and unavailable."""
    try:
        proc = run_cmd(
            ["ps", "-p", str(pid), "-o", "pid=,ppid=,stat=,etime=,comm="],
            timeout=15,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {
            "status": "unavailable",
            "returncode": None,
            "raw": "",
            "error": str(exc),
        }

    raw_out = proc.stdout.strip()
    if proc.returncode == 1 and not raw_out:
        return {
            "status": "absent",
            "returncode": 1,
            "raw": "",
        }
    if proc.returncode != 0:
        return {
            "status": "unavailable",
            "returncode": proc.returncode,
            "raw": raw_out,
            "error": f"ps exited {proc.returncode}: {(proc.stderr or '').strip()}",
        }

    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    if not lines:
        return {
            "status": "unavailable",
            "returncode": 0,
            "raw": raw_out,
            "error": "ps returned exit 0 with empty stdout",
        }
    parsed = parse_ps_line(lines[0])
    if parsed is None or parsed["pid"] != pid:
        return {
            "status": "unavailable",
            "returncode": 0,
            "raw": raw_out,
            "error": f"unparseable or mismatched ps output: {raw_out!r}",
        }
    is_zombie = "Z" in parsed["stat"].upper()
    return {
        "status": "zombie" if is_zombie else "alive",
        "returncode": 0,
        "raw": raw_out,
        **parsed,
    }


def read_bundle_identifier(app_bundle_dir: Path) -> str | None:
    """Read CFBundleIdentifier from an .app bundle's Info.plist."""
    plist_path = app_bundle_dir / "Info.plist"
    if not plist_path.is_file():
        return None
    try:
        data = plistlib.loads(plist_path.read_bytes())
    except (OSError, plistlib.InvalidFileException, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    bundle_id = data.get("CFBundleIdentifier")
    if isinstance(bundle_id, str) and bundle_id.strip():
        return bundle_id.strip()
    return None


def classify_process_identity(
    proc_info: dict[str, Any],
    *,
    udid: str,
    bundle_id: str,
    expected_binary_path: str,
    expected_ppid: int | None = None,
) -> dict[str, Any]:
    """Verify host process identity against expected simulator container binary and Info.plist."""
    status = proc_info.get("status")
    if status == "absent":
        return {
            "match": False,
            "classification": "absent",
            "reason": "PID is not present in host process table",
        }
    if status == "unavailable":
        return {
            "match": False,
            "classification": "identity_unavailable",
            "reason": str(proc_info.get("error") or "host process identity unavailable"),
        }
    if status == "zombie":
        return {
            "match": False,
            "classification": "zombie",
            "reason": f"PID {proc_info.get('pid')} is in zombie state ({proc_info.get('stat')})",
        }

    if expected_ppid is not None and proc_info.get("ppid") != expected_ppid:
        return {
            "match": False,
            "classification": "pid_reused_or_wrong_identity",
            "reason": (
                f"PID {proc_info.get('pid')} parent PID {proc_info.get('ppid')} "
                f"does not match expected parent PID {expected_ppid}"
            ),
        }

    comm = str(proc_info.get("comm") or "")
    comm_norm = _normalize_exec_path(comm)
    expected_norm = _normalize_exec_path(expected_binary_path)
    if not comm_norm or comm_norm != expected_norm:
        return {
            "match": False,
            "classification": "pid_reused_or_wrong_identity",
            "reason": (
                f"PID {proc_info.get('pid')} executable {comm!r} does not match "
                f"expected simulator app binary {expected_binary_path!r}"
            ),
        }

    if udid and udid in expected_norm and udid not in comm_norm:
        return {
            "match": False,
            "classification": "pid_reused_or_wrong_identity",
            "reason": f"PID {proc_info.get('pid')} executable does not belong to simulator {udid}",
        }

    bundle_dir = Path(comm_norm).parent
    observed_bundle_id = read_bundle_identifier(bundle_dir)
    if observed_bundle_id is None:
        return {
            "match": False,
            "classification": "identity_unavailable",
            "reason": f"Could not read CFBundleIdentifier from {bundle_dir / 'Info.plist'}",
        }
    if observed_bundle_id != bundle_id:
        return {
            "match": False,
            "classification": "wrong_bundle_id",
            "reason": (
                f"Running app bundle {bundle_dir} declares CFBundleIdentifier "
                f"{observed_bundle_id!r}, expected {bundle_id!r}"
            ),
            "observedBundleId": observed_bundle_id,
        }

    return {
        "match": True,
        "classification": "matched_app",
        "reason": "Host PID executable path and Info.plist CFBundleIdentifier match expected simulator app",
        "observedBundleId": observed_bundle_id,
    }


def find_matching_simulator_app_processes(
    expected_binary_path: str,
    udid: str,
) -> dict[str, Any]:
    """Scan host process table for any process running this simulator's installed app binary."""
    try:
        proc = run_cmd(
            ["ps", "-axo", "pid=,ppid=,stat=,etime=,comm="],
            timeout=15,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {
            "status": "unavailable",
            "error": str(exc),
            "matches": [],
        }

    if proc.returncode != 0:
        return {
            "status": "unavailable",
            "error": f"ps -axo exited {proc.returncode}: {(proc.stderr or '').strip()}",
            "matches": [],
        }

    expected_norm = _normalize_exec_path(expected_binary_path)
    matches: list[dict[str, Any]] = []
    for line in proc.stdout.splitlines():
        parsed = parse_ps_line(line)
        if parsed is None:
            continue
        comm_norm = _normalize_exec_path(parsed["comm"])
        if comm_norm == expected_norm or (
            udid and udid in comm_norm and comm_norm.endswith("/App.app/App")
        ):
            matches.append(parsed)
    return {
        "status": "ok",
        "matches": matches,
    }


def validate_screenshot_file(
    shot_path: Path,
    *,
    min_mtime: float,
    min_bytes: int = 1024,
) -> dict[str, Any]:
    """Validate that a screenshot file exists, is freshly written, non-trivial, and a valid PNG."""
    if not shot_path.is_file():
        raise RuntimeError(f"Screenshot missing after capture: {shot_path}")
    st = shot_path.stat()
    if st.st_size < min_bytes:
        raise RuntimeError(
            f"Screenshot unexpectedly small ({st.st_size} bytes < {min_bytes}): {shot_path}"
        )
    if st.st_mtime < min_mtime - 1.0:
        raise RuntimeError(
            f"Screenshot appears stale (mtime {st.st_mtime:.3f} predates capture start "
            f"{min_mtime:.3f}): {shot_path}"
        )
    raw = shot_path.read_bytes()
    if len(raw) < 24 or raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise RuntimeError(f"Screenshot does not contain a valid PNG header: {shot_path}")
    width, height = struct.unpack(">II", raw[16:24])
    if width == 0 or height == 0:
        raise RuntimeError(f"Screenshot PNG has zero dimensions ({width}x{height}): {shot_path}")
    return {
        "path": str(shot_path),
        "bytes": st.st_size,
        "mtime": st.st_mtime,
        "width": width,
        "height": height,
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def capture_fresh_screenshot(
    udid: str,
    shot_path: Path,
    *,
    step_timings: list[dict[str, Any]] | None = None,
    step_name: str = "simctl_screenshot",
    timeout: int = 30,
    retries: int = 1,
) -> dict[str, Any]:
    """Remove any stale file, capture a fresh simulator screenshot, and validate PNG/freshness."""
    if shot_path.exists():
        shot_path.unlink()
    capture_started_epoch = time.time()
    run_simctl_with_retry(
        ["xcrun", "simctl", "io", udid, "screenshot", str(shot_path)],
        timeout=timeout,
        retries=retries,
        step_timings=step_timings,
        step_name=step_name,
    )
    return validate_screenshot_file(shot_path, min_mtime=capture_started_epoch)


def _is_no_such_process_error(exc: subprocess.CalledProcessError) -> bool:
    combined = f"{exc.stderr or ''}\n{exc.stdout or ''}".lower()
    return exc.returncode == 3 or "no such process" in combined


def verify_termination_postconditions(
    *,
    udid: str,
    bundle_id: str,
    expected_pid: int,
    expected_binary_path: str,
    run_start_epoch: float,
    expected_ppid: int | None = None,
    poll_window_s: float = 3.0,
    poll_interval_s: float = 0.5,
) -> dict[str, Any]:
    """
    Evaluate affirmative postconditions after `simctl terminate`:
    - zero new matching app crash reports
    - expected PID absent (distinguished from PID reuse / wrong identity / unavailable ps)
    - zero remaining host processes matching this simulator's installed app binary
    - simulator device still confirmed 'Booted'
    """
    deadline = time.monotonic() + max(0.0, poll_window_s)
    max_polls = max(1, int(poll_window_s / poll_interval_s) + 1) if poll_interval_s > 0 else 1
    poll_count = 0
    last_result: dict[str, Any] = {
        "conclusive": False,
        "verdict": "identity_unavailable",
        "expectedPid": expected_pid,
        "reason": "postcondition check did not run",
    }

    while True:
        poll_count += 1
        crashes = find_new_app_crashes(run_start_epoch)
        if crashes:
            return {
                "conclusive": False,
                "verdict": "app_crashed",
                "expectedPid": expected_pid,
                "crashes": crashes,
                "reason": f"Detected new app crash reports during termination: {crashes}",
            }

        proc_info = inspect_host_process(expected_pid)
        status = proc_info["status"]
        if status == "unavailable":
            return {
                "conclusive": False,
                "verdict": "identity_unavailable",
                "expectedPid": expected_pid,
                "psInfo": proc_info,
                "reason": str(proc_info.get("error") or "host ps unavailable"),
            }

        if status in {"alive", "zombie"}:
            identity = classify_process_identity(
                proc_info,
                udid=udid,
                bundle_id=bundle_id,
                expected_binary_path=expected_binary_path,
                expected_ppid=expected_ppid,
            )
            if identity["classification"] in {"pid_reused_or_wrong_identity", "wrong_bundle_id"}:
                return {
                    "conclusive": False,
                    "verdict": "pid_reused_or_wrong_identity",
                    "expectedPid": expected_pid,
                    "psInfo": proc_info,
                    "identity": identity,
                    "reason": identity["reason"],
                }
            if identity["classification"] == "identity_unavailable":
                return {
                    "conclusive": False,
                    "verdict": "identity_unavailable",
                    "expectedPid": expected_pid,
                    "psInfo": proc_info,
                    "identity": identity,
                    "reason": identity["reason"],
                }
            last_result = {
                "conclusive": False,
                "verdict": "app_still_running",
                "expectedPid": expected_pid,
                "psInfo": proc_info,
                "identity": identity,
                "reason": f"Expected app PID {expected_pid} is still {status}",
            }
            if poll_count < max_polls and time.monotonic() < deadline:
                time.sleep(poll_interval_s)
                continue
            return last_result

        # Expected PID is absent on host; confirm no other instance of this simulator's app exists.
        scan = find_matching_simulator_app_processes(expected_binary_path, udid)
        if scan["status"] != "ok":
            return {
                "conclusive": False,
                "verdict": "identity_unavailable",
                "expectedPid": expected_pid,
                "pidStatus": "absent",
                "scanError": scan.get("error"),
                "reason": f"Could not scan host process table for remaining app processes: {scan.get('error')}",
            }
        if scan["matches"]:
            remaining_pids = [m["pid"] for m in scan["matches"]]
            last_result = {
                "conclusive": False,
                "verdict": "app_still_running",
                "expectedPid": expected_pid,
                "pidStatus": "absent",
                "remainingMatchingPids": remaining_pids,
                "reason": f"Another process for {expected_binary_path} is still running: {remaining_pids}",
            }
            if poll_count < max_polls and time.monotonic() < deadline:
                time.sleep(poll_interval_s)
                continue
            return last_result

        sim_state = get_simulator_state(udid)
        if sim_state != "Booted":
            return {
                "conclusive": False,
                "verdict": "simulator_state_unavailable_or_not_booted",
                "expectedPid": expected_pid,
                "pidStatus": "absent",
                "remainingMatchingPids": [],
                "simulatorState": sim_state,
                "reason": f"Simulator {udid} state is {sim_state!r}, expected 'Booted'",
            }

        crashes_after = find_new_app_crashes(run_start_epoch)
        if crashes_after:
            return {
                "conclusive": False,
                "verdict": "app_crashed",
                "expectedPid": expected_pid,
                "crashes": crashes_after,
                "reason": f"Detected new app crash reports during termination: {crashes_after}",
            }

        return {
            "conclusive": True,
            "verdict": "conclusively_stopped",
            "expectedPid": expected_pid,
            "pidStatus": "absent",
            "remainingMatchingPids": [],
            "simulatorState": sim_state,
            "newAppCrashReports": [],
            "reason": "Expected PID absent, zero matching simulator app processes running, simulator Booted, no crashes",
        }


def terminate_app_with_postconditions(
    *,
    udid: str,
    bundle_id: str,
    expected_pid: int,
    expected_binary_path: str,
    run_start_epoch: float,
    expected_ppid: int | None = None,
    timeout: int = 30,
    retries: int = 1,
    retry_delay_s: float = 3.0,
    step_timings: list[dict[str, Any]] | None = None,
    step_name: str = "simctl_terminate",
    postcondition_resolutions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Terminate the running app with bounded retries and affirmative postcondition checks.

    Never classifies a live, crashed, PID-reused, or identity-unavailable state as success.
    """
    last_exc: Exception | None = None
    last_post: dict[str, Any] | None = None
    had_ambiguous_attempt = False

    for attempt in range(1 + retries):
        try:
            run_cmd(
                ["xcrun", "simctl", "terminate", udid, bundle_id],
                timeout=timeout,
                check=True,
                step_timings=step_timings,
                step_name=step_name,
            )
        except subprocess.TimeoutExpired as exc:
            last_exc = exc
            had_ambiguous_attempt = True
            post = verify_termination_postconditions(
                udid=udid,
                bundle_id=bundle_id,
                expected_pid=expected_pid,
                expected_binary_path=expected_binary_path,
                expected_ppid=expected_ppid,
                run_start_epoch=run_start_epoch,
            )
            last_post = post
            if post["verdict"] == "app_crashed":
                raise RuntimeError(post["reason"]) from exc
            if post["conclusive"]:
                resolution = {
                    "step": step_name,
                    "attempt": attempt + 1,
                    "originalError": str(exc),
                    "verdict": post["verdict"],
                    "postcondition": post,
                }
                if postcondition_resolutions is not None:
                    postcondition_resolutions.append(resolution)
                print(
                    f"Postcondition verified {step_name} after timeout on attempt {attempt + 1}/{1 + retries}: "
                    f"PID {expected_pid} conclusively stopped with simulator Booted and no crashes.",
                    file=sys.stderr,
                    flush=True,
                )
                return {
                    "method": "postcondition_verified_after_ambiguous_terminate",
                    "attempt": attempt + 1,
                    "originalError": str(exc),
                    "postcondition": post,
                }
            if attempt < retries:
                print(
                    f"Ambiguous {step_name} timeout on attempt {attempt + 1}/{1 + retries} "
                    f"(postcondition={post['verdict']}: {post.get('reason', '')}); "
                    f"retrying in {retry_delay_s}s...",
                    file=sys.stderr,
                    flush=True,
                )
                time.sleep(retry_delay_s)
            continue
        except subprocess.CalledProcessError as exc:
            is_retry_esrch = had_ambiguous_attempt and _is_no_such_process_error(exc)
            if not is_retry_esrch and not is_transient_simctl_error(exc):
                raise
            last_exc = exc
            had_ambiguous_attempt = True
            post = verify_termination_postconditions(
                udid=udid,
                bundle_id=bundle_id,
                expected_pid=expected_pid,
                expected_binary_path=expected_binary_path,
                expected_ppid=expected_ppid,
                run_start_epoch=run_start_epoch,
            )
            last_post = post
            if post["verdict"] == "app_crashed":
                raise RuntimeError(post["reason"]) from exc
            if post["conclusive"]:
                resolution = {
                    "step": step_name,
                    "attempt": attempt + 1,
                    "originalError": str(exc),
                    "verdict": post["verdict"],
                    "postcondition": post,
                }
                if postcondition_resolutions is not None:
                    postcondition_resolutions.append(resolution)
                print(
                    f"Postcondition verified {step_name} after ambiguous exit on attempt {attempt + 1}/{1 + retries}: "
                    f"PID {expected_pid} conclusively stopped with simulator Booted and no crashes.",
                    file=sys.stderr,
                    flush=True,
                )
                return {
                    "method": "postcondition_verified_after_ambiguous_terminate",
                    "attempt": attempt + 1,
                    "originalError": str(exc),
                    "postcondition": post,
                }
            if attempt < retries:
                print(
                    f"Ambiguous {step_name} failure on attempt {attempt + 1}/{1 + retries} "
                    f"(postcondition={post['verdict']}: {post.get('reason', '')}); "
                    f"retrying in {retry_delay_s}s...",
                    file=sys.stderr,
                    flush=True,
                )
                time.sleep(retry_delay_s)
            continue

        # simctl terminate exited 0; still verify postconditions (stopped, not crashed, not reused/ambiguous).
        time.sleep(1)
        post = verify_termination_postconditions(
            udid=udid,
            bundle_id=bundle_id,
            expected_pid=expected_pid,
            expected_binary_path=expected_binary_path,
            expected_ppid=expected_ppid,
            run_start_epoch=run_start_epoch,
        )
        if post["verdict"] == "app_crashed":
            raise RuntimeError(post["reason"])
        if post["conclusive"]:
            return {
                "method": "simctl_terminate_ok",
                "attempt": attempt + 1,
                "postcondition": post,
            }
        if post["verdict"] == "app_still_running":
            raise RuntimeError(
                f"Process {expected_pid} still running after {step_name}: {post.get('reason', '')}"
            )
        raise RuntimeError(
            f"Could not verify process {expected_pid} stopped cleanly after {step_name} "
            f"({post['verdict']}): {post.get('reason', '')}"
        )

    verdict = last_post["verdict"] if last_post else "unknown"
    reason = last_post.get("reason", "") if last_post else ""
    raise SimulatorInfrastructureError(
        f"{step_name} failed after {1 + retries} attempt(s) "
        f"(postcondition={verdict}; {reason}): {last_exc}"
    ) from last_exc


def verify_pid_alive(
    udid: str,
    bundle_id: str,
    pid: int,
    evidence_file: Path,
    *,
    step_timings: list[dict[str, Any]] | None = None,
    expected_binary_path: str | None = None,
    screenshot_path: Path | None = None,
    screenshot_step_name: str = "simctl_screenshot",
    run_start_epoch: float | None = None,
    postcondition_resolutions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    initial_ps = inspect_host_process(pid)
    if initial_ps["status"] == "absent":
        evidence_file.write_text(
            f"ps_exit={initial_ps['returncode']}\n"
            f"ps_output={initial_ps['raw']}\n"
            "launchctl_matches:\n(skipped because host ps reported process absent)\n",
            encoding="utf-8",
        )
        raise RuntimeError(f"App process PID {pid} did not remain alive.")
    if initial_ps["status"] == "unavailable":
        evidence_file.write_text(
            f"ps_exit={initial_ps['returncode']}\n"
            f"ps_output={initial_ps['raw']}\n"
            f"ps_error={initial_ps.get('error', '')}\n"
            "launchctl_matches:\n(skipped because host ps identity was unavailable)\n",
            encoding="utf-8",
        )
        raise RuntimeError(
            f"Host process identity unavailable for PID {pid}: {initial_ps.get('error', '')}"
        )
    if initial_ps["status"] == "zombie":
        evidence_file.write_text(
            f"ps_exit={initial_ps['returncode']}\n"
            f"ps_output={initial_ps['raw']}\n"
            "launchctl_matches:\n(skipped because host process is zombie)\n",
            encoding="utf-8",
        )
        raise RuntimeError(f"App process PID {pid} is in zombie state ({initial_ps['stat']}).")

    initial_identity: dict[str, Any] | None = None
    if expected_binary_path is not None:
        initial_identity = classify_process_identity(
            initial_ps,
            udid=udid,
            bundle_id=bundle_id,
            expected_binary_path=expected_binary_path,
        )
        if not initial_identity["match"]:
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                f"identity_classification={initial_identity['classification']}\n"
                f"identity_reason={initial_identity['reason']}\n"
                "launchctl_matches:\n(skipped because host process identity check failed)\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"Host process identity verification failed for PID {pid} "
                f"({initial_identity['classification']}): {initial_identity['reason']}"
            )

    if run_start_epoch is not None:
        crashes = find_new_app_crashes(run_start_epoch)
        if crashes:
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                f"new_app_crashes={crashes}\n",
                encoding="utf-8",
            )
            raise RuntimeError(f"Detected new app crash reports while verifying PID {pid}: {crashes}")

    try:
        launchctl_proc = run_simctl_with_retry(
            ["xcrun", "simctl", "spawn", udid, "launchctl", "list"],
            timeout=30,
            retries=1,
            step_timings=step_timings,
            step_name="simctl_verify_pid_launchctl",
        )
    except SimulatorInfrastructureError as exc:
        if run_start_epoch is not None:
            crashes_during_stall = find_new_app_crashes(run_start_epoch)
            if crashes_during_stall:
                evidence_file.write_text(
                    f"ps_exit={initial_ps['returncode']}\n"
                    f"ps_output={initial_ps['raw']}\n"
                    "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                    f"new_app_crashes={crashes_during_stall}\n",
                    encoding="utf-8",
                )
                raise RuntimeError(
                    f"Detected new app crash reports during launchctl stall for PID {pid}: "
                    f"{crashes_during_stall}"
                ) from exc

        recheck_ps = inspect_host_process(pid)
        if recheck_ps["status"] == "unavailable":
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                f"ps_recheck_error={recheck_ps.get('error', '')}\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"Could not revalidate app process PID {pid} after simulator launchctl failure: {exc}"
            ) from exc

        if recheck_ps["status"] == "absent":
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                f"ps_recheck_exit={recheck_ps['returncode']}\n"
                f"ps_recheck_output={recheck_ps['raw']}\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"App process PID {pid} exited while simulator launchctl verification was unavailable."
            ) from exc

        if recheck_ps["status"] == "zombie":
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                f"ps_recheck_exit={recheck_ps['returncode']}\n"
                f"ps_recheck_output={recheck_ps['raw']}\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"App process PID {pid} became zombie while simulator launchctl verification was unavailable."
            ) from exc

        if recheck_ps["ppid"] != initial_ps["ppid"]:
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                f"ps_recheck_output={recheck_ps['raw']}\n"
                f"identity_reason=ppid changed from {initial_ps['ppid']} to {recheck_ps['ppid']}\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"App process PID {pid} parent PID changed during launchctl stall "
                f"({initial_ps['ppid']} -> {recheck_ps['ppid']})."
            ) from exc

        # Fallback requires full independent positive proof: verified container binary + Info.plist
        # bundle ID, Booted simulator state, fresh current-launch screenshot, post-screenshot PID
        # continuity, and crash absence. Without all inputs, fail closed as infrastructure error.
        if expected_binary_path is None or screenshot_path is None or run_start_epoch is None:
            raise

        recheck_identity = classify_process_identity(
            recheck_ps,
            udid=udid,
            bundle_id=bundle_id,
            expected_binary_path=expected_binary_path,
            expected_ppid=initial_ps["ppid"],
        )
        if not recheck_identity["match"]:
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                f"ps_recheck_output={recheck_ps['raw']}\n"
                f"identity_classification={recheck_identity['classification']}\n"
                f"identity_reason={recheck_identity['reason']}\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"Post-stall host process identity verification failed for PID {pid} "
                f"({recheck_identity['classification']}): {recheck_identity['reason']}"
            ) from exc

        sim_state = get_simulator_state(udid)
        if sim_state != "Booted":
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                f"ps_recheck_output={recheck_ps['raw']}\n"
                f"simulator_state={sim_state!r}\n",
                encoding="utf-8",
            )
            raise SimulatorInfrastructureError(
                f"Simulator launchctl query stalled and device {udid} state is {sim_state!r} "
                f"(expected 'Booted'): {exc}"
            ) from exc

        # Capture fresh current-launch render evidence; stalls or stale screenshots raise and fail.
        shot_meta = capture_fresh_screenshot(
            udid,
            screenshot_path,
            step_timings=step_timings,
            step_name=screenshot_step_name,
        )

        # Bracket recheck: confirm exact same app process is still alive after screenshot capture
        # and no app crash reports appeared.
        post_shot_ps = inspect_host_process(pid)
        if post_shot_ps["status"] != "alive":
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                f"ps_recheck_output={recheck_ps['raw']}\n"
                f"ps_post_screenshot_status={post_shot_ps['status']}\n"
                f"ps_post_screenshot_output={post_shot_ps['raw']}\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"App process PID {pid} did not remain alive after fallback screenshot capture "
                f"(status={post_shot_ps['status']})."
            ) from exc

        post_shot_identity = classify_process_identity(
            post_shot_ps,
            udid=udid,
            bundle_id=bundle_id,
            expected_binary_path=expected_binary_path,
            expected_ppid=initial_ps["ppid"],
        )
        if not post_shot_identity["match"]:
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                f"ps_post_screenshot_output={post_shot_ps['raw']}\n"
                f"identity_classification={post_shot_identity['classification']}\n"
                f"identity_reason={post_shot_identity['reason']}\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"Post-screenshot host process identity failed for PID {pid} "
                f"({post_shot_identity['classification']}): {post_shot_identity['reason']}"
            ) from exc

        post_shot_crashes = find_new_app_crashes(run_start_epoch)
        if post_shot_crashes:
            evidence_file.write_text(
                f"ps_exit={initial_ps['returncode']}\n"
                f"ps_output={initial_ps['raw']}\n"
                "launchctl_matches:\n(unavailable: simulator query timed out)\n"
                f"new_app_crashes={post_shot_crashes}\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"Detected new app crash reports after fallback screenshot for PID {pid}: "
                f"{post_shot_crashes}"
            ) from exc

        evidence_file.write_text(
            f"verification_mode=launchctl_stall_independent_fallback\n"
            f"ps_exit={initial_ps['returncode']}\n"
            f"ps_output={initial_ps['raw']}\n"
            f"ps_recheck_output={recheck_ps['raw']}\n"
            f"ps_post_screenshot_output={post_shot_ps['raw']}\n"
            f"bundle_id_verified={recheck_identity['observedBundleId']}\n"
            f"simulator_state={sim_state}\n"
            f"screenshot_bytes={shot_meta['bytes']}\n"
            f"screenshot_dimensions={shot_meta['width']}x{shot_meta['height']}\n"
            f"screenshot_sha256={shot_meta['sha256']}\n"
            f"new_app_crashes=[]\n"
            f"launchctl_error={exc}\n"
            "launchctl_matches:\n(unavailable: verified via independent fallback)\n",
            encoding="utf-8",
        )
        resolution = {
            "step": "verify_pid_alive",
            "originalError": str(exc),
            "verdict": "independent_fallback_verified",
            "pid": pid,
            "ppid": initial_ps["ppid"],
            "bundleIdVerified": recheck_identity["observedBundleId"],
            "simulatorState": sim_state,
            "screenshot": shot_meta,
            "newAppCrashReports": [],
        }
        if postcondition_resolutions is not None:
            postcondition_resolutions.append(resolution)
        print(
            f"Verified PID {pid} ({bundle_id}) via independent fallback after launchctl stall: "
            f"identity={recheck_identity['observedBundleId']}, state={sim_state}, "
            f"screenshot={shot_meta['width']}x{shot_meta['height']} ({shot_meta['bytes']}B), crashes=0.",
            file=sys.stderr,
            flush=True,
        )
        return {
            "mode": "launchctl_stall_independent_fallback",
            "pid": pid,
            "ppid": initial_ps["ppid"],
            "screenshot": shot_meta,
        }

    matching_launchctl = [
        line
        for line in launchctl_proc.stdout.splitlines()
        if bundle_id in line or str(pid) in line.split()[:1]
    ]
    evidence_file.write_text(
        f"verification_mode=launchctl_primary\n"
        f"ps_exit={initial_ps['returncode']}\n"
        f"ps_output={initial_ps['raw']}\n"
        f"launchctl_matches:\n" + "\n".join(matching_launchctl) + "\n",
        encoding="utf-8",
    )
    if not any(bundle_id in line and line.strip().startswith(str(pid)) for line in matching_launchctl):
        raise RuntimeError(
            f"Simulator launchctl does not show PID {pid} active for {bundle_id}: {matching_launchctl}"
        )

    result: dict[str, Any] = {
        "mode": "launchctl_primary",
        "pid": pid,
        "ppid": initial_ps["ppid"],
    }
    if screenshot_path is not None:
        result["screenshot"] = capture_fresh_screenshot(
            udid,
            screenshot_path,
            step_timings=step_timings,
            step_name=screenshot_step_name,
        )
    return result


def capture_scoped_logs(udid: str, start_time: str, out_file: Path) -> str:
    predicate = (
        'process == "App" OR subsystem CONTAINS "capacitor" '
        'OR eventMessage CONTAINS[c] "com.example.bibleberry.r20poc"'
    )
    try:
        proc = run_cmd(
            [
                "xcrun",
                "simctl",
                "spawn",
                udid,
                "log",
                "show",
                "--start",
                start_time,
                "--style",
                "compact",
                "--predicate",
                predicate,
            ],
            timeout=30,
            check=False,
        )
        content = proc.stdout or proc.stderr or ""
    except (subprocess.TimeoutExpired, OSError) as exc:
        content = f"[capture_scoped_logs failed: {exc}]\n"
    out_file.write_text(content, encoding="utf-8")
    return content


def find_probe_marker_assets(app_path: Path, marker: str) -> list[str]:
    assets_dir = app_path / "public" / "assets"
    if not assets_dir.is_dir():
        return []
    return [
        str(asset.relative_to(app_path))
        for asset in sorted(assets_dir.glob("*.js"))
        if marker in asset.read_text(encoding="utf-8", errors="replace")
    ]


def capture_console_pty_launch(
    udid: str,
    bundle_id: str,
    out_file: Path,
    duration_s: float = 60.0,
    ready_patterns: tuple[str, ...] = (r"To Native ->\s+Preferences\s+get\b",),
    observed_patterns: dict[str, float] | None = None,
    previous_pid: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    master_fd, slave_fd = pty.openpty()
    chunks: list[bytes] = []
    proc = subprocess.Popen(
        ["xcrun", "simctl", "launch", "--console-pty", udid, bundle_id],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True,
    )
    os.close(slave_fd)
    capture_started = time.monotonic()
    deadline = capture_started + duration_s
    seen_ready_deadline: float | None = None
    launched_pid: int | None = None
    reused_running_process = False
    try:
        while time.monotonic() < deadline:
            if seen_ready_deadline is not None and time.monotonic() >= seen_ready_deadline:
                break
            ready, _, _ = select.select([master_fd], [], [], 0.25)
            if ready:
                try:
                    data = os.read(master_fd, 4096)
                except OSError:
                    time.sleep(0.1)
                    continue
                if not data:
                    time.sleep(0.1)
                    continue
                chunks.append(data)
                current_text = b"".join(chunks).decode("utf-8", errors="replace")
                if launched_pid is None:
                    launched_pid = try_parse_simctl_launch_pid(current_text, bundle_id)
                    if previous_pid is not None and launched_pid == previous_pid:
                        reused_running_process = True
                        seen_ready_deadline = min(deadline, time.monotonic() + 1.0)
                if observed_patterns is not None:
                    elapsed = round(time.monotonic() - capture_started, 2)
                    for pattern in ready_patterns:
                        if pattern not in observed_patterns and re.search(pattern, current_text):
                            observed_patterns[pattern] = elapsed
                if seen_ready_deadline is None:
                    if all(re.search(pattern, current_text) for pattern in ready_patterns):
                        seen_ready_deadline = min(deadline, time.monotonic() + 0.5)
        run_cmd_best_effort(["xcrun", "simctl", "terminate", udid, bundle_id], timeout=30)
        drain_deadline = time.monotonic() + 2.0
        while time.monotonic() < drain_deadline:
            ready, _, _ = select.select([master_fd], [], [], 0.1)
            if not ready:
                if proc.poll() is not None:
                    break
                continue
            try:
                data = os.read(master_fd, 4096)
            except OSError:
                break
            if not data:
                break
            chunks.append(data)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        os.close(master_fd)
    text = b"".join(chunks).decode("utf-8", errors="replace")
    if launched_pid is None:
        launched_pid = try_parse_simctl_launch_pid(text, bundle_id)
        if previous_pid is not None and launched_pid == previous_pid:
            reused_running_process = True
    is_valid_pid = (
        isinstance(launched_pid, int)
        and not isinstance(launched_pid, bool)
        and launched_pid > 0
    )
    if metadata is not None:
        metadata.update(
            {
                "previousPid": previous_pid,
                "launchedPid": launched_pid if is_valid_pid else None,
                "freshProcessLaunched": is_valid_pid
                and (previous_pid is None or launched_pid != previous_pid),
                "reusedRunningProcess": reused_running_process,
                "captureDurationSeconds": round(time.monotonic() - capture_started, 2),
                "processExitCode": proc.poll(),
            }
        )
    out_file.write_text(text, encoding="utf-8")
    return text


def find_new_app_crashes(since_epoch: float) -> list[str]:
    diag_dir = Path.home() / "Library" / "Logs" / "DiagnosticReports"
    if not diag_dir.is_dir():
        return []
    crashes: list[str] = []
    for entry in sorted(diag_dir.iterdir()):
        if not entry.is_file():
            continue
        if entry.suffix not in {".ips", ".crash"}:
            continue
        if entry.stat().st_mtime < since_epoch - 1.0:
            continue
        name = entry.name
        if name.startswith("App-") or name.startswith("App_") or "bibleberry" in name.lower():
            crashes.append(name)
    return crashes


def _run_smoke_attempt(
    *,
    args: argparse.Namespace,
    app_path: Path,
    evidence_dir: Path,
    udid: str,
    summary: dict[str, Any],
    step_timings: list[dict[str, Any]],
    run_start_epoch: float,
) -> None:
    run_simctl_with_retry(
        ["xcrun", "simctl", "boot", udid],
        timeout=90,
        retries=0,
        step_timings=step_timings,
        step_name="simctl_boot",
    )
    run_simctl_with_retry(
        ["xcrun", "simctl", "bootstatus", udid, "-b"],
        timeout=240,
        retries=0,
        step_timings=step_timings,
        step_name="simctl_bootstatus",
    )
    summary["readiness"] = wait_for_simulator_ready(
        udid,
        timeout_s=args.ready_timeout,
        step_timings=step_timings,
    )

    if args.lifecycle_probe_only:
        probe_marker = "[native-lifecycle-probe] JavaScript probe enabled"
        marker_assets = find_probe_marker_assets(app_path, probe_marker)
        summary["lifecycleProbeBundle"] = {
            "probeMarker": probe_marker,
            "javascriptAssetsWithMarker": marker_assets,
        }
        if not marker_assets:
            raise RuntimeError(
                "Probe-enabled JavaScript marker is missing from the installed app bundle."
            )
        run_simctl_with_retry(
            ["xcrun", "simctl", "install", udid, str(app_path)],
            timeout=120,
            retries=1,
            step_timings=step_timings,
            step_name="simctl_install",
        )
        probe_started_at = datetime.now(timezone.utc)
        probe_started_monotonic = time.monotonic()
        readiness_times: dict[str, float] = {}
        readiness_patterns = (
            r"\[native-lifecycle-probe\] JavaScript probe enabled",
            r"WebView loaded",
            r"To Native ->\s+Preferences\s+get\b",
            r"To Native ->\s+App\s+addListener\b",
            r"To Native ->\s+App\s+getState\b",
        )
        probe_log = capture_console_pty_launch(
            udid,
            args.bundle_id,
            evidence_dir / "01-lifecycle-probe-console-pty.log",
            duration_s=60.0,
            ready_patterns=readiness_patterns,
            observed_patterns=readiness_times,
        )
        probe_duration = round(time.monotonic() - probe_started_monotonic, 2)
        probe_observations = {
            "captureDurationSeconds": probe_duration,
            "readinessAfterSeconds": readiness_times,
            "javascriptProbeMarkerObserved": bool(
                re.search(readiness_patterns[0], probe_log)
            ),
            "webViewLoadedObserved": bool(re.search(readiness_patterns[1], probe_log)),
            "nativePreferencesGetObserved": bool(re.search(readiness_patterns[2], probe_log)),
            "nativeAppAddListenerObserved": bool(re.search(readiness_patterns[3], probe_log)),
            "nativeAppGetStateObserved": bool(re.search(readiness_patterns[4], probe_log)),
        }
        summary["lifecycleProbe"] = probe_observations
        all_probe_calls_observed = all(
            probe_observations[key]
            for key in (
                "javascriptProbeMarkerObserved",
                "webViewLoadedObserved",
                "nativePreferencesGetObserved",
                "nativeAppAddListenerObserved",
                "nativeAppGetStateObserved",
            )
        )
        if not all_probe_calls_observed:
            capture_scoped_logs(
                udid,
                probe_started_at.strftime("%Y-%m-%d %H:%M:%S"),
                evidence_dir / "02-lifecycle-probe-simulator-logs.txt",
            )
            run_cmd_best_effort(
                [
                    "xcrun",
                    "simctl",
                    "io",
                    udid,
                    "screenshot",
                    str(evidence_dir / "03-lifecycle-probe-screenshot.png"),
                ],
                timeout=30,
                step_timings=step_timings,
                step_name="lifecycle_probe_screenshot",
            )
        if "App.then" in probe_log:
            raise RuntimeError("Detected Capacitor App.then() Proxy trap in simulator probe PTY log.")
        if "Preferences.then" in probe_log:
            raise RuntimeError("Detected Capacitor Preferences.then() Proxy trap in simulator probe PTY log.")
        if not probe_observations["javascriptProbeMarkerObserved"]:
            raise RuntimeError(
                "Probe-enabled JavaScript did not report execution within "
                f"{probe_duration}s; see lifecycle probe evidence."
            )
        if not probe_observations["webViewLoadedObserved"]:
            raise RuntimeError(
                "Capacitor WebView did not report a completed page load within "
                f"{probe_duration}s; see lifecycle probe evidence."
            )
        if not re.search(r"To Native ->\s+App\s+addListener\b", probe_log):
            raise RuntimeError(
                "Expected native Capacitor App.addListener bridge call in 01-lifecycle-probe-console-pty.log."
            )
        if not re.search(r"To Native ->\s+App\s+getState\b", probe_log):
            raise RuntimeError(
                "Expected native Capacitor App.getState bridge call in 01-lifecycle-probe-console-pty.log."
            )
        if not re.search(r"To Native ->\s+Preferences\s+get\b", probe_log):
            raise RuntimeError(
                "Expected native Capacitor Preferences.get bridge call in 01-lifecycle-probe-console-pty.log."
            )
        crashes = find_new_app_crashes(run_start_epoch)
        summary["newAppCrashReports"] = crashes
        if crashes:
            raise RuntimeError(f"Detected new crash reports during lifecycle probe: {crashes}")
        return

    # ------------------------------------------------------------------
    # Phase 1: Deliverable A — simctl install, launch, terminate, relaunch
    # ------------------------------------------------------------------
    postcondition_resolutions: list[dict[str, Any]] = summary.setdefault(
        "postconditionResolutions", []
    )
    run_simctl_with_retry(
        ["xcrun", "simctl", "install", udid, str(app_path)],
        timeout=120,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_install",
    )
    container1 = run_simctl_with_retry(
        ["xcrun", "simctl", "get_app_container", udid, args.bundle_id, "app"],
        timeout=45,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_get_app_container_1",
    ).stdout.strip()
    if not container1:
        raise RuntimeError(f"simctl get_app_container returned an empty path for {args.bundle_id}.")
    summary["installedContainer"] = container1
    expected_binary_path_1 = str(Path(container1) / "App")

    launch1_stdout = evidence_dir / "01-simctl-launch-stdout.log"
    launch1_stderr = evidence_dir / "01-simctl-launch-stderr.log"
    t0 = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    launch1 = run_simctl_with_retry(
        [
            "xcrun",
            "simctl",
            "launch",
            f"--stdout={launch1_stdout}",
            f"--stderr={launch1_stderr}",
            udid,
            args.bundle_id,
        ],
        timeout=60,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_launch_1",
    )
    pid1 = parse_simctl_launch_pid(launch1.stdout, args.bundle_id)
    time.sleep(8)
    shot1 = evidence_dir / "01-simctl-launch.png"
    verify1 = (
        verify_pid_alive(
            udid,
            args.bundle_id,
            pid1,
            evidence_dir / "01-launch-process.txt",
            step_timings=step_timings,
            expected_binary_path=expected_binary_path_1,
            screenshot_path=shot1,
            screenshot_step_name="simctl_screenshot_1",
            run_start_epoch=run_start_epoch,
            postcondition_resolutions=postcondition_resolutions,
        )
        or {}
    )
    capture_scoped_logs(udid, t0, evidence_dir / "01-simctl-launch-logs.txt")

    # Terminate without uninstalling, using postcondition-verified handling for ambiguous outcomes.
    term1_res = terminate_app_with_postconditions(
        udid=udid,
        bundle_id=args.bundle_id,
        expected_pid=pid1,
        expected_binary_path=expected_binary_path_1,
        expected_ppid=verify1.get("ppid"),
        run_start_epoch=run_start_epoch,
        timeout=30,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_terminate_1",
        postcondition_resolutions=postcondition_resolutions,
    )
    # Prove app remains installed without uninstall/reinstall
    container2 = run_simctl_with_retry(
        ["xcrun", "simctl", "get_app_container", udid, args.bundle_id, "app"],
        timeout=45,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_get_app_container_2",
    ).stdout.strip()
    if not container2:
        raise RuntimeError(
            f"simctl get_app_container returned an empty path after terminate for {args.bundle_id}."
        )
    expected_binary_path_2 = str(Path(container2) / "App")

    # Relaunch without reinstalling
    launch2_stdout = evidence_dir / "02-simctl-relaunch-stdout.log"
    launch2_stderr = evidence_dir / "02-simctl-relaunch-stderr.log"
    t1 = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    launch2 = run_simctl_with_retry(
        [
            "xcrun",
            "simctl",
            "launch",
            f"--stdout={launch2_stdout}",
            f"--stderr={launch2_stderr}",
            udid,
            args.bundle_id,
        ],
        timeout=60,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_launch_2",
    )
    pid2 = parse_simctl_launch_pid(launch2.stdout, args.bundle_id)
    if pid2 == pid1:
        raise RuntimeError(f"Relaunch returned identical PID {pid2}; expected fresh process.")
    time.sleep(5)
    shot2 = evidence_dir / "02-simctl-relaunch.png"
    verify2 = (
        verify_pid_alive(
            udid,
            args.bundle_id,
            pid2,
            evidence_dir / "02-relaunch-process.txt",
            step_timings=step_timings,
            expected_binary_path=expected_binary_path_2,
            screenshot_path=shot2,
            screenshot_step_name="simctl_screenshot_2",
            run_start_epoch=run_start_epoch,
            postcondition_resolutions=postcondition_resolutions,
        )
        or {}
    )
    capture_scoped_logs(udid, t1, evidence_dir / "02-simctl-relaunch-logs.txt")

    summary["simctlPhase"] = {
        "initialPid": pid1,
        "relaunchPid": pid2,
        "initialVerificationMode": verify1.get("mode", "launchctl_primary"),
        "relaunchVerificationMode": verify2.get("mode", "launchctl_primary"),
        "terminate1Method": term1_res["method"],
        "initialScreenshotBytes": shot1.stat().st_size,
        "relaunchScreenshotBytes": shot2.stat().st_size,
    }

    if args.simctl_only:
        crashes = find_new_app_crashes(run_start_epoch)
        summary["newAppCrashReports"] = crashes
        if crashes:
            raise RuntimeError(f"Detected new crash reports during simctl-only run: {crashes}")
        return

    # Ensure pid2 is conclusively stopped before PTY capture so --console-pty launches a fresh process.
    term_before_pty_res = terminate_app_with_postconditions(
        udid=udid,
        bundle_id=args.bundle_id,
        expected_pid=pid2,
        expected_binary_path=expected_binary_path_2,
        expected_ppid=verify2.get("ppid"),
        run_start_epoch=run_start_epoch,
        timeout=30,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_terminate_before_pty",
        postcondition_resolutions=postcondition_resolutions,
    )
    pty_started_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    pty_meta: dict[str, Any] = {}
    pty_observed: dict[str, float] = {}
    pty_log = capture_console_pty_launch(
        udid,
        args.bundle_id,
        evidence_dir / "02b-simctl-console-pty.log",
        observed_patterns=pty_observed,
        previous_pid=pid2,
        metadata=pty_meta,
    )
    pty_launched_pid = pty_meta.get("launchedPid")
    pty_fresh_launched = pty_meta.get("freshProcessLaunched") is True
    pty_has_valid_numeric_pid = (
        isinstance(pty_launched_pid, int)
        and not isinstance(pty_launched_pid, bool)
        and pty_launched_pid > 0
    )
    summary["simctlPhase"]["terminateBeforePtyMethod"] = term_before_pty_res["method"]
    summary["simctlPhase"]["ptyLaunchPid"] = (
        pty_launched_pid if pty_has_valid_numeric_pid else None
    )
    summary["simctlPhase"]["ptyCapture"] = {
        **pty_meta,
        "readinessAfterSeconds": pty_observed,
        "nativePreferencesToJsObserved": bool(re.search(r"TO JS\s+\{", pty_log)),
        "webViewLoadedObserved": bool(re.search(r"WebView loaded", pty_log)),
    }
    if "Preferences.then" in pty_log:
        raise RuntimeError("Detected Capacitor Preferences.then() Proxy trap in simulator PTY log.")
    if pty_meta.get("reusedRunningProcess") or (
        pty_has_valid_numeric_pid and pty_launched_pid == pid2
    ):
        capture_scoped_logs(udid, pty_started_at, evidence_dir / "02b-simctl-console-pty-logs.txt")
        crashes = find_new_app_crashes(run_start_epoch)
        summary["newAppCrashReports"] = crashes
        crash_suffix = f" New crash reports: {crashes}" if crashes else ""
        raise RuntimeError(
            f"PTY launch reused already-running PID {pid2} instead of starting a fresh process "
            "for native Capacitor Preferences.get verification."
            + crash_suffix
        )
    if not pty_fresh_launched or not pty_has_valid_numeric_pid or pty_launched_pid == pid1:
        capture_scoped_logs(udid, pty_started_at, evidence_dir / "02b-simctl-console-pty-logs.txt")
        crashes = find_new_app_crashes(run_start_epoch)
        summary["newAppCrashReports"] = crashes
        crash_suffix = f" New crash reports: {crashes}" if crashes else ""
        if pty_has_valid_numeric_pid and pty_launched_pid == pid1:
            raise RuntimeError(
                f"PTY launch reported stale initial PID {pid1} instead of a fresh process "
                "for native Capacitor Preferences.get verification."
                + crash_suffix
            )
        raise RuntimeError(
            f"PTY launch did not report a valid fresh numeric PID for {args.bundle_id} "
            f"(launchedPid={pty_launched_pid!r}, freshProcessLaunched={pty_meta.get('freshProcessLaunched')!r}); "
            "cannot accept native Capacitor Preferences.get marker without fresh-process proof."
            + crash_suffix
        )
    if not re.search(r"To Native ->\s+Preferences\s+get\b", pty_log):
        capture_scoped_logs(udid, pty_started_at, evidence_dir / "02b-simctl-console-pty-logs.txt")
        crashes = find_new_app_crashes(run_start_epoch)
        summary["newAppCrashReports"] = crashes
        crash_suffix = f" New crash reports: {crashes}" if crashes else ""
        raise RuntimeError(
            "Expected native Capacitor Preferences.get bridge call in 02b-simctl-console-pty.log."
            + crash_suffix
        )
    summary["simctlPhase"]["nativePreferencesGetObserved"] = True

    # Uninstall before XCUITest so UI tests start from a clean install -> onboarding state.
    run_cmd_best_effort(
        ["xcrun", "simctl", "terminate", udid, args.bundle_id],
        timeout=30,
        step_timings=step_timings,
        step_name="simctl_terminate_before_uninstall",
    )
    run_simctl_with_retry(
        ["xcrun", "simctl", "uninstall", udid, args.bundle_id],
        timeout=45,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_uninstall",
    )

    # ------------------------------------------------------------------
    # Phase 2: Deliverable A/B — XCUITest WebView UI, lifecycle & restart
    # ------------------------------------------------------------------
    t2 = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    xcresult_path = evidence_dir / "AppUITests.xcresult"
    xcode_test_cmd = [
        "xcodebuild",
        "-project",
        args.project,
        "-scheme",
        args.scheme,
        "-configuration",
        "Debug",
        "-destination",
        f"platform=iOS Simulator,id={udid}",
        "-derivedDataPath",
        args.derived_data,
        "-resultBundlePath",
        str(xcresult_path),
        "CODE_SIGNING_ALLOWED=NO",
        "CODE_SIGNING_REQUIRED=NO",
        "CODE_SIGN_IDENTITY=",
        "test",
    ]
    test_proc = run_cmd(
        xcode_test_cmd,
        timeout=420,
        check=False,
        step_timings=step_timings,
        step_name="xcodebuild_xcuitest",
    )
    (evidence_dir / "03-xcuitest-stdout.log").write_text(test_proc.stdout, encoding="utf-8")
    (evidence_dir / "03-xcuitest-stderr.log").write_text(test_proc.stderr, encoding="utf-8")
    capture_scoped_logs(udid, t2, evidence_dir / "03-xcuitest-sim-logs.txt")

    if xcresult_path.exists():
        xc_summary = run_cmd(
            ["xcrun", "xcresulttool", "get", "test-results", "summary", "--path", str(xcresult_path)],
            timeout=30,
            check=False,
        )
        if xc_summary.returncode == 0 and xc_summary.stdout.strip():
            (evidence_dir / "03-xcuitest-summary.json").write_text(
                xc_summary.stdout, encoding="utf-8"
            )
            try:
                xc_data = json.loads(xc_summary.stdout)
                devices = xc_data.get("devicesAndConfigurations") or []
                if devices and isinstance(devices[0], dict):
                    dev_info = devices[0].get("device") or {}
                    if isinstance(dev_info, dict) and dev_info.get("architecture"):
                        summary["simulatorArch"] = dev_info["architecture"]
            except Exception:
                pass
        attachments_dir = evidence_dir / "xcuitest-attachments"
        attachments_dir.mkdir(parents=True, exist_ok=True)
        run_cmd_best_effort(
            [
                "xcrun",
                "xcresulttool",
                "export",
                "attachments",
                "--path",
                str(xcresult_path),
                "--output-path",
                str(attachments_dir),
            ],
            timeout=30,
        )

    if test_proc.returncode != 0:
        raise RuntimeError(
            f"xcodebuild AppUITests failed with exit code {test_proc.returncode}. "
            f"See {evidence_dir / '03-xcuitest-stdout.log'} and stderr."
        )

    crashes = find_new_app_crashes(run_start_epoch)
    summary["newAppCrashReports"] = crashes
    if crashes:
        raise RuntimeError(f"Detected new crash reports during simulator run: {crashes}")


def main() -> int:
    parser = argparse.ArgumentParser(description="R20-4 iOS Simulator runtime smoke runner")
    parser.add_argument("--app-path", required=True, help="Path to built Debug-iphonesimulator/App.app")
    parser.add_argument("--project", default="ios/App/App.xcodeproj", help="Path to Xcode project")
    parser.add_argument("--scheme", default="App", help="Xcode scheme name")
    parser.add_argument("--derived-data", default=None, help="DerivedData path (required unless --lifecycle-probe-only or --simctl-only)")
    parser.add_argument("--bundle-id", default="com.example.bibleberry.r20poc", help="App bundle identifier")
    parser.add_argument("--runtime-version", default="26.4", help="Target iOS simulator runtime version")
    parser.add_argument("--evidence-dir", required=True, help="Directory for logs, screenshots, and summary")
    parser.add_argument(
        "--lifecycle-probe-only",
        action="store_true",
        help="Run only the test-only @capacitor/app registration PTY probe on --app-path",
    )
    parser.add_argument(
        "--simctl-only",
        action="store_true",
        help="Run only Phase 1 simctl install/launch/terminate/relaunch checks (skip PTY and AppUITests)",
    )
    parser.add_argument(
        "--max-device-resets",
        type=int,
        default=1,
        help="Maximum number of simulator device recreations on transient CoreSimulator failures",
    )
    parser.add_argument(
        "--ready-timeout",
        type=float,
        default=120.0,
        help="Seconds to poll for simulator service readiness after bootstatus",
    )
    args = parser.parse_args()

    if not args.lifecycle_probe_only and not args.simctl_only and not args.derived_data:
        parser.error("--derived-data is required unless --lifecycle-probe-only or --simctl-only is set")

    app_path = Path(args.app_path)
    if not app_path.is_dir():
        raise RuntimeError(f"App bundle not found at {app_path}")

    evidence_dir = Path(args.evidence_dir)
    evidence_dir.mkdir(parents=True, exist_ok=True)

    step_timings: list[dict[str, Any]] = []
    host_arch = run_cmd(["uname", "-m"], timeout=10).stdout.strip()
    sw_vers_proc = run_cmd(["sw_vers", "-productVersion"], timeout=10, check=False)
    xcode_ver_proc = run_cmd(["xcodebuild", "-version"], timeout=15, check=False)
    app_binary = app_path / "App"
    lipo_output = run_cmd(["lipo", "-info", str(app_binary)], timeout=10, check=False).stdout.strip()

    runtime = select_ios_runtime(args.runtime_version)
    devicetype = select_iphone_devicetype(runtime)

    summary: dict[str, Any] = {
        "deviceType": devicetype,
        "runtime": runtime,
        "hostArch": host_arch,
        "macosVersion": sw_vers_proc.stdout.strip() if sw_vers_proc.returncode == 0 else None,
        "xcodeVersion": xcode_ver_proc.stdout.strip().splitlines() if xcode_ver_proc.returncode == 0 else [],
        "runnerImage": {
            "imageOS": os.environ.get("ImageOS"),
            "imageVersion": os.environ.get("ImageVersion"),
        },
        "runtimeProvisioned": os.environ.get("IOS_RUNTIME_PROVISIONED", "unknown"),
        "appBinaryArch": lipo_output,
        "bundleId": args.bundle_id,
        "stepTimings": step_timings,
        "infrastructureRetries": [],
        "postconditionResolutions": [],
        "cleanup": [],
    }

    run_start_epoch = time.time()
    max_attempts = 1 + max(0, args.max_device_resets)

    for attempt in range(max_attempts):
        current_udid: str | None = None
        attempt_evidence_dir = evidence_dir / f"attempt-{attempt + 1}"
        attempt_evidence_dir.mkdir(parents=True, exist_ok=True)
        try:
            sim_name = f"Bibleberry-R20-4-Smoke-{int(time.time())}-{attempt + 1}"
            create_proc = run_simctl_with_retry(
                ["xcrun", "simctl", "create", sim_name, devicetype["identifier"], runtime["identifier"]],
                timeout=45,
                retries=1,
                step_timings=step_timings,
                step_name="simctl_create",
            )
            current_udid = create_proc.stdout.strip()
            if not current_udid:
                raise SimulatorInfrastructureError("simctl create returned an empty UDID.")

            summary["simulatorName"] = sim_name
            summary["udid"] = current_udid
            summary["attempt"] = attempt + 1

            _run_smoke_attempt(
                args=args,
                app_path=app_path,
                evidence_dir=attempt_evidence_dir,
                udid=current_udid,
                summary=summary,
                step_timings=step_timings,
                run_start_epoch=run_start_epoch,
            )

            summary["status"] = "passed"
            write_summary_safe(evidence_dir, summary)
            print(json.dumps(summary, indent=2), flush=True)
            return 0

        except SimulatorInfrastructureError as exc:
            crashes = find_new_app_crashes(run_start_epoch)
            if attempt < max_attempts - 1 and not crashes:
                print(
                    f"::warning::Transient CoreSimulator failure on attempt {attempt + 1}/{max_attempts}: {exc}; "
                    "recreating simulator...",
                    file=sys.stderr,
                    flush=True,
                )
                summary["infrastructureRetries"].append(
                    {"attempt": attempt + 1, "udid": current_udid, "error": str(exc)}
                )
                summary.setdefault("diagnosticCaptures", []).append(
                    collect_simulator_diagnostics(
                        current_udid,
                        attempt_evidence_dir,
                        "retry",
                    )
                )
                continue

            summary["status"] = "failed"
            summary["error"] = str(exc)
            summary["newAppCrashReports"] = crashes
            summary.setdefault("diagnosticCaptures", []).append(
                collect_simulator_diagnostics(current_udid, attempt_evidence_dir, "failure")
            )
            write_summary_safe(evidence_dir, summary)
            print(f"::error::{exc}", file=sys.stderr, flush=True)
            return 1

        except Exception as exc:
            summary["status"] = "failed"
            summary["error"] = str(exc)
            summary["newAppCrashReports"] = find_new_app_crashes(run_start_epoch)
            summary.setdefault("diagnosticCaptures", []).append(
                collect_simulator_diagnostics(current_udid, attempt_evidence_dir, "failure")
            )
            write_summary_safe(evidence_dir, summary)
            print(f"::error::{exc}", file=sys.stderr, flush=True)
            return 1

        finally:
            if current_udid:
                cleanup_res = cleanup_simulator(
                    current_udid,
                    args.bundle_id,
                    step_timings=step_timings,
                )
                summary["cleanup"].append(cleanup_res)
                write_summary_safe(evidence_dir, summary)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
