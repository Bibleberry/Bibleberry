"""Unit tests for scripts/ios-simulator-smoke.py cleanup safety, readiness, and retries."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import plistlib
import struct
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "ios-simulator-smoke.py"
SNAPSHOT_SCRIPT_PATH = REPO_ROOT / "scripts" / "ios-simulator-snapshot.py"

SPEC = importlib.util.spec_from_file_location("ios_simulator_smoke", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
smoke = importlib.util.module_from_spec(SPEC)
sys.modules["ios_simulator_smoke"] = smoke
SPEC.loader.exec_module(smoke)

SNAPSHOT_SPEC = importlib.util.spec_from_file_location(
    "ios_simulator_snapshot", SNAPSHOT_SCRIPT_PATH
)
assert SNAPSHOT_SPEC is not None and SNAPSHOT_SPEC.loader is not None
snapshot = importlib.util.module_from_spec(SNAPSHOT_SPEC)
sys.modules["ios_simulator_snapshot"] = snapshot
SNAPSHOT_SPEC.loader.exec_module(snapshot)


def _completed(args: list[str], stdout: str = "", stderr: str = "", returncode: int = 0) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(args=args, returncode=returncode, stdout=stdout, stderr=stderr)


def _valid_png_bytes(width: int = 1206, height: int = 2622, payload_bytes: int = 2048) -> bytes:
    """Build a minimal structurally valid PNG header + padding >= 1024 bytes."""
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    header = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", len(ihdr_data)) + b"IHDR" + ihdr_data + b"\x00\x00\x00\x00"
    return header + b"\x00" * payload_bytes


class FakeSimulatorEnv:
    """Configurable stateful mock for subprocess.run in ios-simulator-smoke.py tests."""

    def __init__(
        self,
        *,
        simctl_only: bool = True,
        root_dir: Path | None = None,
        installed_bundle_id: str = "com.example.bibleberry.r20poc",
    ) -> None:
        self.simctl_only = simctl_only
        self.root_dir = root_dir
        self.installed_bundle_id = installed_bundle_id
        self.create_count = 0
        self.launch_seq = 0
        self.calls: list[list[str]] = []
        self.fail_on_subcmd: dict[str, list[object]] = {}
        self.installed_containers: dict[str, Path] = {}
        self.running_processes: dict[int, dict[str, object]] = {}
        self.device_states: dict[str, str] = {}
        self.xcuitest_outcomes: list[Exception | subprocess.CompletedProcess[str]] = []
        self.ps_outcomes: list[Exception | subprocess.CompletedProcess[str]] = []
        self.ps_all_outcomes: list[Exception | subprocess.CompletedProcess[str]] = []

    def queue_outcome(self, subcmd: str, outcome: object) -> None:
        self.fail_on_subcmd.setdefault(subcmd, []).append(outcome)

    def _ensure_container(self, udid: str, bundle_id: str | None = None) -> Path:
        if udid in self.installed_containers:
            return self.installed_containers[udid]
        base = self.root_dir or Path(tempfile.gettempdir()) / "fake-coresim"
        container = base / "Devices" / udid / "data" / "Containers" / "Bundle" / "Application" / "CONTAINER-1" / "App.app"
        container.mkdir(parents=True, exist_ok=True)
        (container / "App").write_bytes(b"\x00")
        effective_bundle = bundle_id or self.installed_bundle_id
        (container / "Info.plist").write_bytes(
            plistlib.dumps({"CFBundleIdentifier": effective_bundle})
        )
        self.installed_containers[udid] = container
        return container

    def _stop_running_for_udid(self, udid: str, bundle_id: str) -> list[int]:
        removed = [
            pid
            for pid, info in list(self.running_processes.items())
            if info.get("udid") == udid and info.get("bundle_id") == bundle_id
        ]
        for pid in removed:
            del self.running_processes[pid]
        return removed

    def __call__(self, args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        self.calls.append(list(args))
        check = bool(kwargs.get("check", True))

        if args[0] == "uname":
            return _completed(args, stdout="arm64\n")
        if args[0] == "sw_vers":
            return _completed(args, stdout="26.4\n")
        if args[0] == "xcodebuild" and "-version" in args:
            return _completed(args, stdout="Xcode 26.4.1\nBuild version 17E202\n")
        if args[0] == "xcodebuild" and "test" in args:
            if self.xcuitest_outcomes:
                outcome = self.xcuitest_outcomes.pop(0)
                if isinstance(outcome, Exception):
                    raise outcome
                if check and outcome.returncode != 0:
                    raise subprocess.CalledProcessError(
                        outcome.returncode, args, output=outcome.stdout, stderr=outcome.stderr
                    )
                return outcome
            return _completed(args, stdout="Test Suite 'All tests' passed.\n", returncode=0)
        if args[0] == "lipo":
            return _completed(args, stdout="Non-fat file: App is architecture: arm64\n")
        if args[0] == "ps":
            if "-axo" in args:
                if self.ps_all_outcomes:
                    outcome = self.ps_all_outcomes.pop(0)
                    if isinstance(outcome, Exception):
                        raise outcome
                    return outcome
                lines = [
                    f"{info['pid']:>6} {info['ppid']:>5} {info['stat']:<4} {info['etime']:<8} {info['comm']}"
                    for info in self.running_processes.values()
                ]
                return _completed(args, stdout="\n".join(lines) + ("\n" if lines else ""), returncode=0)
            if self.ps_outcomes:
                outcome = self.ps_outcomes.pop(0)
                if isinstance(outcome, Exception):
                    raise outcome
                return outcome
            if "-p" in args:
                pid_idx = args.index("-p") + 1
                pid = int(args[pid_idx])
                info = self.running_processes.get(pid)
                if info is None:
                    return _completed(args, stdout="", returncode=1)
                if "-o" in args:
                    line = (
                        f"{info['pid']:>6} {info['ppid']:>5} {info['stat']:<4} "
                        f"{info['etime']:<8} {info['comm']}\n"
                    )
                    return _completed(args, stdout=line, returncode=0)
                return _completed(args, stdout=f"{pid}\n", returncode=0)
            return _completed(args, returncode=1)

        if args[:2] == ["xcrun", "simctl"]:
            subcmd = args[2]
            if subcmd in self.fail_on_subcmd and self.fail_on_subcmd[subcmd]:
                outcome = self.fail_on_subcmd[subcmd].pop(0)
                if callable(outcome):
                    outcome = outcome(self, args)
                if isinstance(outcome, Exception):
                    raise outcome
                if check and outcome.returncode != 0:
                    raise subprocess.CalledProcessError(
                        outcome.returncode, args, output=outcome.stdout, stderr=outcome.stderr
                    )
                return outcome

            if subcmd == "list" and len(args) > 3 and args[3] == "runtimes":
                return _completed(
                    args,
                    stdout=json.dumps(
                        {
                            "runtimes": [
                                {
                                    "identifier": "com.apple.CoreSimulator.SimRuntime.iOS-26-4",
                                    "name": "iOS 26.4",
                                    "version": "26.4.1",
                                    "buildversion": "23E254a",
                                    "isAvailable": True,
                                }
                            ]
                        }
                    ),
                )
            if subcmd == "list" and len(args) > 3 and args[3] == "devicetypes":
                return _completed(
                    args,
                    stdout=json.dumps(
                        {
                            "devicetypes": [
                                {
                                    "identifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
                                    "name": "iPhone 17",
                                    "productFamily": "iPhone",
                                }
                            ]
                        }
                    ),
                )
            if subcmd == "list" and len(args) > 3 and args[3] == "devices":
                devices = [
                    {
                        "udid": udid,
                        "state": state,
                        "name": "iPhone 17",
                    }
                    for udid, state in self.device_states.items()
                ]
                if not devices:
                    udid = f"UDID-{max(1, self.create_count)}"
                    devices = [{"udid": udid, "state": "Booted", "name": "iPhone 17"}]
                return _completed(
                    args,
                    stdout=json.dumps(
                        {
                            "devices": {
                                "com.apple.CoreSimulator.SimRuntime.iOS-26-4": devices
                            }
                        }
                    ),
                )
            if subcmd == "create":
                self.create_count += 1
                udid = f"UDID-{self.create_count}"
                self.device_states[udid] = "Shutdown"
                return _completed(args, stdout=f"{udid}\n")
            if subcmd == "boot":
                self.device_states[args[3]] = "Booted"
                return _completed(args)
            if subcmd == "install":
                udid = args[3]
                src_app = Path(args[4])
                plist_path = src_app / "Info.plist"
                bundle_id = self.installed_bundle_id
                if plist_path.is_file():
                    data = plistlib.loads(plist_path.read_bytes())
                    if isinstance(data, dict) and isinstance(data.get("CFBundleIdentifier"), str):
                        bundle_id = data["CFBundleIdentifier"]
                self._ensure_container(udid, bundle_id=bundle_id)
                return _completed(args)
            if subcmd == "terminate":
                udid = args[3]
                bundle_id = args[4]
                self._stop_running_for_udid(udid, bundle_id)
                return _completed(args)
            if subcmd == "shutdown":
                udid = args[3]
                self.device_states[udid] = "Shutdown"
                for pid, info in list(self.running_processes.items()):
                    if info.get("udid") == udid:
                        del self.running_processes[pid]
                return _completed(args)
            if subcmd in {"bootstatus", "delete", "uninstall"}:
                return _completed(args)
            if subcmd == "get_app_container":
                udid = args[3]
                container = self._ensure_container(udid)
                return _completed(args, stdout=f"{container}\n")
            if subcmd == "launch":
                udid = args[-2]
                bundle_id = args[-1]
                container = self._ensure_container(udid)
                self.launch_seq += 1
                pid = 4321 + (self.launch_seq - 1) * 1111
                self.running_processes[pid] = {
                    "pid": pid,
                    "ppid": 5600 + self.create_count,
                    "stat": "Rs",
                    "etime": "00:05",
                    "comm": str(container / "App"),
                    "udid": udid,
                    "bundle_id": bundle_id,
                }
                for arg in args:
                    if arg.startswith("--stdout="):
                        Path(arg.removeprefix("--stdout=")).write_text(
                            f"launch output for PID {pid}\n",
                            encoding="utf-8",
                        )
                return _completed(args, stdout=f"{bundle_id}: {pid}\n")
            if subcmd == "spawn":
                udid = args[3]
                if args[4:6] == ["launchctl", "list"]:
                    lines = ["101\t0\tcom.apple.SpringBoard"]
                    for pid, info in self.running_processes.items():
                        if info.get("udid") == udid:
                            lines.append(
                                f"{pid}\t0\tUIKitApplication:{info['bundle_id']}[1234]"
                            )
                    return _completed(args, stdout="\n".join(lines) + "\n")
                if args[4:6] == ["log", "show"]:
                    return _completed(args, stdout="sample log\n")
            if subcmd == "io" and len(args) > 4 and args[4] == "screenshot":
                shot_path = Path(args[5])
                shot_path.write_bytes(_valid_png_bytes())
                return _completed(args)

        return _completed(args)


class TestIosSimulatorSmoke(unittest.TestCase):
    def _make_fake_app(
        self,
        tmpdir: Path,
        bundle_id: str = "com.example.bibleberry.r20poc",
    ) -> Path:
        app_path = tmpdir / "App.app"
        app_path.mkdir(parents=True)
        (app_path / "App").write_bytes(b"\x00")
        (app_path / "Info.plist").write_bytes(
            plistlib.dumps({"CFBundleIdentifier": bundle_id})
        )
        return app_path

    def test_cleanup_timeouts_do_not_mask_original_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            env = FakeSimulatorEnv()

            # Exhaust both launch attempts (1 initial + 1 retry) with TimeoutExpired
            env.queue_outcome("launch", subprocess.TimeoutExpired(["xcrun", "simctl", "launch"], 60))
            env.queue_outcome("launch", subprocess.TimeoutExpired(["xcrun", "simctl", "launch"], 60))
            # Make all 3 cleanup commands time out in finally!
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate"], 30))
            env.queue_outcome("shutdown", subprocess.TimeoutExpired(["xcrun", "simctl", "shutdown"], 30))
            env.queue_outcome("delete", subprocess.TimeoutExpired(["xcrun", "simctl", "delete"], 30))

            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "0",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 1)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "failed")
            self.assertIn("launch", summary["error"])
            self.assertIn("timed out", summary["error"])
            self.assertEqual(len(summary["cleanup"]), 1)
            cleanup = summary["cleanup"][0]
            self.assertTrue(cleanup["terminate"]["timedOut"])
            self.assertTrue(cleanup["shutdown"]["timedOut"])
            self.assertTrue(cleanup["delete"]["timedOut"])
            self.assertGreater(len(summary["stepTimings"]), 0)

    def test_device_reset_recovers_from_transient_install_timeout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            env = FakeSimulatorEnv()

            # Attempt 1: install fails twice (initial + retry) -> triggers 1 controlled device reset
            env.queue_outcome("install", subprocess.TimeoutExpired(["xcrun", "simctl", "install"], 120))
            env.queue_outcome("install", subprocess.TimeoutExpired(["xcrun", "simctl", "install"], 120))
            # Attempt 2: install succeeds on fresh UDID-2

            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 0)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "passed")
            self.assertEqual(summary["udid"], "UDID-2")
            self.assertEqual(len(summary["infrastructureRetries"]), 1)
            self.assertEqual(summary["infrastructureRetries"][0]["udid"], "UDID-1")
            self.assertEqual(len(summary["cleanup"]), 2)

    def test_device_reset_keeps_attempt_evidence_separate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            env = FakeSimulatorEnv()
            env.queue_outcome("io", subprocess.TimeoutExpired(["xcrun", "simctl", "io"], 30))
            env.queue_outcome("io", subprocess.TimeoutExpired(["xcrun", "simctl", "io"], 30))

            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 0)
            first_launch = evidence_dir / "attempt-1" / "01-simctl-launch-stdout.log"
            second_launch = evidence_dir / "attempt-2" / "01-simctl-launch-stdout.log"
            self.assertTrue(first_launch.is_file())
            self.assertTrue(second_launch.is_file())
            self.assertNotEqual(first_launch.read_text(encoding="utf-8"), second_launch.read_text(encoding="utf-8"))
            self.assertTrue((evidence_dir / "summary.json").is_file())

    def test_app_crash_or_assertion_failure_is_not_retried(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            env = FakeSimulatorEnv()

            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "verify_pid_alive", side_effect=RuntimeError("App process PID 4321 died")),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 1)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "failed")
            self.assertEqual(summary["error"], "App process PID 4321 died")
            self.assertEqual(summary["infrastructureRetries"], [])
            self.assertEqual(env.create_count, 1)

    def test_wait_for_simulator_ready_polls_until_springboard_active(self) -> None:
        states = iter(["Booting", "Booted", "Booted"])
        launchctl_outputs = iter(
            [
                _completed(["xcrun", "simctl", "spawn"], stdout="-\t0\tcom.apple.SpringBoard\n"),
                _completed(["xcrun", "simctl", "spawn"], stdout="777\t0\tcom.apple.SpringBoard\n"),
            ]
        )

        def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
            if args[:4] == ["xcrun", "simctl", "list", "devices"]:
                state = next(states)
                return _completed(
                    args,
                    stdout=json.dumps({"devices": {"iOS-26-4": [{"udid": "U1", "state": state}]}}),
                )
            if args[:3] == ["xcrun", "simctl", "spawn"]:
                return next(launchctl_outputs)
            raise AssertionError(f"Unexpected call: {args}")

        timings: list[dict[str, object]] = []
        with (
            mock.patch.object(smoke.subprocess, "run", side_effect=fake_run),
            mock.patch.object(smoke.time, "sleep"),
        ):
            info = smoke.wait_for_simulator_ready(
                "U1",
                timeout_s=30.0,
                poll_interval_s=0.1,
                settle_s=0.1,
                step_timings=timings,
            )

        self.assertTrue(info["ready"])
        self.assertEqual(info["attempts"], 3)
        self.assertEqual(info["state"], "Booted")
        self.assertEqual(timings[0]["step"], "wait_for_simulator_ready")
        self.assertFalse(timings[0]["timedOut"])

    def test_wait_for_simulator_ready_tolerates_list_devices_timeout(self) -> None:
        calls = 0

        def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
            nonlocal calls
            if args[:4] == ["xcrun", "simctl", "list", "devices"]:
                calls += 1
                if calls == 1:
                    raise subprocess.TimeoutExpired(args, 30)
                return _completed(
                    args,
                    stdout=json.dumps({"devices": {"iOS-26-4": [{"udid": "U1", "state": "Booted"}]}}),
                )
            if args[:3] == ["xcrun", "simctl", "spawn"]:
                return _completed(args, stdout="888\t0\tcom.apple.SpringBoard\n")
            raise AssertionError(f"Unexpected call: {args}")

        timings: list[dict[str, object]] = []
        with (
            mock.patch.object(smoke.subprocess, "run", side_effect=fake_run),
            mock.patch.object(smoke.time, "sleep"),
        ):
            info = smoke.wait_for_simulator_ready(
                "U1",
                timeout_s=30.0,
                poll_interval_s=0.1,
                settle_s=0.1,
                step_timings=timings,
            )

        self.assertTrue(info["ready"])
        self.assertEqual(info["attempts"], 2)
        self.assertEqual(info["state"], "Booted")

    def test_wait_for_simulator_ready_exhausted_raises_infrastructure_error(self) -> None:
        def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
            if args[:4] == ["xcrun", "simctl", "list", "devices"]:
                raise subprocess.TimeoutExpired(args, 30)
            raise AssertionError(f"Unexpected call: {args}")

        timings: list[dict[str, object]] = []
        with (
            mock.patch.object(smoke.subprocess, "run", side_effect=fake_run),
            mock.patch.object(smoke.time, "sleep"),
            self.assertRaises(smoke.SimulatorInfrastructureError),
        ):
            smoke.wait_for_simulator_ready(
                "U1",
                timeout_s=0.05,
                poll_interval_s=0.01,
                settle_s=0.0,
                step_timings=timings,
            )
        self.assertTrue(timings[0]["timedOut"])

    def test_simulator_diagnostics_directory_failure_is_recorded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            evidence_dir = Path(tmp) / "evidence"
            original_mkdir = Path.mkdir

            def failing_mkdir(path: Path, *args: object, **kwargs: object) -> None:
                if path == evidence_dir / "diagnostics":
                    raise OSError("permission denied")
                original_mkdir(path, *args, **kwargs)

            with mock.patch.object(Path, "mkdir", failing_mkdir):
                result = smoke.collect_simulator_diagnostics("U1", evidence_dir, "failure")

            self.assertEqual(result["label"], "failure")
            self.assertEqual(result["files"], [])
            self.assertIn("permission denied", result["error"])

    def test_simulator_snapshot_timeout_is_recorded_without_raising(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "env" / "devices.json"
            timeout = subprocess.TimeoutExpired(
                ["xcrun", "simctl", "list", "devices", "-j"],
                20,
                output=b'{"partial":',
                stderr=b"service stalled",
            )
            with mock.patch.object(snapshot.subprocess, "run", side_effect=timeout) as run:
                record = snapshot.capture_simulator_snapshot(destination)

            run.assert_called_once()
            self.assertEqual(run.call_args.kwargs["timeout"], 20)
            self.assertEqual(record["timedOut"], True)
            self.assertEqual(record["stdout"], '{"partial":')
            self.assertEqual(record["stderr"], "service stalled")
            self.assertEqual(json.loads(destination.read_text(encoding="utf-8")), record)

    def test_console_pty_capture_waits_for_delayed_native_bridge_call(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "console-pty.log"
            current_time = 0.0

            def advance_select(
                read_fds: list[int], _write_fds: object, _error_fds: object, _timeout: float
            ) -> tuple[list[int], list[int], list[int]]:
                nonlocal current_time
                current_time += 1.0
                return (read_fds if current_time >= 12.0 else [], [], [])

            process = mock.Mock()
            process.poll.return_value = 0
            with (
                mock.patch.object(smoke.subprocess, "Popen", return_value=process),
                mock.patch.object(smoke.select, "select", side_effect=advance_select),
                mock.patch.object(smoke.os, "read", return_value=b"To Native -> Preferences get\n"),
                mock.patch.object(smoke, "run_cmd_best_effort", return_value={}),
                mock.patch.object(smoke.time, "monotonic", side_effect=lambda: current_time),
            ):
                output = smoke.capture_console_pty_launch("U1", "com.example.app", output_path)

            self.assertIn("To Native -> Preferences get", output)
            self.assertEqual(output_path.read_text(encoding="utf-8"), output)

    def test_non_transient_called_process_error_is_not_retried(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            env = FakeSimulatorEnv()

            err = subprocess.CalledProcessError(
                returncode=1,
                cmd=["xcrun", "simctl", "install"],
                stderr="An error was encountered processing the command: Invalid bundle",
            )
            env.queue_outcome("install", err)

            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 1)
            install_calls = [c for c in env.calls if c[:3] == ["xcrun", "simctl", "install"]]
            self.assertEqual(len(install_calls), 1)
            self.assertEqual(env.create_count, 1)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "failed")
            self.assertEqual(summary["infrastructureRetries"], [])

    def test_transient_called_process_error_recovers_on_retry(self) -> None:
        err = subprocess.CalledProcessError(
            returncode=1,
            cmd=["xcrun", "simctl", "install"],
            stderr="CoreSimulatorService connection interrupted",
        )
        calls = 0

        def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise err
            return _completed(args, stdout="ok\n")

        with (
            mock.patch.object(smoke.subprocess, "run", side_effect=fake_run),
            mock.patch.object(smoke.time, "sleep"),
        ):
            proc = smoke.run_simctl_with_retry(["xcrun", "simctl", "install", "U1", "/App.app"], timeout=60, retries=1)

        self.assertEqual(calls, 2)
        self.assertEqual(proc.returncode, 0)

    def test_verify_pid_alive_checks_ps_first_and_routes_launchctl_timeout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            evidence_file = Path(tmp) / "proc.txt"

            # Case 1: dead process on host ps -> immediate RuntimeError without calling simctl spawn
            calls: list[list[str]] = []

            def dead_ps_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
                calls.append(args)
                return _completed(args, stdout="", returncode=1)

            with (
                mock.patch.object(smoke.subprocess, "run", side_effect=dead_ps_run),
                self.assertRaises(RuntimeError) as ctx,
            ):
                smoke.verify_pid_alive("U1", "com.example.app", 9999, evidence_file)
            self.assertIn("did not remain alive", str(ctx.exception))
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][0], "ps")

            # Case 2: host PID remains alive after the simulator query times out.
            def launchctl_timeout_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
                if args[0] == "ps":
                    return _completed(args, stdout="  9999     1 S    00:05 App\n", returncode=0)
                raise subprocess.TimeoutExpired(args, 30)

            with (
                mock.patch.object(smoke.subprocess, "run", side_effect=launchctl_timeout_run),
                mock.patch.object(smoke.time, "sleep"),
                self.assertRaises(smoke.SimulatorInfrastructureError),
            ):
                smoke.verify_pid_alive("U1", "com.example.app", 9999, evidence_file)

            # Case 3: PID exits during the simulator query retry; do not expose an infra error
            # that would let the caller recreate the simulator and hide the app failure.
            ps_calls = 0

            def pid_exits_during_query(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
                nonlocal ps_calls
                if args[0] == "ps":
                    ps_calls += 1
                    if ps_calls == 1:
                        return _completed(args, stdout="  9999     1 S    00:05 App\n", returncode=0)
                    return _completed(args, stdout="", returncode=1)
                raise subprocess.TimeoutExpired(args, 30)

            with (
                mock.patch.object(smoke.subprocess, "run", side_effect=pid_exits_during_query),
                mock.patch.object(smoke.time, "sleep"),
                self.assertRaisesRegex(RuntimeError, "exited while simulator launchctl verification was unavailable"),
            ):
                smoke.verify_pid_alive("U1", "com.example.app", 9999, evidence_file)
            self.assertEqual(ps_calls, 2)
            self.assertIn("ps_recheck_exit=1", evidence_file.read_text(encoding="utf-8"))

    # ------------------------------------------------------------------
    # Granite Lantern Phase 2 deterministic regressions (a)-(k)
    # ------------------------------------------------------------------

    def _full_run_argv(
        self,
        app_path: Path,
        evidence_dir: Path,
        derived_data: Path,
        *,
        max_device_resets: int = 1,
    ) -> list[str]:
        return [
            "ios-simulator-smoke.py",
            "--app-path",
            str(app_path),
            "--derived-data",
            str(derived_data),
            "--evidence-dir",
            str(evidence_dir),
            "--max-device-resets",
            str(max_device_resets),
        ]

    def _healthy_pty_capture(
        self,
        *,
        pty_pid: int = 9991,
        body: str = (
            "⚡️  Loading app at capacitor://localhost...\n"
            "⚡️  To Native ->  Preferences get 1001\n"
            '⚡️  TO JS {"value":null}\n'
            "⚡️  WebView loaded\n"
        ),
    ) -> object:
        def fake_pty(
            udid: str,
            bundle_id: str,
            out_file: Path,
            duration_s: float = 60.0,
            ready_patterns: tuple[str, ...] = (r"To Native ->\s+Preferences\s+get\b",),
            observed_patterns: dict[str, float] | None = None,
            previous_pid: int | None = None,
            metadata: dict[str, object] | None = None,
        ) -> str:
            text = f"{bundle_id}: {pty_pid}\n{body}"
            out_file.write_text(text, encoding="utf-8")
            reused = previous_pid is not None and pty_pid == previous_pid
            if observed_patterns is not None:
                for pat in ready_patterns:
                    if smoke.re.search(pat, text):
                        observed_patterns[pat] = 0.25
            if metadata is not None:
                metadata.update(
                    {
                        "previousPid": previous_pid,
                        "launchedPid": pty_pid,
                        "freshProcessLaunched": not reused,
                        "reusedRunningProcess": reused,
                        "captureDurationSeconds": 0.5,
                        "processExitCode": 0,
                    }
                )
            return text

        return fake_pty

    # (a) terminate times out, app is conclusively stopped and not crashed
    def test_terminate_timeout_recovers_when_postconditions_confirm_stopped(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            env = FakeSimulatorEnv(root_dir=tmpdir / "sim")

            def timeout_after_stopping(sim: FakeSimulatorEnv, args: list[str]) -> Exception:
                sim._stop_running_for_udid(args[3], args[4])
                return subprocess.TimeoutExpired(args, 30)

            env.queue_outcome("terminate", timeout_after_stopping)

            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 0)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "passed")
            self.assertEqual(env.create_count, 1)
            self.assertEqual(summary["infrastructureRetries"], [])
            self.assertEqual(
                summary["simctlPhase"]["terminate1Method"],
                "postcondition_verified_after_ambiguous_terminate",
            )
            self.assertNotEqual(
                summary["simctlPhase"]["initialPid"],
                summary["simctlPhase"]["relaunchPid"],
            )
            self.assertEqual(len(summary["postconditionResolutions"]), 1)
            self.assertEqual(
                summary["postconditionResolutions"][0]["verdict"],
                "conclusively_stopped",
            )

    # (a2) terminate timeout followed by retry ESRCH (exit 3) recovers once stopped;
    # first-attempt ESRCH without prior timeout fails immediately.
    def test_terminate_retry_esrch_recovers_only_after_ambiguous_attempt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence-ok"
            env = FakeSimulatorEnv(root_dir=tmpdir / "sim-ok")

            # Attempt 1: timeout while process is still alive; Attempt 2: app has stopped -> ESRCH (3)
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate"], 30))

            def esrch_after_stop(sim: FakeSimulatorEnv, args: list[str]) -> subprocess.CompletedProcess[str]:
                sim._stop_running_for_udid(args[3], args[4])
                return _completed(args, stderr="No such process", returncode=3)

            env.queue_outcome("terminate", esrch_after_stop)

            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "0",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 0)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(
                summary["postconditionResolutions"][0]["verdict"],
                "conclusively_stopped",
            )

            # Negative case: first-attempt ESRCH (app died prematurely before terminate was requested)
            evidence_bad = tmpdir / "evidence-bad"
            env_bad = FakeSimulatorEnv(root_dir=tmpdir / "sim-bad")
            env_bad.queue_outcome("terminate", esrch_after_stop)
            argv_bad = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_bad),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_bad),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_bad),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_bad = smoke.main()

            self.assertEqual(rc_bad, 1)
            self.assertEqual(env_bad.create_count, 1)

    # (b) terminate times out and app is still alive -> never classified as success
    def test_terminate_timeout_with_app_still_alive_fails_and_blocks_relaunch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            env = FakeSimulatorEnv(root_dir=tmpdir / "sim")

            # Both terminate attempts time out without stopping pid1.
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate"], 30))
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate"], 30))

            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "0",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 1)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "failed")
            self.assertIn("app_still_running", summary["error"])
            self.assertEqual(summary["postconditionResolutions"], [])
            # Relaunch must never have been attempted while pid1 was still alive.
            launch_calls = [c for c in env.calls if c[:3] == ["xcrun", "simctl", "launch"]]
            self.assertEqual(len(launch_calls), 1)

    # (b2) terminate_before_pty times out while pid2 is still alive -> blocks stale PTY launch (44230195240)
    def test_terminate_before_pty_timeout_still_alive_blocks_stale_pty_launch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            derived_data = tmpdir / "dd"
            env = FakeSimulatorEnv(root_dir=tmpdir / "sim")

            # First terminate (simctl_terminate_1) succeeds cleanly;
            # next two terminates (simctl_terminate_before_pty + retry) time out with pid2 still alive.
            env.queue_outcome("terminate", lambda sim, args: (sim._stop_running_for_udid(args[3], args[4]), _completed(args))[1])
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate"], 30))
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate"], 30))

            pty_mock = mock.Mock(side_effect=AssertionError("PTY launch must not run while pid2 is alive"))
            with (
                mock.patch.object(sys, "argv", self._full_run_argv(app_path, evidence_dir, derived_data, max_device_resets=0)),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke, "capture_console_pty_launch", pty_mock),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 1)
            pty_mock.assert_not_called()
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("simctl_terminate_before_pty", summary["error"])
            self.assertIn("app_still_running", summary["error"])

    # (c) PID reused or wrong identity (both during terminate timeout and during liveness verification)
    def test_pid_reused_or_wrong_identity_is_never_classified_as_success(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)

            # Subcase 1: terminate times out and PID 4321 is reused by an unrelated process
            evidence_term = tmpdir / "ev-term"
            env_term = FakeSimulatorEnv(root_dir=tmpdir / "sim-term")

            def timeout_and_reuse_pid(sim: FakeSimulatorEnv, args: list[str]) -> Exception:
                for pid, info in list(sim.running_processes.items()):
                    if info.get("udid") == args[3]:
                        sim.running_processes[pid] = {
                            "pid": pid,
                            "ppid": 1,
                            "stat": "Ss",
                            "etime": "00:01",
                            "comm": "/usr/sbin/unrelatedd",
                            "udid": "HOST",
                            "bundle_id": "com.apple.unrelatedd",
                        }
                return subprocess.TimeoutExpired(args, 30)

            env_term.queue_outcome("terminate", timeout_and_reuse_pid)
            env_term.queue_outcome("terminate", timeout_and_reuse_pid)
            argv_term = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_term),
                "--simctl-only",
                "--max-device-resets",
                "0",
            ]
            with (
                mock.patch.object(sys, "argv", argv_term),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_term),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_term = smoke.main()

            self.assertEqual(rc_term, 1)
            summary_term = json.loads((evidence_term / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("pid_reused_or_wrong_identity", summary_term["error"])

            # Subcase 2: during liveness check, ps shows PID 4321 belongs to an unrelated binary
            evidence_live = tmpdir / "ev-live"
            env_live = FakeSimulatorEnv(root_dir=tmpdir / "sim-live")
            env_live.ps_outcomes.append(
                _completed(["ps"], stdout="  4321     1 Ss   00:02 /usr/sbin/unrelatedd\n", returncode=0)
            )
            argv_live = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_live),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_live),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_live),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_live = smoke.main()

            self.assertEqual(rc_live, 1)
            self.assertEqual(env_live.create_count, 1)
            summary_live = json.loads((evidence_live / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("pid_reused_or_wrong_identity", summary_live["error"])

    # (d) identity evidence unavailable/ambiguous
    def test_unavailable_or_ambiguous_identity_evidence_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)

            # Subcase 1: terminate times out and ps -p fails with timeout/unavailable
            evidence_ps = tmpdir / "ev-ps"
            env_ps = FakeSimulatorEnv(root_dir=tmpdir / "sim-ps")
            env_ps.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate"], 30))
            env_ps.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate"], 30))
            # Let initial verify_pid_alive succeed (1 ps call), then fail the 2 terminate postcondition ps calls
            env_ps.ps_outcomes.append(
                _completed(
                    ["ps"],
                    stdout=f"  4321  5601 Rs   00:05 {tmpdir / 'sim-ps' / 'Devices' / 'UDID-1' / 'data' / 'Containers' / 'Bundle' / 'Application' / 'CONTAINER-1' / 'App.app' / 'App'}\n",
                    returncode=0,
                )
            )
            env_ps.ps_outcomes.append(subprocess.TimeoutExpired(["ps"], 15))
            env_ps.ps_outcomes.append(_completed(["ps"], stdout="garbage-unparseable-line\n", returncode=0))

            argv_ps = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_ps),
                "--simctl-only",
                "--max-device-resets",
                "0",
            ]
            with (
                mock.patch.object(sys, "argv", argv_ps),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_ps),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_ps = smoke.main()

            self.assertEqual(rc_ps, 1)
            summary_ps = json.loads((evidence_ps / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("identity_unavailable", summary_ps["error"])

            # Subcase 2: terminate times out, PID absent, but ps -axo process scan fails
            evidence_scan = tmpdir / "ev-scan"
            env_scan = FakeSimulatorEnv(root_dir=tmpdir / "sim-scan")

            def timeout_and_stop(sim: FakeSimulatorEnv, args: list[str]) -> Exception:
                sim._stop_running_for_udid(args[3], args[4])
                return subprocess.TimeoutExpired(args, 30)

            env_scan.queue_outcome("terminate", timeout_and_stop)
            env_scan.queue_outcome("terminate", timeout_and_stop)
            env_scan.ps_all_outcomes.append(subprocess.TimeoutExpired(["ps", "-axo"], 15))
            env_scan.ps_all_outcomes.append(_completed(["ps", "-axo"], stderr="permission denied", returncode=2))

            argv_scan = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_scan),
                "--simctl-only",
                "--max-device-resets",
                "0",
            ]
            with (
                mock.patch.object(sys, "argv", argv_scan),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_scan),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_scan = smoke.main()

            self.assertEqual(rc_scan, 1)
            summary_scan = json.loads((evidence_scan / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("identity_unavailable", summary_scan["error"])

            # Subcase 3: liveness check receives malformed ps output
            evidence_bad_ps = tmpdir / "ev-bad-ps"
            env_bad_ps = FakeSimulatorEnv(root_dir=tmpdir / "sim-bad-ps")
            env_bad_ps.ps_outcomes.append(_completed(["ps"], stdout="not-a-pid ???\n", returncode=0))
            argv_bad_ps = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_bad_ps),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_bad_ps),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_bad_ps),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_bad_ps = smoke.main()

            self.assertEqual(rc_bad_ps, 1)
            self.assertEqual(env_bad_ps.create_count, 1)
            summary_bad_ps = json.loads((evidence_bad_ps / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("Host process identity unavailable", summary_bad_ps["error"])

    # (e) launchctl hangs but independent app + current-render positive evidence succeeds
    def test_launchctl_hang_recovers_via_independent_app_and_fresh_render_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            derived_data = tmpdir / "dd"
            env = FakeSimulatorEnv(root_dir=tmpdir / "sim")

            # Spawn call 1: wait_for_simulator_ready (SpringBoard active) -> succeeds
            # Spawn calls 2 & 3: verify_pid_alive launchctl list initial + retry -> BOTH time out!
            env.queue_outcome(
                "spawn",
                _completed(["xcrun", "simctl", "spawn"], stdout="101\t0\tcom.apple.SpringBoard\n"),
            )
            env.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn", "launchctl"], 30))
            env.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn", "launchctl"], 30))

            with (
                mock.patch.object(sys, "argv", self._full_run_argv(app_path, evidence_dir, derived_data, max_device_resets=1)),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke, "capture_console_pty_launch", side_effect=self._healthy_pty_capture()),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 0)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "passed")
            self.assertEqual(env.create_count, 1)
            self.assertEqual(summary["infrastructureRetries"], [])
            self.assertEqual(
                summary["simctlPhase"]["initialVerificationMode"],
                "launchctl_stall_independent_fallback",
            )
            self.assertEqual(
                summary["simctlPhase"]["relaunchVerificationMode"],
                "launchctl_primary",
            )
            self.assertTrue(summary["simctlPhase"]["nativePreferencesGetObserved"])
            self.assertEqual(len(summary["postconditionResolutions"]), 1)
            self.assertEqual(
                summary["postconditionResolutions"][0]["verdict"],
                "independent_fallback_verified",
            )
            proc_evidence = (evidence_dir / "attempt-1" / "01-launch-process.txt").read_text(encoding="utf-8")
            self.assertIn("verification_mode=launchctl_stall_independent_fallback", proc_evidence)
            self.assertIn("bundle_id_verified=com.example.bibleberry.r20poc", proc_evidence)
            # Confirm XCUITest still ran on the same run
            xcuitest_calls = [c for c in env.calls if c[0] == "xcodebuild" and "test" in c]
            self.assertEqual(len(xcuitest_calls), 1)

    # (f) app exited or wrong bundle ID -> strict failure without device reset
    def test_app_exited_or_wrong_bundle_id_fails_strictly(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)

            # Subcase 1: wrong bundle ID in installed app's Info.plist
            wrong_app = self._make_fake_app(tmpdir / "wrong", bundle_id="com.example.wrong.bundle")
            ev_wrong = tmpdir / "ev-wrong"
            env_wrong = FakeSimulatorEnv(
                root_dir=tmpdir / "sim-wrong",
                installed_bundle_id="com.example.wrong.bundle",
            )
            argv_wrong = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(wrong_app),
                "--evidence-dir",
                str(ev_wrong),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_wrong),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_wrong),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_wrong = smoke.main()

            self.assertEqual(rc_wrong, 1)
            self.assertEqual(env_wrong.create_count, 1)
            summary_wrong = json.loads((ev_wrong / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("wrong_bundle_id", summary_wrong["error"])

            # Subcase 2: launchctl hangs, app exits during fallback screenshot -> must fail, not pass
            good_app = self._make_fake_app(tmpdir / "good")
            ev_exit = tmpdir / "ev-exit"
            env_exit = FakeSimulatorEnv(root_dir=tmpdir / "sim-exit")
            env_exit.queue_outcome(
                "spawn",
                _completed(["xcrun", "simctl", "spawn"], stdout="101\t0\tcom.apple.SpringBoard\n"),
            )
            env_exit.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn"], 30))
            env_exit.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn"], 30))

            def screenshot_then_app_dies(sim: FakeSimulatorEnv, args: list[str]) -> subprocess.CompletedProcess[str]:
                Path(args[5]).write_bytes(_valid_png_bytes())
                sim.running_processes.clear()
                return _completed(args)

            env_exit.queue_outcome("io", screenshot_then_app_dies)
            argv_exit = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(good_app),
                "--evidence-dir",
                str(ev_exit),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_exit),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_exit),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_exit = smoke.main()

            self.assertEqual(rc_exit, 1)
            self.assertEqual(env_exit.create_count, 1)
            summary_exit = json.loads((ev_exit / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("did not remain alive after fallback screenshot", summary_exit["error"])

    # (g) screenshot capture stalls or is stale -> never passes
    def test_launchctl_hang_with_stalled_or_stale_screenshot_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)

            # Subcase 1: launchctl hangs AND screenshot stalls -> fails (does not pass on ps alone)
            ev_stall = tmpdir / "ev-stall"
            env_stall = FakeSimulatorEnv(root_dir=tmpdir / "sim-stall")
            env_stall.queue_outcome(
                "spawn",
                _completed(["xcrun", "simctl", "spawn"], stdout="101\t0\tcom.apple.SpringBoard\n"),
            )
            env_stall.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn"], 30))
            env_stall.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn"], 30))
            env_stall.queue_outcome("io", subprocess.TimeoutExpired(["xcrun", "simctl", "io"], 30))
            env_stall.queue_outcome("io", subprocess.TimeoutExpired(["xcrun", "simctl", "io"], 30))

            argv_stall = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(ev_stall),
                "--simctl-only",
                "--max-device-resets",
                "0",
            ]
            with (
                mock.patch.object(sys, "argv", argv_stall),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_stall),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_stall = smoke.main()

            self.assertEqual(rc_stall, 1)
            summary_stall = json.loads((ev_stall / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("io", summary_stall["error"])

            # Subcase 2: launchctl hangs AND screenshot file has stale mtime -> immediate RuntimeError
            ev_stale = tmpdir / "ev-stale"
            env_stale = FakeSimulatorEnv(root_dir=tmpdir / "sim-stale")
            env_stale.queue_outcome(
                "spawn",
                _completed(["xcrun", "simctl", "spawn"], stdout="101\t0\tcom.apple.SpringBoard\n"),
            )
            env_stale.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn"], 30))
            env_stale.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn"], 30))

            def write_stale_screenshot(_sim: FakeSimulatorEnv, args: list[str]) -> subprocess.CompletedProcess[str]:
                shot = Path(args[5])
                shot.write_bytes(_valid_png_bytes())
                stale_ts = time.time() - 120.0
                os.utime(shot, (stale_ts, stale_ts))
                return _completed(args)

            env_stale.queue_outcome("io", write_stale_screenshot)
            argv_stale = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(ev_stale),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_stale),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_stale),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_stale = smoke.main()

            self.assertEqual(rc_stale, 1)
            self.assertEqual(env_stale.create_count, 1)
            summary_stale = json.loads((ev_stale / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("stale", summary_stale["error"])

    # (h) missing native Preferences marker with no independent bridge proof -> strict failure
    def test_missing_native_preferences_marker_and_reused_pty_pid_fail_strictly(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            derived_data = tmpdir / "dd"

            # Subcase 1: fresh PTY PID launched, WebView loaded, but NO Preferences.get marker
            ev_missing = tmpdir / "ev-missing"
            env_missing = FakeSimulatorEnv(root_dir=tmpdir / "sim-missing")
            with (
                mock.patch.object(sys, "argv", self._full_run_argv(app_path, ev_missing, derived_data, max_device_resets=1)),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_missing),
                mock.patch.object(
                    smoke,
                    "capture_console_pty_launch",
                    side_effect=self._healthy_pty_capture(pty_pid=9991, body="⚡️  WebView loaded\n"),
                ),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_missing = smoke.main()

            self.assertEqual(rc_missing, 1)
            self.assertEqual(env_missing.create_count, 1)
            summary_missing = json.loads((ev_missing / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("Preferences.get", summary_missing["error"])
            self.assertTrue((ev_missing / "attempt-1" / "02b-simctl-console-pty-logs.txt").is_file())

            # Subcase 2: PTY capture unexpectedly returns previous relaunch PID (reproducing 44230195240)
            ev_reused = tmpdir / "ev-reused"
            env_reused = FakeSimulatorEnv(root_dir=tmpdir / "sim-reused")
            with (
                mock.patch.object(sys, "argv", self._full_run_argv(app_path, ev_reused, derived_data, max_device_resets=1)),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_reused),
                mock.patch.object(
                    smoke,
                    "capture_console_pty_launch",
                    side_effect=self._healthy_pty_capture(pty_pid=5432, body=""),
                ),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_reused = smoke.main()

            self.assertEqual(rc_reused, 1)
            self.assertEqual(env_reused.create_count, 1)
            summary_reused = json.loads((ev_reused / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("reused already-running PID 5432", summary_reused["error"])
            self.assertTrue(summary_reused["simctlPhase"]["ptyCapture"]["reusedRunningProcess"])
            self.assertTrue((ev_reused / "attempt-1" / "02b-simctl-console-pty-logs.txt").is_file())

    def test_valid_preferences_marker_without_fresh_numeric_pty_pid_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            derived_data = tmpdir / "dd"

            # Subcases exercising the real capture_console_pty_launch() parser + full smoke.main()
            # with a valid Preferences.get marker but absent, non-numeric, or zero launch PID.
            payloads = [
                (
                    "missing-pid",
                    (
                        b"\xe2\x9a\xa1\xef\xb8\x8f  Loading app at capacitor://localhost...\n"
                        b"\xe2\x9a\xa1\xef\xb8\x8f  To Native ->  Preferences get 91791470\n"
                        b'\xe2\x9a\xa1\xef\xb8\x8f  TO JS {"value":null}\n'
                        b"\xe2\x9a\xa1\xef\xb8\x8f  WebView loaded\n"
                    ),
                ),
                (
                    "non-numeric-pid",
                    (
                        b"com.example.bibleberry.r20poc: not-a-pid\n"
                        b"\xe2\x9a\xa1\xef\xb8\x8f  To Native ->  Preferences get 91791471\n"
                        b'\xe2\x9a\xa1\xef\xb8\x8f  TO JS {"value":null}\n'
                        b"\xe2\x9a\xa1\xef\xb8\x8f  WebView loaded\n"
                    ),
                ),
                (
                    "zero-pid",
                    (
                        b"com.example.bibleberry.r20poc: 0\n"
                        b"\xe2\x9a\xa1\xef\xb8\x8f  To Native ->  Preferences get 91791472\n"
                        b'\xe2\x9a\xa1\xef\xb8\x8f  TO JS {"value":null}\n'
                        b"\xe2\x9a\xa1\xef\xb8\x8f  WebView loaded\n"
                    ),
                ),
            ]

            for label, payload in payloads:
                with self.subTest(case=label):
                    ev_dir = tmpdir / f"ev-{label}"
                    env = FakeSimulatorEnv(root_dir=tmpdir / f"sim-{label}")
                    clock = {"now": 0.0}
                    chunks = iter([payload])

                    def fake_select(
                        read_fds: list[int],
                        _write_fds: object,
                        _error_fds: object,
                        _timeout: float,
                        clock_ref: dict[str, float] = clock,
                    ) -> tuple[list[int], list[int], list[int]]:
                        clock_ref["now"] += 0.5
                        return (read_fds if clock_ref["now"] == 0.5 else [], [], [])

                    def fake_read(_fd: int, _n: int, chunk_iter: object = chunks) -> bytes:
                        return next(chunk_iter, b"")  # type: ignore[arg-type]

                    proc = mock.Mock()
                    proc.poll.return_value = 0

                    with (
                        mock.patch.object(sys, "argv", self._full_run_argv(app_path, ev_dir, derived_data, max_device_resets=1)),
                        mock.patch.object(smoke.subprocess, "run", side_effect=env),
                        mock.patch.object(smoke.subprocess, "Popen", return_value=proc),
                        mock.patch.object(smoke.select, "select", side_effect=fake_select),
                        mock.patch.object(smoke.os, "read", side_effect=fake_read),
                        mock.patch.object(smoke.time, "monotonic", side_effect=lambda c=clock: c["now"]),
                        mock.patch.object(smoke.time, "sleep"),
                        mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
                    ):
                        rc = smoke.main()

                    self.assertEqual(rc, 1)
                    self.assertEqual(env.create_count, 1)
                    summary = json.loads((ev_dir / "summary.json").read_text(encoding="utf-8"))
                    self.assertEqual(summary["status"], "failed")
                    self.assertEqual(summary["infrastructureRetries"], [])
                    self.assertIsNone(summary["simctlPhase"]["ptyLaunchPid"])
                    self.assertFalse(summary["simctlPhase"]["ptyCapture"]["freshProcessLaunched"])
                    self.assertFalse(summary["simctlPhase"]["ptyCapture"]["reusedRunningProcess"])
                    self.assertNotIn("nativePreferencesGetObserved", summary["simctlPhase"])
                    self.assertIn("did not report a valid fresh numeric PID", summary["error"])
                    self.assertNotIn("reused already-running PID", summary["error"])
                    self.assertTrue((ev_dir / "attempt-1" / "02b-simctl-console-pty.log").is_file())
                    self.assertTrue((ev_dir / "attempt-1" / "02b-simctl-console-pty-logs.txt").is_file())
                    xcuitest_calls = [c for c in env.calls if c[0] == "xcodebuild" and "test" in c]
                    self.assertEqual(xcuitest_calls, [])

            # Subcase 4: valid Preferences marker with stale initial launch PID (pid1 = 4321) fails explicitly
            ev_stale_pid1 = tmpdir / "ev-stale-pid1"
            env_stale_pid1 = FakeSimulatorEnv(root_dir=tmpdir / "sim-stale-pid1")
            with (
                mock.patch.object(sys, "argv", self._full_run_argv(app_path, ev_stale_pid1, derived_data, max_device_resets=1)),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_stale_pid1),
                mock.patch.object(
                    smoke,
                    "capture_console_pty_launch",
                    side_effect=self._healthy_pty_capture(pty_pid=4321),
                ),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_stale = smoke.main()

            self.assertEqual(rc_stale, 1)
            self.assertEqual(env_stale_pid1.create_count, 1)
            summary_stale = json.loads((ev_stale_pid1 / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("stale initial PID 4321", summary_stale["error"])
            self.assertTrue((ev_stale_pid1 / "attempt-1" / "02b-simctl-console-pty-logs.txt").is_file())

    # (i) crash evidence blocks both terminate postcondition recovery and launchctl fallback
    def test_crash_evidence_blocks_terminate_and_launchctl_recovery(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)

            # Subcase 1: terminate times out and PID is absent, BUT a new crash report exists -> fail immediately
            ev_term = tmpdir / "ev-crash-term"
            env_term = FakeSimulatorEnv(root_dir=tmpdir / "sim-crash-term")
            crash_state = {"reports": []}

            def timeout_and_crash(sim: FakeSimulatorEnv, args: list[str]) -> Exception:
                sim._stop_running_for_udid(args[3], args[4])
                crash_state["reports"] = ["App-2026-11-19-0001.ips"]
                return subprocess.TimeoutExpired(args, 30)

            env_term.queue_outcome("terminate", timeout_and_crash)
            argv_term = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(ev_term),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_term),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_term),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", side_effect=lambda _t: list(crash_state["reports"])),
            ):
                rc_term = smoke.main()

            self.assertEqual(rc_term, 1)
            self.assertEqual(env_term.create_count, 1)
            summary_term = json.loads((ev_term / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("App-2026-11-19-0001.ips", summary_term["error"])
            self.assertEqual(summary_term["infrastructureRetries"], [])

            # Subcase 2: launchctl hangs and crash report appears -> fail immediately, no fallback or reset
            ev_lctl = tmpdir / "ev-crash-lctl"
            env_lctl = FakeSimulatorEnv(root_dir=tmpdir / "sim-crash-lctl")
            lctl_crashes = {"reports": []}
            env_lctl.queue_outcome(
                "spawn",
                _completed(["xcrun", "simctl", "spawn"], stdout="101\t0\tcom.apple.SpringBoard\n"),
            )

            def launchctl_timeout_with_crash(_sim: FakeSimulatorEnv, args: list[str]) -> Exception:
                lctl_crashes["reports"] = ["App-2026-11-19-0002.ips"]
                return subprocess.TimeoutExpired(args, 30)

            env_lctl.queue_outcome("spawn", launchctl_timeout_with_crash)
            env_lctl.queue_outcome("spawn", launchctl_timeout_with_crash)
            argv_lctl = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(ev_lctl),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_lctl),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_lctl),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", side_effect=lambda _t: list(lctl_crashes["reports"])),
            ):
                rc_lctl = smoke.main()

            self.assertEqual(rc_lctl, 1)
            self.assertEqual(env_lctl.create_count, 1)
            summary_lctl = json.loads((ev_lctl / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("App-2026-11-19-0002.ips", summary_lctl["error"])

    # (j) true XCUITest failure -> fails immediately without retry or device reset
    def test_true_xcuitest_failure_fails_immediately_without_device_reset(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            derived_data = tmpdir / "dd"
            env = FakeSimulatorEnv(root_dir=tmpdir / "sim")
            env.xcuitest_outcomes.append(
                _completed(
                    ["xcodebuild", "test"],
                    stdout="Test Case 'testBundledReaderLaunchLifecycleAndRestart' failed.\n",
                    stderr="XCTAssertTrue failed: Onboarding Continue button not rendered\n",
                    returncode=65,
                )
            )

            with (
                mock.patch.object(sys, "argv", self._full_run_argv(app_path, evidence_dir, derived_data, max_device_resets=1)),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke, "capture_console_pty_launch", side_effect=self._healthy_pty_capture()),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 1)
            self.assertEqual(env.create_count, 1)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "failed")
            self.assertIn("exit code 65", summary["error"])
            self.assertEqual(summary["infrastructureRetries"], [])
            self.assertIn(
                "Onboarding Continue button not rendered",
                (evidence_dir / "attempt-1" / "03-xcuitest-stderr.log").read_text(encoding="utf-8"),
            )

    # (k) exhaustion of retries and device reset preserves original error despite cleanup timeouts
    def test_exhausted_terminate_retries_and_device_reset_preserves_original_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            env = FakeSimulatorEnv(root_dir=tmpdir / "sim")

            # Device 1: terminate times out twice with app still alive -> cleanup -> device reset to UDID-2
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate", "UDID-1"], 30))
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate", "UDID-1"], 30))
            # Device 1 cleanup terminate succeeds
            env.queue_outcome("terminate", lambda sim, args: (sim._stop_running_for_udid(args[3], args[4]), _completed(args))[1])
            # Device 2: terminate times out twice with app still alive -> resets exhausted!
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate", "UDID-2"], 30))
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate", "UDID-2"], 30))
            # Device 2 cleanup commands ALL time out -> must NOT mask original error!
            env.queue_outcome("terminate", subprocess.TimeoutExpired(["xcrun", "simctl", "terminate", "cleanup"], 30))
            env.queue_outcome("shutdown", _completed(["xcrun", "simctl", "shutdown"]))  # Device 1 cleanup shutdown
            env.queue_outcome("shutdown", subprocess.TimeoutExpired(["xcrun", "simctl", "shutdown", "cleanup"], 30))
            env.queue_outcome("delete", _completed(["xcrun", "simctl", "delete"]))  # Device 1 cleanup delete
            env.queue_outcome("delete", subprocess.TimeoutExpired(["xcrun", "simctl", "delete", "cleanup"], 30))

            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 1)
            self.assertEqual(env.create_count, 2)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary["status"], "failed")
            self.assertEqual(summary["udid"], "UDID-2")
            self.assertEqual(len(summary["infrastructureRetries"]), 1)
            self.assertEqual(summary["infrastructureRetries"][0]["udid"], "UDID-1")
            self.assertIn("simctl_terminate_1", summary["error"])
            self.assertIn("app_still_running", summary["error"])
            self.assertIn("timed out", summary["error"])
            self.assertEqual(len(summary["cleanup"]), 2)
            self.assertTrue(summary["cleanup"][1]["terminate"]["timedOut"])
            self.assertTrue(summary["cleanup"][1]["shutdown"]["timedOut"])
            self.assertTrue(summary["cleanup"][1]["delete"]["timedOut"])

    def test_console_pty_capture_detects_reused_previous_pid_early(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "02b-simctl-console-pty.log"
            current_time = 0.0
            reads = iter([b"com.example.bibleberry.r20poc: 9462\n"])

            def advance_select(
                read_fds: list[int], _write_fds: object, _error_fds: object, _timeout: float
            ) -> tuple[list[int], list[int], list[int]]:
                nonlocal current_time
                current_time += 0.5
                return (read_fds if current_time == 0.5 else [], [], [])

            def fake_read(_fd: int, _n: int) -> bytes:
                return next(reads, b"")

            process = mock.Mock()
            process.poll.return_value = 0
            metadata: dict[str, object] = {}
            with (
                mock.patch.object(smoke.subprocess, "Popen", return_value=process),
                mock.patch.object(smoke.select, "select", side_effect=advance_select),
                mock.patch.object(smoke.os, "read", side_effect=fake_read),
                mock.patch.object(smoke, "run_cmd_best_effort", return_value={}),
                mock.patch.object(smoke.time, "monotonic", side_effect=lambda: current_time),
            ):
                output = smoke.capture_console_pty_launch(
                    "U1",
                    "com.example.bibleberry.r20poc",
                    output_path,
                    duration_s=60.0,
                    previous_pid=9462,
                    metadata=metadata,
                )

            self.assertEqual(output, "com.example.bibleberry.r20poc: 9462\n")
            self.assertEqual(metadata["launchedPid"], 9462)
            self.assertTrue(metadata["reusedRunningProcess"])
            self.assertFalse(metadata["freshProcessLaunched"])
            # Must exit early (~1.5s) instead of waiting the full 60s budget
            self.assertLess(float(metadata["captureDurationSeconds"]), 10.0)

    def test_launchctl_fallback_rejects_ppid_change_non_png_and_shutdown_device(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)

            # Subcase 1: ppid changes during launchctl stall -> immediate RuntimeError
            ev_ppid = tmpdir / "ev-ppid"
            env_ppid = FakeSimulatorEnv(root_dir=tmpdir / "sim-ppid")
            env_ppid.queue_outcome(
                "spawn",
                _completed(["xcrun", "simctl", "spawn"], stdout="101\t0\tcom.apple.SpringBoard\n"),
            )

            def stall_and_change_ppid(sim: FakeSimulatorEnv, args: list[str]) -> Exception:
                for info in sim.running_processes.values():
                    info["ppid"] = 99999
                return subprocess.TimeoutExpired(args, 30)

            env_ppid.queue_outcome("spawn", stall_and_change_ppid)
            env_ppid.queue_outcome("spawn", stall_and_change_ppid)
            argv_ppid = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(ev_ppid),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_ppid),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_ppid),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_ppid = smoke.main()

            self.assertEqual(rc_ppid, 1)
            self.assertEqual(env_ppid.create_count, 1)
            summary_ppid = json.loads((ev_ppid / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("parent PID changed", summary_ppid["error"])

            # Subcase 2: corrupt non-PNG screenshot during fallback -> immediate RuntimeError
            ev_png = tmpdir / "ev-png"
            env_png = FakeSimulatorEnv(root_dir=tmpdir / "sim-png")
            env_png.queue_outcome(
                "spawn",
                _completed(["xcrun", "simctl", "spawn"], stdout="101\t0\tcom.apple.SpringBoard\n"),
            )
            env_png.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn"], 30))
            env_png.queue_outcome("spawn", subprocess.TimeoutExpired(["xcrun", "simctl", "spawn"], 30))
            env_png.queue_outcome(
                "io",
                lambda _sim, args: (Path(args[5]).write_bytes(b"NOT_A_PNG" * 300), _completed(args))[1],
            )
            argv_png = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(ev_png),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv_png),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_png),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_png = smoke.main()

            self.assertEqual(rc_png, 1)
            self.assertEqual(env_png.create_count, 1)
            summary_png = json.loads((ev_png / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("valid PNG header", summary_png["error"])

            # Subcase 3: simulator transitions to Shutdown during launchctl stall -> fails closed
            ev_shut = tmpdir / "ev-shut"
            env_shut = FakeSimulatorEnv(root_dir=tmpdir / "sim-shut")
            env_shut.queue_outcome(
                "spawn",
                _completed(["xcrun", "simctl", "spawn"], stdout="101\t0\tcom.apple.SpringBoard\n"),
            )

            def stall_and_shutdown(sim: FakeSimulatorEnv, args: list[str]) -> Exception:
                sim.device_states[args[3]] = "Shutdown"
                return subprocess.TimeoutExpired(args, 30)

            env_shut.queue_outcome("spawn", stall_and_shutdown)
            env_shut.queue_outcome("spawn", stall_and_shutdown)
            argv_shut = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(ev_shut),
                "--simctl-only",
                "--max-device-resets",
                "0",
            ]
            with (
                mock.patch.object(sys, "argv", argv_shut),
                mock.patch.object(smoke.subprocess, "run", side_effect=env_shut),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc_shut = smoke.main()

            self.assertEqual(rc_shut, 1)
            summary_shut = json.loads((ev_shut / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("Shutdown", summary_shut["error"])

    def test_terminate_exit_zero_still_fails_if_app_remains_alive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            app_path = self._make_fake_app(tmpdir)
            evidence_dir = tmpdir / "evidence"
            env = FakeSimulatorEnv(root_dir=tmpdir / "sim")

            # simctl terminate returns 0 without actually stopping the process!
            env.queue_outcome("terminate", lambda _sim, args: _completed(args, returncode=0))
            argv = [
                "ios-simulator-smoke.py",
                "--app-path",
                str(app_path),
                "--evidence-dir",
                str(evidence_dir),
                "--simctl-only",
                "--max-device-resets",
                "1",
            ]
            with (
                mock.patch.object(sys, "argv", argv),
                mock.patch.object(smoke.subprocess, "run", side_effect=env),
                mock.patch.object(smoke.time, "sleep"),
                mock.patch.object(smoke, "find_new_app_crashes", return_value=[]),
            ):
                rc = smoke.main()

            self.assertEqual(rc, 1)
            self.assertEqual(env.create_count, 1)
            summary = json.loads((evidence_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertIn("still running after simctl_terminate_1", summary["error"])


if __name__ == "__main__":
    unittest.main()
