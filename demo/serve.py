"""Run from the repository root: python -m demo.serve."""
import argparse
import os

import uvicorn

from .app import configure_environment


def main():
    configure_environment()
    parser = argparse.ArgumentParser(description="今天吃什么 · Yunzhong 演示")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "5177")))
    args = parser.parse_args()
    uvicorn.run("demo.app:create_demo_app", factory=True, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
