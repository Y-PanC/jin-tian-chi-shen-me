"""Explicit provider smoke test using a generated, non-personal image."""
import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image
from backend.config import Settings
from backend.vision import VisionService


async def main():
    config = Settings.from_env()
    if not config.vision_enabled:
        print("模型尚未配置")
        return 1
    service = VisionService(config)
    try:
        with TemporaryDirectory(prefix="meal-model-check-") as folder:
            path = Path(folder) / "color.jpg"
            Image.new("RGB", (128, 128), (220, 20, 20)).save(path)
            result = await service.identify([path])
            print("图像输入、流式调用和 JSON 校验通过")
            print("非食物图片识别为空：", not result["dishes"])
        return 0
    except Exception as error:
        print("模型连通性测试未通过：", type(error).__name__, "HTTP", getattr(error, "status_code", "—"))
        return 1
    finally:
        await service.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
