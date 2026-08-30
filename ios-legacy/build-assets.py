import os
from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = Path(os.environ.get("BORSACI_ICON_SOURCE", ROOT.parent / "ios-app" / "icon.png"))
RESOURCES = ROOT / "Resources"


def save_icon(image: Image.Image, name: str, size: int) -> None:
    resized = image.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(RESOURCES / name, format="PNG", optimize=True)


def main() -> None:
    RESOURCES.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    sizes = {
        "AppIcon29x29@2x.png": 58,
        "AppIcon29x29@3x.png": 87,
        "AppIcon40x40@2x.png": 80,
        "AppIcon40x40@3x.png": 120,
        "AppIcon57x57.png": 57,
        "AppIcon57x57@2x.png": 114,
        "AppIcon60x60@2x.png": 120,
        "AppIcon60x60@3x.png": 180,
    }
    for name, size in sizes.items():
        save_icon(source, name, size)

    launch = Image.new("RGB", (640, 1136), (1, 10, 8))
    mark = source.resize((250, 250), Image.Resampling.LANCZOS)
    launch.paste(mark, ((launch.width - mark.width) // 2, (launch.height - mark.height) // 2))
    launch.save(RESOURCES / "Default-568h@2x.png", format="PNG", optimize=True)


if __name__ == "__main__":
    main()

