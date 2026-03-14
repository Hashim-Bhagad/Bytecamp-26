import sqlglot
import sqlglot.expressions as exp
import sys
import os

# Allow importing CodeNode
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from backend.core.models import CodeNode


def parse_sql_file(filepath: str) -> CodeNode:
    """Parse a SQL file using sqlglot and return a CodeNode tree."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            sql = f.read()
    except Exception as e:
        return None

    line_count = sql.count('\n') + 1
    file_node = CodeNode(
        id=filepath,
        type="file",
        language="sql",
        name=os.path.basename(filepath),
        source_lines=sql,
        file=filepath,
        line_start=1,
        line_end=line_count
    )

    try:
        statements = sqlglot.parse(sql, dialect="postgres")
    except Exception:
        return file_node

    for statement in statements:
        if not isinstance(statement, exp.Create):
            continue
        table = statement.find(exp.Table)
        if not table:
            continue

        table_node = CodeNode(
            id=f"{filepath}::{table.name}",
            type="table",
            language="sql",
            name=table.name,
            source_lines=statement.sql(),
            file=filepath,
            line_start=0,
            line_end=0,
            parent_id=filepath,
            metadata={"is_boundary": True}
        )

        for col in statement.find_all(exp.ColumnDef):
            col_node = CodeNode(
                id=f"{filepath}::{table.name}::{col.name}",
                type="column",
                language="sql",
                name=col.name,
                source_lines=col.sql(),
                file=filepath,
                line_start=0,
                line_end=0,
                parent_id=table_node.id,
                metadata={
                    "sql_type": str(col.args.get("kind", "")),
                    "is_boundary": True
                }
            )
            table_node.children.append(col_node)

        file_node.children.append(table_node)

    return file_node
