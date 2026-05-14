"""Generate PixelArt_SD_Colab.ipynb — run once locally: python gen_colab_nb.py"""
import json
from pathlib import Path

here = Path(__file__).resolve().parent


def cell_md(text: str) -> dict:
    lines = [ln + "\n" for ln in text.strip().split("\n")]
    return {"cell_type": "markdown", "metadata": {}, "source": lines}


def cell_code(text: str) -> dict:
    lines = [ln + "\n" for ln in text.strip().split("\n")]
    return {"cell_type": "code", "metadata": {}, "source": lines, "outputs": [], "execution_count": None}


cells = [
    cell_md(
        """# Pixel Art — Colab FastAPI + Stable Diffusion WebUI

1. **런타임 → GPU** 선택  
2. [ngrok Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) 준비  
3. 아래 셀을 **위에서부터** 실행  
4. 마지막 셀에 출력되는 `https://....ngrok-free.app` 을 Vercel `VITE_API_BASE_URL` 에 넣고 Redeploy  

웹앱 AI 패널의 **SD 주소**는 Colab 안에서는 **`http://127.0.0.1:7860`** (FastAPI가 같은 머신의 WebUI로 붙음).
"""
    ),
    cell_code(
        r"""# 1) 패키지
!pip install -q fastapi "uvicorn[standard]" httpx pillow python-multipart aiofiles pyngrok"""
    ),
    cell_code(
        r"""# 2) 이 프로젝트 클론 (fork 주소로 바꿔도 됨)
%cd /content
!rm -rf pixel_art 2>/dev/null
!git clone https://github.com/jyunsu05/pixel_art.git"""
    ),
    cell_code(
        r"""# 3) Stable Diffusion WebUI + ControlNet 확장
%cd /content
!rm -rf stable-diffusion-webui 2>/dev/null
!git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git stable-diffusion-webui
%cd /content/stable-diffusion-webui/extensions
!git clone https://github.com/Mikubill/sd-webui-controlnet.git sd-webui-controlnet 2>/dev/null || true"""
    ),
    cell_code(
        r"""# 4) WebUI 백그라운드 실행 (--api)
import subprocess, os, time, sys, urllib.request

WEBUI = "/content/stable-diffusion-webui"
os.chdir(WEBUI)
log = open("/content/webui_launch.log", "w")
cmd = [
    sys.executable,
    "launch.py",
    "--skip-python-version-check",
    "--xformers",
    "--api",
    "--listen",
    "--enable-insecure-extension-access",
]
subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT)

def wait_sd(timeout=900):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            urllib.request.urlopen("http://127.0.0.1:7860/sdapi/v1/options", timeout=5)
            print("WebUI API 준비됨 (7860)")
            return True
        except Exception:
            time.sleep(8)
    print("타임아웃 — /content/webui_launch.log 확인")
    return False

wait_sd()"""
    ),
    cell_code(
        r"""# 5) FastAPI(8000) + ngrok 공개 URL
import os, threading, time, sys

os.environ.setdefault("CORS_ORIGINS", "https://pixelart-snowy.vercel.app,http://localhost:5173")
os.environ.setdefault("SD_WEBUI_URL", "http://127.0.0.1:7860")
os.environ.setdefault("SKIP_LORA_TAGS", "1")

sys.path.insert(0, "/content/pixel_art/colab")

from pyngrok import conf, ngrok

tok = input("ngrok authtoken: ").strip()
conf.get_default().auth_token = tok


def run_api():
    import uvicorn

    uvicorn.run("colab_pixel_backend:app", host="0.0.0.0", port=8000, log_level="info")


threading.Thread(target=run_api, daemon=True).start()
time.sleep(4)

http_tunnel = ngrok.connect(8000, "http")
print("=" * 58)
print("Vercel 에 설정: VITE_API_BASE_URL (FastAPI 루트 URL, /api 없음)")
print(http_tunnel.public_url)
print("=" * 58)"""
    ),
]

nb = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {"colab": {"provenance": []}},
    "cells": cells,
}

out = here / "PixelArt_SD_Colab.ipynb"
out.write_text(json.dumps(nb, ensure_ascii=False, indent=2), encoding="utf-8")
print("Wrote", out)
