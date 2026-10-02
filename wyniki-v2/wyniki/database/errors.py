"""Failures of the database itself, as opposed to a missing row."""


class StorageError(Exception):
    """The write or read failed. Callers must not report this as 'not found'."""
