#!/usr/bin/env python3
"""Create and verify a fresh SQLite online backup without writing to source."""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "db" / "custom.db"
DB_DIR = ROOT / "db"


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def read_only_connection(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)


def canonical_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"bytes_hex": value.hex()}
    return value


def table_snapshot(connection: sqlite3.Connection, table: str) -> dict[str, Any]:
    pragma_rows = connection.execute(
        f"PRAGMA table_info({quote_identifier(table)})"
    ).fetchall()
    columns = [row[1] for row in pragma_rows]
    primary_key = [row[1] for row in sorted(pragma_rows, key=lambda item: item[5]) if row[5]]
    order_columns = primary_key or columns
    order_sql = ", ".join(quote_identifier(column) for column in order_columns)
    select_sql = f"SELECT * FROM {quote_identifier(table)} ORDER BY {order_sql}"
    rows = connection.execute(select_sql).fetchall()

    digest = hashlib.sha256()
    ids: list[Any] = []
    for row in rows:
        normalized = [canonical_value(value) for value in row]
        digest.update(
            json.dumps(normalized, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        )
        digest.update(b"\n")
        if primary_key:
            positions = [columns.index(key) for key in primary_key]
            ids.append([canonical_value(row[position]) for position in positions])

    return {
        "rowCount": len(rows),
        "columns": columns,
        "primaryKey": primary_key,
        "idsSha256": hashlib.sha256(
            json.dumps(ids, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "rowsSha256": digest.hexdigest(),
    }


def database_snapshot(path: Path) -> dict[str, Any]:
    with closing(read_only_connection(path)) as connection:
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
        ]
        return {
            "integrityCheck": [row[0] for row in connection.execute("PRAGMA integrity_check")],
            "foreignKeyIssues": [list(row) for row in connection.execute("PRAGMA foreign_key_check")],
            "tables": {table: table_snapshot(connection, table) for table in tables},
        }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    if not SOURCE.is_file():
        raise SystemExit(f"Live SQLite database not found: {SOURCE}")
    DB_DIR.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = DB_DIR / f"custom_pre_pg_migration_{stamp}.db"
    report = DB_DIR / f"custom_pre_pg_migration_{stamp}.verification.json"

    # Reserve a never-before-used destination. Never open an existing backup for write.
    reservation = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(reservation)

    try:
        with closing(read_only_connection(SOURCE)) as source, closing(
            sqlite3.connect(backup, timeout=30)
        ) as target:
            source.backup(target, pages=1024, sleep=0.05)
            target.commit()

        source_state = database_snapshot(SOURCE)
        backup_state = database_snapshot(backup)
        matches = source_state["tables"] == backup_state["tables"]

        verification = {
            "createdAtUtc": datetime.now(timezone.utc).isoformat(),
            "source": str(SOURCE.relative_to(ROOT)),
            "backup": str(backup.relative_to(ROOT)),
            "backupSha256": sha256_file(backup),
            "sourceSnapshot": source_state,
            "backupSnapshot": backup_state,
            "sourceAndBackupRowsMatch": matches,
            "verified": (
                matches
                and backup_state["integrityCheck"] == ["ok"]
                and not backup_state["foreignKeyIssues"]
            ),
        }
        report.write_text(json.dumps(verification, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps(verification, indent=2, ensure_ascii=False))
        return 0 if verification["verified"] else 2
    except Exception:
        # Keep a failed, uniquely named artifact for inspection. Never remove or overwrite it.
        raise


if __name__ == "__main__":
    raise SystemExit(main())
