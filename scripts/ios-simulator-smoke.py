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
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
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


def run_simctl_with_retry(
    args: list[str],
    *,
    timeout: int,
    retries: int = 1,
    retry_delay_s: float = 3.0,
    step_timings: list[dict[str, Any]] | None = None,
    step_name: str | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a simctl command, retrying transient timeouts or transport failures."""
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
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
            last_exc = exc
            if attempt < retries:
                print(
                    f"Transient simctl failure on attempt {attempt + 1}/{1 + retries}: {exc}; "
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
    diag_dir.mkdir(parents=True, exist_ok=True)
    captured: dict[str, Any] = {"label": label, "files": []}

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


def parse_simctl_launch_pid(output: str, bundle_id: str) -> int:
    for line in output.splitlines():
        if bundle_id in line:
            match = re.search(r":\s*(\d+)\s*$", line.strip())
            if match:
                return int(match.group(1))
    raise RuntimeError(f"Could not parse launched PID for {bundle_id} from: {output!r}")


def verify_pid_alive(udid: str, bundle_id: str, pid: int, evidence_file: Path) -> None:
    ps_proc = run_cmd(
        ["ps", "-p", str(pid), "-o", "pid=,ppid=,stat=,etime=,comm="],
        timeout=15,
        check=False,
    )
    launchctl_proc = run_cmd(
        ["xcrun", "simctl", "spawn", udid, "launchctl", "list"],
        timeout=20,
        check=False,
    )
    matching_launchctl = [
        line
        for line in launchctl_proc.stdout.splitlines()
        if bundle_id in line or str(pid) in line.split()[:1]
    ]
    evidence_file.write_text(
        f"ps_exit={ps_proc.returncode}\n"
        f"ps_output={ps_proc.stdout.strip()}\n"
        f"launchctl_matches:\n" + "\n".join(matching_launchctl) + "\n",
        encoding="utf-8",
    )
    if ps_proc.returncode != 0 or not ps_proc.stdout.strip():
        raise RuntimeError(f"App process PID {pid} did not remain alive.")
    if not any(bundle_id in line and line.strip().startswith(str(pid)) for line in matching_launchctl):
        raise RuntimeError(
            f"Simulator launchctl does not show PID {pid} active for {bundle_id}: {matching_launchctl}"
        )


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
    except subprocess.TimeoutExpired as exc:
        content = f"[capture_scoped_logs timed out: {exc}]\n"
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
    duration_s: float = 10.0,
    ready_patterns: tuple[str, ...] = (r"To Native ->\s+Preferences\s+get\b",),
    observed_patterns: dict[str, float] | None = None,
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
    summary["installedContainer"] = container1

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
    verify_pid_alive(udid, args.bundle_id, pid1, evidence_dir / "01-launch-process.txt")
    shot1 = evidence_dir / "01-simctl-launch.png"
    run_simctl_with_retry(
        ["xcrun", "simctl", "io", udid, "screenshot", str(shot1)],
        timeout=30,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_screenshot_1",
    )
    if not shot1.is_file() or shot1.stat().st_size < 1024:
        raise RuntimeError(f"Initial launch screenshot missing or unexpectedly small: {shot1}")
    capture_scoped_logs(udid, t0, evidence_dir / "01-simctl-launch-logs.txt")

    # Terminate without uninstalling
    run_simctl_with_retry(
        ["xcrun", "simctl", "terminate", udid, args.bundle_id],
        timeout=30,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_terminate_1",
    )
    time.sleep(1)
    ps_after_term = run_cmd(
        ["ps", "-p", str(pid1)],
        timeout=10,
        check=False,
    )
    if ps_after_term.returncode == 0:
        raise RuntimeError(f"Process {pid1} still running after simctl terminate.")
    # Prove app remains installed without uninstall/reinstall
    run_simctl_with_retry(
        ["xcrun", "simctl", "get_app_container", udid, args.bundle_id, "app"],
        timeout=45,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_get_app_container_2",
    )

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
    verify_pid_alive(udid, args.bundle_id, pid2, evidence_dir / "02-relaunch-process.txt")
    shot2 = evidence_dir / "02-simctl-relaunch.png"
    run_simctl_with_retry(
        ["xcrun", "simctl", "io", udid, "screenshot", str(shot2)],
        timeout=30,
        retries=1,
        step_timings=step_timings,
        step_name="simctl_screenshot_2",
    )
    if not shot2.is_file() or shot2.stat().st_size < 1024:
        raise RuntimeError(f"Relaunch screenshot missing or unexpectedly small: {shot2}")
    capture_scoped_logs(udid, t1, evidence_dir / "02-simctl-relaunch-logs.txt")

    summary["simctlPhase"] = {
        "initialPid": pid1,
        "relaunchPid": pid2,
        "initialScreenshotBytes": shot1.stat().st_size,
        "relaunchScreenshotBytes": shot2.stat().st_size,
    }

    if args.simctl_only:
        crashes = find_new_app_crashes(run_start_epoch)
        summary["newAppCrashReports"] = crashes
        if crashes:
            raise RuntimeError(f"Detected new crash reports during simctl-only run: {crashes}")
        return

    # Capture line-buffered Capacitor stdout/CAPLog via PTY before clean uninstall.
    run_cmd_best_effort(
        ["xcrun", "simctl", "terminate", udid, args.bundle_id],
        timeout=30,
        step_timings=step_timings,
        step_name="simctl_terminate_before_pty",
    )
    pty_log = capture_console_pty_launch(
        udid, args.bundle_id, evidence_dir / "02b-simctl-console-pty.log", duration_s=10.0
    )
    if "Preferences.then" in pty_log:
        raise RuntimeError("Detected Capacitor Preferences.then() Proxy trap in simulator PTY log.")
    if not re.search(r"To Native ->\s+Preferences\s+get\b", pty_log):
        raise RuntimeError(
            "Expected native Capacitor Preferences.get bridge call in 02b-simctl-console-pty.log."
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
        "cleanup": [],
    }

    run_start_epoch = time.time()
    max_attempts = 1 + max(0, args.max_device_resets)

    for attempt in range(max_attempts):
        current_udid: str | None = None
        try:
            sim_name = f"Bibleberry-R20-4-Smoke-{int(time.time())}-{attempt + 1}"
            create_proc = run_cmd(
                ["xcrun", "simctl", "create", sim_name, devicetype["identifier"], runtime["identifier"]],
                timeout=30,
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
                evidence_dir=evidence_dir,
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
                collect_simulator_diagnostics(current_udid, evidence_dir, f"retry-attempt-{attempt + 1}")
                continue

            summary["status"] = "failed"
            summary["error"] = str(exc)
            summary["newAppCrashReports"] = crashes
            collect_simulator_diagnostics(current_udid, evidence_dir, "failure")
            write_summary_safe(evidence_dir, summary)
            print(f"::error::{exc}", file=sys.stderr, flush=True)
            return 1

        except Exception as exc:
            summary["status"] = "failed"
            summary["error"] = str(exc)
            summary["newAppCrashReports"] = find_new_app_crashes(run_start_epoch)
            collect_simulator_diagnostics(current_udid, evidence_dir, "failure")
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
