# Candidate runner image: Python + pytest only. Runs untrusted candidate code,
# so it carries nothing else. Isolation comes from the docker run flags in
# sandbox-check.sh (no network, read-only root, limits); this image only fixes
# the toolchain and the non-root user.
#
# Versions match src/backend/pyproject.toml + uv.lock (K1) so the sandbox and
# Karthik's local stand-in grade with the same Python and pytest.
# Multi-arch base: builds on amd64 and arm64 (Apple Silicon) unchanged.
ARG PYTHON_VERSION=3.13
FROM python:${PYTHON_VERSION}-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN pip install --no-deps \
        pytest==9.2.0 \
        pluggy==1.7.0 \
        iniconfig==2.3.1 \
        packaging==26.3 \
        pygments==2.21.0 \
    && python -m pytest --version \
    && useradd --uid 10001 --user-group --no-create-home --home-dir /tmp --shell /usr/sbin/nologin runner

# The root filesystem is mounted read-only at run time; /tmp is a size-capped tmpfs.
ENV HOME=/tmp
WORKDIR /work
USER 10001:10001

CMD ["python", "-m", "pytest", "--version"]
