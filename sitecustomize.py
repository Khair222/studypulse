"""Compatibility shim for the local Python 3.13 packaging toolchain."""
import setuptools  # noqa: F401

# The installed packaging release expects ``extra`` to be supplied by callers.
# PyInstaller's gevent hook does not supply it, so use the standard empty value.
import packaging.markers as _markers

_original_default_environment = _markers.default_environment


def _default_environment_with_extra():
    environment = _original_default_environment()
    environment.setdefault("extra", "")
    return environment


_markers.default_environment = _default_environment_with_extra
