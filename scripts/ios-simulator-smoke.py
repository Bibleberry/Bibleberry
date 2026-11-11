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
import re
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
    parser.add_argument("--derived-data", required=True, help="DerivedData path")
    parser.add_argument("--bundle-id", default="com.example.bibleberry.r20poc", help="App bundle identifier")
    parser.add_argument("--runtime-version", default="26.4", help="Target iOS simulator runtime version")
    parser.add_argument("--evidence-dir", required=True, help="Directory for logs, screenshots, and summary")
    args = parser.parse_args()

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
        sim_arch = run_cmd(
            ["xcrun", "simctl", "spawn", udid, "uname", "-m"],
            timeout=15,
            check=False,
        ).stdout.strip()
        summary["simulatorArch"] = sim_arch

        # ------------------------------------------------------------------
        # Phase 1: Deliverable A — simctl install, launch, terminate, relaunch
        # ------------------------------------------------------------------
        run_cmd(["xcrun", "simctl", "install", udid, str(app_path)], timeout=60)
        container1 = run_cmd(
            ["xcrun", "simctl", "get_app_container", udid, args.bundle_id, "app"],
            timeout=15,
        ).stdout.strip()
        summary["installedContainer"] = container1

        t0 = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        launch1 = run_cmd(["xcrun", "simctl", "launch", udid, args.bundle_id], timeout=30)
        pid1 = parse_simctl_launch_pid(launch1.stdout, args.bundle_id)
        time.sleep(5)
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
        t1 = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        launch2 = run_cmd(["xcrun", "simctl", "launch", udid, args.bundle_id], timeout=30)
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
