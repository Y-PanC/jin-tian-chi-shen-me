#!/bin/zsh
set -eu
cd -- "${0:A:h}/mobile-web"
if [[ ! -x .venv/bin/python ]]; then
  task_python=''
  for candidate in python3.12 python3.11 python3; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; raise SystemExit(sys.version_info < (3,11))'; then
      task_python="$candidate"
      break
    fi
  done
  if [[ -z "$task_python" ]]; then
    print '请安装 Python 3.11 或更新版本后重试。'
    exit 1
  fi
  "$task_python" -m venv .venv
fi
.venv/bin/python -m pip install --no-cache-dir -r backend/requirements.lock
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
fi
print '后端依赖已安装。双击“启动本地预览.command”即可打开 Web 应用。'
