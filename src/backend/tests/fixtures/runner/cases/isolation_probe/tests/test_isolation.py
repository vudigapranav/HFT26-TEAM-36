"""Trusted probe tests: each passes only if the sandbox blocks the action."""
import os
import socket

import pytest


def test_runs_as_non_root():
    assert os.getuid() == 10001


def test_no_outbound_network():
    with pytest.raises(OSError):
        socket.create_connection(("1.1.1.1", 80), timeout=2)


def test_no_dns():
    with pytest.raises(OSError):
        socket.getaddrinfo("example.com", 80)


def test_root_filesystem_read_only():
    with pytest.raises(OSError):
        open("/etc/torquecode-probe", "w")


def test_workspace_read_only():
    with pytest.raises(OSError):
        open("/work/probe.txt", "w")


def test_tests_cannot_be_deleted():
    with pytest.raises(OSError):
        os.remove("/work/tests/test_visible.py")


def test_tmp_is_writable():
    with open("/tmp/probe.txt", "w") as handle:
        handle.write("ok")


def test_no_secrets_in_environment():
    # GPG_KEY is set by the official python base image (public release-signing key id).
    leaked = [name for name in os.environ if name != "GPG_KEY"
              and any(word in name.upper() for word in ("KEY", "TOKEN", "SECRET", "PASSWORD"))]
    assert leaked == []
