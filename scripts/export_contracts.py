"""Export schemas from the executable Python models, never from handwritten copies."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))


def main():
    from genesis.models import Certificate, Dataset, Plan

    directory = ROOT / "packages" / "contracts"
    directory.mkdir(parents=True, exist_ok=True)
    for model in (Dataset, Plan, Certificate):
        schema = model.model_json_schema(mode="serialization")
        assert schema["type"] == "object" and "properties" in schema
        (directory / f"{model.__name__}.schema.json").write_text(
            json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    from genesis.api import app

    (directory / "openapi.json").write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Exported model and API schemas to {directory}")


if __name__ == "__main__":
    main()
