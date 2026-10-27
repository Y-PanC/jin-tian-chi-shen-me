from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'MANIFEST.json').read_text(encoding='utf-8'))
errors = []
expected = manifest['files']
actual = {str(path.relative_to(root)) for path in root.rglob('*') if path.is_file() and path.name != 'MANIFEST.json'}
for name in sorted(set(expected) - actual):
    errors.append(f'缺少文件：{name}')
for name in sorted(actual - set(expected)):
    errors.append(f'新增文件：{name}')
for name, details in expected.items():
    path = root / name
    if not path.is_file():
        continue
    content = path.read_bytes()
    if len(content) != details['bytes'] or hashlib.sha256(content).hexdigest() != details['sha256']:
        errors.append(f'文件已变化：{name}')
if errors:
    print('校验未通过：')
    print('\n'.join(errors))
    sys.exit(1)
print(f"v{manifest['version']} 校验通过：{len(expected)} 个文件完整，内容与固定资产清单一致。")
