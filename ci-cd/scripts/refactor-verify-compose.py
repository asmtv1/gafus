#!/usr/bin/env python3
"""Validate production compose shape with synthetic values; no real secrets."""
from pathlib import Path
import os
import re
import subprocess
import sys

root = Path("/Users/asmtv1/Desktop/gafus-refactor")
# The script also runs from an ephemeral checkout in GitHub Actions.
if not Path("ci-cd/docker/docker-compose.prod.yml").is_file():
    sys.exit("Missing production compose input")
source = Path("ci-cd/docker/docker-compose.prod.yml").read_text()
keys = set(re.findall(r"\$\{([A-Za-z_][A-Za-z_0-9]*)", source))
env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
       "HOME": os.environ.get("HOME", "/tmp")}
for key in keys:
    value = "synthetic-ci-placeholder"
    if "PORT" in key:
        value = "3001"
    if "PATH" in key or "FILE" in key:
        value = "/tmp/gafus-refactor-synthetic-value"
    if "URL" in key or ("HOST" in key and "PATH" not in key):
        value = "https://invalid.example"
    if key.endswith(("UID", "GID")):
        value = "1000"
    env[key] = value
command = ["docker", "compose", "--env-file", "/dev/null", "-f",
           "ci-cd/docker/docker-compose.prod.yml", "config",
           "--no-env-resolution", "--quiet"]
try:
    result = subprocess.run(command, env=env, capture_output=True,
                            text=True, timeout=45, check=False)
except (OSError, subprocess.TimeoutExpired):
    sys.exit("Compose CLI missing or synthetic config validation timed out")
if result.returncode:
    # No raw errors printed: Compose may include values of environment strings.
    sys.exit("Production Compose syntax FAILED with synthetic-only environment")
print(f"Production Compose syntax PASS (synthetic variables: {len(keys)}; no secrets or deployment)")
