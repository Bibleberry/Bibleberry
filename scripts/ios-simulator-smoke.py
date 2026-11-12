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
import subprocess
import sys
import time


def run_cmd(
    args: list[str],
    *,
    timeout: int = 60,
    check: bool = True,
    capture: bool = True,
) -> subprocess.CompletedProcess[str]:
    print(f"+ {' '.join(args)}", flush=True)
    return subprocess.run(
        args,
        timeout=timeout,
        check=check,
        text=True,
        capture_output=capture,
    )


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
        run_cmd(["xcrun", "simctl", "terminate", udid, bundle_id], timeout=20, check=False)
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


def main() -> int:
    parser = argparse.ArgumentParser(description="R20-4 iOS Simulator runtime smoke runner")
    parser.add_argument("--app-path", required=True, help="Path to built Debug-iphonesimulator/App.app")
    parser.add_argument("--project", default="ios/App/App.xcodeproj", help="Path to Xcode project")
    parser.add_argument("--scheme", default="App", help="Xcode scheme name")
    parser.add_argument("--derived-data", default=None, help="DerivedData path (required unless --lifecycle-probe-only)")
    parser.add_argument("--bundle-id", default="com.example.bibleberry.r20poc", help="App bundle identifier")
    parser.add_argument("--runtime-version", default="26.4", help="Target iOS simulator runtime version")
    parser.add_argument("--evidence-dir", required=True, help="Directory for logs, screenshots, and summary")
    parser.add_argument(
        "--lifecycle-probe-only",
        action="store_true",
        help="Run only the test-only @capacitor/app registration PTY probe on --app-path",
    )
    args = parser.parse_args()

    if not args.lifecycle_probe_only and not args.derived_data:
        parser.error("--derived-data is required unless --lifecycle-probe-only is set")

    app_path = Path(args.app_path)
    if not app_path.is_dir():
        raise RuntimeError(f"App bundle not found at {app_path}")

    evidence_dir = Path(args.evidence_dir)
    evidence_dir.mkdir(parents=True, exist_ok=True)

    host_arch = run_cmd(["uname", "-m"], timeout=10).stdout.strip()
    app_binary = app_path / "App"
    lipo_output = run_cmd(["lipo", "-info", str(app_binary)], timeout=10, check=False).stdout.strip()

    runtime = select_ios_runtime(args.runtime_version)
    devicetype = select_iphone_devicetype(runtime)

    sim_name = f"Bibleberry-R20-4-Smoke-{int(time.time())}"
    create_proc = run_cmd(
        ["xcrun", "simctl", "create", sim_name, devicetype["identifier"], runtime["identifier"]],
        timeout=30,
    )
    udid = create_proc.stdout.strip()
    if not udid:
        raise RuntimeError("simctl create returned an empty UDID.")

    summary: dict[str, object] = {
        "simulatorName": sim_name,
        "udid": udid,
        "deviceType": devicetype,
        "runtime": runtime,
        "hostArch": host_arch,
        "appBinaryArch": lipo_output,
        "bundleId": args.bundle_id,
    }

    run_start_epoch = time.time()
    try:
        run_cmd(["xcrun", "simctl", "boot", udid], timeout=60)
        run_cmd(["xcrun", "simctl", "bootstatus", udid, "-b"], timeout=180)

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
            run_cmd(["xcrun", "simctl", "install", udid, str(app_path)], timeout=60)
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
                run_cmd(
                    [
                        "xcrun",
                        "simctl",
                        "io",
                        udid,
                        "screenshot",
                        str(evidence_dir / "03-lifecycle-probe-screenshot.png"),
                    ],
                    timeout=30,
                    check=False,
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
            summary["status"] = "passed"
            (evidence_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
            print(json.dumps(summary, indent=2), flush=True)
            return 0

        # ------------------------------------------------------------------
        # Phase 1: Deliverable A — simctl install, launch, terminate, relaunch
        # ------------------------------------------------------------------
        run_cmd(["xcrun", "simctl", "install", udid, str(app_path)], timeout=60)
        container1 = run_cmd(
            ["xcrun", "simctl", "get_app_container", udid, args.bundle_id, "app"],
            timeout=15,
        ).stdout.strip()
        summary["installedContainer"] = container1

        launch1_stdout = evidence_dir / "01-simctl-launch-stdout.log"
        launch1_stderr = evidence_dir / "01-simctl-launch-stderr.log"
        t0 = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        launch1 = run_cmd(
            [
                "xcrun",
                "simctl",
                "launch",
                f"--stdout={launch1_stdout}",
                f"--stderr={launch1_stderr}",
                udid,
                args.bundle_id,
            ],
            timeout=30,
        )
        pid1 = parse_simctl_launch_pid(launch1.stdout, args.bundle_id)
        time.sleep(8)
        verify_pid_alive(udid, args.bundle_id, pid1, evidence_dir / "01-launch-process.txt")
        shot1 = evidence_dir / "01-simctl-launch.png"
        run_cmd(["xcrun", "simctl", "io", udid, "screenshot", str(shot1)], timeout=20)
        if not shot1.is_file() or shot1.stat().st_size < 1024:
            raise RuntimeError(f"Initial launch screenshot missing or unexpectedly small: {shot1}")
        capture_scoped_logs(udid, t0, evidence_dir / "01-simctl-launch-logs.txt")

        # Terminate without uninstalling
        run_cmd(["xcrun", "simctl", "terminate", udid, args.bundle_id], timeout=20)
        time.sleep(1)
        ps_after_term = run_cmd(
            ["ps", "-p", str(pid1)],
            timeout=10,
            check=False,
        )
        if ps_after_term.returncode == 0:
            raise RuntimeError(f"Process {pid1} still running after simctl terminate.")
        # Prove app remains installed without uninstall/reinstall
        run_cmd(
            ["xcrun", "simctl", "get_app_container", udid, args.bundle_id, "app"],
            timeout=15,
        )

        # Relaunch without reinstalling
        launch2_stdout = evidence_dir / "02-simctl-relaunch-stdout.log"
        launch2_stderr = evidence_dir / "02-simctl-relaunch-stderr.log"
        t1 = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        launch2 = run_cmd(
            [
                "xcrun",
                "simctl",
                "launch",
                f"--stdout={launch2_stdout}",
                f"--stderr={launch2_stderr}",
                udid,
                args.bundle_id,
            ],
            timeout=30,
        )
        pid2 = parse_simctl_launch_pid(launch2.stdout, args.bundle_id)
        if pid2 == pid1:
            raise RuntimeError(f"Relaunch returned identical PID {pid2}; expected fresh process.")
        time.sleep(5)
        verify_pid_alive(udid, args.bundle_id, pid2, evidence_dir / "02-relaunch-process.txt")
        shot2 = evidence_dir / "02-simctl-relaunch.png"
        run_cmd(["xcrun", "simctl", "io", udid, "screenshot", str(shot2)], timeout=20)
        if not shot2.is_file() or shot2.stat().st_size < 1024:
            raise RuntimeError(f"Relaunch screenshot missing or unexpectedly small: {shot2}")
        capture_scoped_logs(udid, t1, evidence_dir / "02-simctl-relaunch-logs.txt")

        summary["simctlPhase"] = {
            "initialPid": pid1,
            "relaunchPid": pid2,
            "initialScreenshotBytes": shot1.stat().st_size,
            "relaunchScreenshotBytes": shot2.stat().st_size,
        }

        # Capture line-buffered Capacitor stdout/CAPLog via PTY before clean uninstall.
        run_cmd(["xcrun", "simctl", "terminate", udid, args.bundle_id], timeout=20, check=False)
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
        run_cmd(["xcrun", "simctl", "terminate", udid, args.bundle_id], timeout=20, check=False)
        run_cmd(["xcrun", "simctl", "uninstall", udid, args.bundle_id], timeout=30)

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
        test_proc = run_cmd(xcode_test_cmd, timeout=420, check=False)
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
            run_cmd(
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
                check=False,
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

        summary["status"] = "passed"
        (evidence_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(json.dumps(summary, indent=2), flush=True)
        return 0

    except Exception as exc:
        summary["status"] = "failed"
        summary["error"] = str(exc)
        summary["newAppCrashReports"] = find_new_app_crashes(run_start_epoch)
        (evidence_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"::error::{exc}", file=sys.stderr, flush=True)
        return 1

    finally:
        run_cmd(["xcrun", "simctl", "terminate", udid, args.bundle_id], timeout=20, check=False)
        run_cmd(["xcrun", "simctl", "shutdown", udid], timeout=30, check=False)
        run_cmd(["xcrun", "simctl", "delete", udid], timeout=30, check=False)


if __name__ == "__main__":
    raise SystemExit(main())
