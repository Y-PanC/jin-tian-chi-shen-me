#!/bin/zsh
set -eu
cd -- "${0:A:h}/mobile-web"
if [[ ! -x .venv/bin/python ]]; then
  print '请先双击根目录的“安装后端依赖.command”，完成一次性安装。'
  exit 1
fi
exec .venv/bin/python -m backend.run --port 5175 "$@"
