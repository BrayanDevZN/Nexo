"""Entry point. Run `nexo --check-config` or `nexo` from the repository root."""
import argparse
import sys

import uvicorn
from pydantic import ValidationError

from backend.controller.application import create_app
from backend.infra.config.settings import get_settings
from backend.service.schema import initialize_tables


def main() -> None:
    parser = argparse.ArgumentParser(description="Nexo backend")
    parser.add_argument("--check-config", action="store_true")
    parser.add_argument("command", nargs="?", choices=["create-tables"])
    args = parser.parse_args()
    try:
        settings = get_settings()
    except ValidationError as error:
        # Do not print error inputs: model-level errors may contain all credentials.
        print("Invalid backend configuration:", file=sys.stderr)
        for item in error.errors(include_input=False, include_url=False):
            location = ".".join(map(str, item["loc"])) or "configuration"
            print(f"- {location}: {item['msg']}", file=sys.stderr)
        raise SystemExit(1) from None
    if args.check_config:
        print("Backend configuration valid.")
        return
    if args.command == "create-tables":
        initialize_tables(settings)
        print("Database tables created or already present.")
        return
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port,
                forwarded_allow_ips=settings.forwarded_allow_ips)


if __name__ == "__main__":
    main()
