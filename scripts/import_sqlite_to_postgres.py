#!/usr/bin/env python3
"""Validate or atomically import a verified SQLite backup into empty PostgreSQL.

Dry-run is the default and does not connect to PostgreSQL. Import mode requires
an explicit environment gate, DIRECT_URL, and psycopg 3.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from backup_sqlite_online import database_snapshot, quote_identifier, sha256_file


ROOT = Path(__file__).resolve().parents[1]
TABLE_ORDER = ["User", "Product", "Block", "Verification"]
BOOL_COLUMNS = {"isVerified", "isAuthentic", "isActive"}
DATETIME_COLUMNS = {"createdAt", "updatedAt"}
ZERO_HASH = "0" * 64


def read_only_connection(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)


def table_data(connection: sqlite3.Connection, table: str) -> tuple[list[str], list[dict[str, Any]], dict[str, str], list[str]]:
    info = connection.execute(f"PRAGMA table_info({quote_identifier(table)})").fetchall()
    columns = [row[1] for row in info]
    types = {row[1]: (row[2] or "").upper() for row in info}
    primary_key = [row[1] for row in sorted(info, key=lambda item: item[5]) if row[5]]
    order_columns = primary_key or columns
    order_sql = ", ".join(quote_identifier(column) for column in order_columns)
    rows = connection.execute(
        f"SELECT * FROM {quote_identifier(table)} ORDER BY {order_sql}"
    ).fetchall()
    return columns, [dict(zip(columns, row)) for row in rows], types, primary_key


def json_sha256(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def parse_utc(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        parsed = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=int(value))
    elif isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).replace("Z", "+00:00")
        if " " in text and "T" not in text:
            text = text.replace(" ", "T", 1)
        parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalized_value(value: Any, column: str, declared_type: str) -> Any:
    if value is None:
        return None
    if column in BOOL_COLUMNS:
        return bool(value)
    if column in DATETIME_COLUMNS or "DATE" in declared_type or "TIME" in declared_type:
        return parse_utc(value).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if isinstance(value, bytes):
        return {"bytes_hex": value.hex()}
    return value


def normalized_rows_digest(rows: list[dict[str, Any]], columns: list[str], types: dict[str, str]) -> str:
    digest = hashlib.sha256()
    for row in rows:
        normalized = [normalized_value(row[column], column, types.get(column, "")) for column in columns]
        digest.update(json.dumps(normalized, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def product_fingerprint(product: dict[str, Any]) -> str:
    canonical = {
        "name": product["name"],
        "category": product["category"],
        "manufacturer": product["manufacturer"],
        "batchNo": product["batchNo"],
        "description": product["description"],
        "qrCode": product["qrCode"],
    }
    return json_sha256(canonical)


def block_hash(block: dict[str, Any]) -> str:
    canonical = {
        "index": block["index"],
        "timestamp": block["timestamp"],
        "productId": block["productId"],
        "productName": block["productName"],
        "previousHash": block["previousHash"],
        "nonce": block["nonce"],
        "data": block["data"],
    }
    return json_sha256(canonical)


def verify_ledger(products: list[dict[str, Any]], blocks: list[dict[str, Any]]) -> None:
    if not blocks:
        raise ValueError("Ledger has no genesis block")
    by_id = {product["id"]: product for product in products}
    seen_products: set[str] = set()
    previous_hash = ZERO_HASH

    for expected_index, block in enumerate(blocks):
        if block["index"] != expected_index:
            raise ValueError(f"Block index gap or duplicate at position {expected_index}")
        try:
            parse_utc(block["timestamp"])
        except (TypeError, ValueError) as error:
            raise ValueError(f"Invalid timestamp at block {expected_index}") from error
        if block["previousHash"] != previous_hash:
            raise ValueError(f"Broken previous-hash reference at block {expected_index}")
        if block["hash"] != block_hash(block):
            raise ValueError(f"Stored block hash does not match block {expected_index}")

        try:
            payload = json.loads(block["data"])
        except (TypeError, json.JSONDecodeError) as error:
            raise ValueError(f"Invalid JSON payload at block {expected_index}") from error
        if not isinstance(payload, dict):
            raise ValueError(f"Invalid payload structure at block {expected_index}")
        if payload.get("productId") != block["productId"] or payload.get("productName") != block["productName"]:
            raise ValueError(f"Block payload identity mismatch at block {expected_index}")

        if expected_index == 0:
            if (
                block["productId"] != "genesis"
                or block["productName"] != "Genesis Block - Chain Origin"
                or payload.get("type") != "genesis"
                or block["previousHash"] != ZERO_HASH
            ):
                raise ValueError("Genesis block is invalid")
        else:
            product = by_id.get(block["productId"])
            if product is None:
                raise ValueError(f"Block {expected_index} references a missing product")
            if block["productId"] in seen_products:
                raise ValueError(f"Product {block['productId']} has duplicate ledger records")
            seen_products.add(block["productId"])
            expected_payload = {
                "productId": product["id"],
                "productName": product["name"],
                "qrCode": product["qrCode"],
                "batchNo": product["batchNo"],
                "manufacturer": product["manufacturer"],
                "category": product["category"],
                "description": product["description"],
                "blockchainHash": product["blockchainHash"],
            }
            if any(payload.get(key) != value for key, value in expected_payload.items()):
                raise ValueError(f"Product-to-ledger payload mismatch for product {product['id']}")
            if product["blockchainHash"] != product_fingerprint(product):
                raise ValueError(f"Product fingerprint mismatch for product {product['id']}")

        previous_hash = block["hash"]

    if len(seen_products) != len(products):
        raise ValueError("Product count does not match non-genesis ledger records")


def validate_backup(backup: Path) -> tuple[dict[str, Any], dict[str, tuple[list[str], list[dict[str, Any]], dict[str, str], list[str]]]]:
    backup = backup.resolve()
    expected_dir = (ROOT / "db").resolve()
    if backup.parent != expected_dir or not backup.name.startswith("custom_pre_pg_migration_") or backup.suffix != ".db":
        raise ValueError("Backup must be a custom_pre_pg_migration_*.db file directly under db/")
    report_path = backup.with_suffix(".verification.json")
    if not report_path.is_file():
        raise ValueError("Verified backup report is missing")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if not report.get("verified") or report.get("backupSha256") != sha256_file(backup):
        raise ValueError("Backup report is invalid or no longer matches the backup file")

    state = database_snapshot(backup)
    if state["integrityCheck"] != ["ok"] or state["foreignKeyIssues"]:
        raise ValueError("Backup integrity or foreign-key checks failed")
    if set(TABLE_ORDER) - set(state["tables"]):
        raise ValueError("Backup is missing one or more application tables")

    data: dict[str, tuple[list[str], list[dict[str, Any]], dict[str, str], list[str]]] = {}
    with closing(read_only_connection(backup)) as connection:
        for table in TABLE_ORDER:
            data[table] = table_data(connection, table)
    products = data["Product"][1]
    blocks = sorted(data["Block"][1], key=lambda block: block["index"])
    verify_ledger(products, blocks)

    users = {user["id"] for user in data["User"][1]}
    for product in products:
        if product["manufacturerId"] is not None and product["manufacturerId"] not in users:
            raise ValueError(f"Product {product['id']} has an unknown manufacturerId")

    return state, data


def convert_for_postgres(row: dict[str, Any], types: dict[str, str]) -> dict[str, Any]:
    converted: dict[str, Any] = {}
    for column, value in row.items():
        if value is not None and column in BOOL_COLUMNS:
            converted[column] = bool(value)
        elif value is not None and (column in DATETIME_COLUMNS or "DATE" in types.get(column, "") or "TIME" in types.get(column, "")):
            converted[column] = parse_utc(value).replace(tzinfo=None)
        else:
            converted[column] = value
    return converted


def postgres_rows(cursor: Any, table: str, columns: list[str], primary_key: list[str]) -> list[dict[str, Any]]:
    column_sql = ", ".join(quote_identifier(column) for column in columns)
    order_sql = ", ".join(quote_identifier(column) for column in primary_key)
    cursor.execute(f"SELECT {column_sql} FROM {quote_identifier(table)} ORDER BY {order_sql}")
    names = [description.name for description in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]


def make_report(backup: Path, state: dict[str, Any], data: dict[str, tuple[list[str], list[dict[str, Any]], dict[str, str], list[str]]]) -> dict[str, Any]:
    mapping = {}
    for table in TABLE_ORDER:
        columns, rows, types, primary_key = data[table]
        mapping[table] = {
            "rowCount": len(rows),
            "primaryKey": primary_key,
            "columns": columns,
            "idsSha256": state["tables"][table]["idsSha256"],
            "sourceRowsSha256": state["tables"][table]["rowsSha256"],
            "normalizedRowsSha256": normalized_rows_digest(rows, columns, types),
        }
    return {
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "mode": "dry-run",
        "backup": str(backup.resolve().relative_to(ROOT)),
        "backupSha256": sha256_file(backup),
        "sqliteIntegrityCheck": state["integrityCheck"],
        "sqliteForeignKeyIssues": state["foreignKeyIssues"],
        "ledgerValid": True,
        "plannedInsertOrder": TABLE_ORDER,
        "plannedRecords": {table: len(data[table][1]) for table in TABLE_ORDER},
        "plannedTotalRecords": sum(len(data[table][1]) for table in TABLE_ORDER),
        "tables": mapping,
        "importPerformed": False,
        "targetChecked": False,
    }


def import_records(data: dict[str, tuple[list[str], list[dict[str, Any]], dict[str, str], list[str]]]) -> dict[str, str]:
    if os.environ.get("BLOCKGUARD_ALLOW_PG_IMPORT") != "YES":
        raise ValueError("Import is disabled. A separate approval gate is required: BLOCKGUARD_ALLOW_PG_IMPORT=YES")
    direct_url = os.environ.get("DIRECT_URL")
    if not direct_url:
        raise ValueError("DIRECT_URL is required for the PostgreSQL import target")
    try:
        import psycopg  # type: ignore[import-not-found]
    except ImportError as error:
        raise ValueError("Import mode requires psycopg 3; dry-run does not") from error

    target_checksums: dict[str, str] = {}
    with psycopg.connect(direct_url) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                copied_tables: dict[str, list[dict[str, Any]]] = {}
                # Never append to, truncate, or overwrite an existing target.
                for table in TABLE_ORDER:
                    cursor.execute(f"SELECT COUNT(*) FROM {quote_identifier(table)}")
                    if cursor.fetchone()[0] != 0:
                        raise ValueError(f"Target table {table} is not empty; refusing to import")

                for table in TABLE_ORDER:
                    columns, rows, types, _primary_key = data[table]
                    column_sql = ", ".join(quote_identifier(column) for column in columns)
                    value_sql = ", ".join(["%s"] * len(columns))
                    insert_sql = f"INSERT INTO {quote_identifier(table)} ({column_sql}) VALUES ({value_sql})"
                    values = [
                        tuple(convert_for_postgres(row, types)[column] for column in columns)
                        for row in rows
                    ]
                    cursor.executemany(insert_sql, values)

                for table in TABLE_ORDER:
                    columns, source_rows, types, primary_key = data[table]
                    copied_rows = postgres_rows(cursor, table, columns, primary_key)
                    copied_tables[table] = copied_rows
                    source_digest = normalized_rows_digest(source_rows, columns, types)
                    target_digest = normalized_rows_digest(copied_rows, columns, types)
                    if target_digest != source_digest:
                        raise ValueError(f"PostgreSQL row checksum mismatch for {table}; transaction will roll back")
                    target_checksums[table] = target_digest

                users = {row["id"] for row in copied_tables["User"]}
                if any(
                    row["manufacturerId"] is not None and row["manufacturerId"] not in users
                    for row in copied_tables["Product"]
                ):
                    raise ValueError("Manufacturer relationship validation failed; transaction will roll back")

                verify_ledger(
                    copied_tables["Product"],
                    sorted(copied_tables["Block"], key=lambda block: block["index"]),
                )

    return target_checksums


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", required=True, type=Path)
    parser.add_argument("--apply", action="store_true", help="Import records; requires a separate approval gate")
    args = parser.parse_args()
    backup = args.backup if args.backup.is_absolute() else ROOT / args.backup

    state, data = validate_backup(backup)
    report = make_report(backup, state, data)
    if args.apply:
        target_checksums = import_records(data)
        report["mode"] = "import"
        report["importPerformed"] = True
        report["targetChecked"] = True
        report["targetNormalizedRowsSha256"] = target_checksums

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output = ROOT / "db" / f"pg_import_{report['mode']}_{stamp}.json"
    with output.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Report file: {output.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, sqlite3.Error, ValueError) as error:
        print(f"Import preparation failed: {error}", file=sys.stderr)
        raise SystemExit(2)
