"""Unit tests for scripts/ios-simulator-smoke.py cleanup safety, readiness, and retries."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "ios-simulator-smoke.py"

SPEC = importlib.util.spec_from_file_location("ios_simulator_smoke", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
smoke = importlib.util.module_from_spec(SPEC)
sys.modules["ios_simulator_smoke"] = smoke
SPEC.loader.exec_module(smoke)


def _completed(args: list[str], stdout: str = "", stderr: str = "", returncode: int = 0) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(args=args, returncode=returncode, stdout=stdout, stderr=stderr)


class FakeSimulatorEnv:
    """Configurable mock for subprocess.run in ios-simulator-smoke.py tests."""

    def __init__(self, *, simctl_only: bool = True) -> None:
        self.simctl_only = simctl_only
        self.create_count = 0
        self.calls: list[list[str]] = []
        self.fail_on_subcmd: dict[str, list[Exception | subprocess.CompletedProcess[str]]] = {}

    def queue_outcome(self, subcmd: str, outcome: Exception | subprocess.CompletedProcess[str]) -> None:
        self.fail_on_subcmd.setdefault(subcmd, []).append(outcome)

    def __call__(self, args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        self.calls.append(list(args))
        check = bool(kwargs.get("check", True))

        if args[0] == "uname":
            return _completed(args, stdout="arm64\n")
        if args[0] == "sw_vers":
            return _completed(args, stdout="26.4\n")
        if args[0] == "xcodebuild" and "-version" in args:
            return _completed(args, stdout="Xcode 26.4.1\nBuild version 17E202\n")
        if args[0] == "lipo":
            return _completed(args, stdout="Non-fat file: App is architecture: arm64\n")
        if args[0] == "ps":
            if "-o" in args:
                return _completed(args, stdout="  4321     1 S    00:05 App\n")
            return _completed(args, returncode=1)

        if args[:2] == ["xcrun", "simctl"]:
            subcmd = args[2]
            if subcmd in self.fail_on_subcmd and self.fail_on_subcmd[subcmd]:
                outcome = self.fail_on_subcmd[subcmd].pop(0)
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
                udid = f"UDID-{max(1, self.create_count)}"
                return _completed(
                    args,
                    stdout=json.dumps(
                        {
                            "devices": {
                                "com.apple.CoreSimulator.SimRuntime.iOS-26-4": [
                                    {"udid": udid, "state": "Booted", "name": "iPhone 17"}
                                ]
                            }
                        }
                    ),
                )
            if subcmd == "create":
                self.create_count += 1
                return _completed(args, stdout=f"UDID-{self.create_count}\n")
            if subcmd in {"boot", "bootstatus", "install", "terminate", "shutdown", "delete", "uninstall"}:
                return _completed(args)
            if subcmd == "get_app_container":
                return _completed(args, stdout="/tmp/App.app\n")
            if subcmd == "launch":
                pid = 4321 if len([c for c in self.calls if c[:3] == ["xcrun", "simctl", "launch"]]) == 1 else 5432
                return _completed(args, stdout=f"com.example.bibleberry.r20poc: {pid}\n")
            if subcmd == "spawn":
                if args[4:6] == ["launchctl", "list"]:
                    return _completed(
                        args,
                        stdout=(
                            "101\t0\tcom.apple.SpringBoard\n"
                            "4321\t0\tUIKitApplication:com.example.bibleberry.r20poc[1234]\n"
                            "5432\t0\tUIKitApplication:com.example.bibleberry.r20poc[5678]\n"
                        ),
                    )
                if args[4:6] == ["log", "show"]:
                    return _completed(args, stdout="sample log\n")
            if subcmd == "io" and len(args) > 4 and args[4] == "screenshot":
                shot_path = Path(args[5])
                shot_path.write_bytes(b"PNG" + b"\x00" * 2048)
                return _completed(args)

        return _completed(args)


class TestIosSimulatorSmoke(unittest.TestCase):
    def _make_fake_app(self, tmpdir: Path) -> Path:
        app_path = tmpdir / "App.app"
        app_path.mkdir(parents=True)
        (app_path / "App").write_bytes(b"\x00")
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


if __name__ == "__main__":
    unittest.main()
