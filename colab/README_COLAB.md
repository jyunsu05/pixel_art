# Google Colab — 도트 생성용 FastAPI + Stable Diffusion WebUI

이 폴더는 **Colab GPU**에서 다음을 돌리기 위한 코드입니다.

1. **Stable Diffusion WebUI** (포트 `7860`, `--api`)
2. **FastAPI 래퍼** `colab_pixel_backend.py` (포트 `8000`) — [pixel art 웹앱](https://pixelart-snowy.vercel.app/)과 동일한 `/api/upload`, `/api/ai/*` 경로 제공

외부(Vercel 브라우저)에서 접속할 때는 **`8000` 포트만 노출**하면 됩니다(WebUI는 Colab 내부 `127.0.0.1:7860` 전용).

---

## 사전 준비

1. [ngrok](https://dashboard.ngrok.com/) 무료 가입 후 **Authtoken** 복사  
2. Vercel 프로젝트에서 환경 변수를 설정할 수 있음  
3. Colab에서 **GPU 런타임** 선택 (T4 이상 권장)

---

## 한 번에 실행 (노트북)

저장소의 **`colab/PixelArt_SD_Colab.ipynb`** 를 Colab에 업로드하거나 GitHub에서 열고, 위에서부터 셀 순서대로 실행하세요.

요약 흐름:

1. `fastapi`, `uvicorn`, `httpx`, `pillow`, `python-multipart`, `pyngrok` 설치  
2. 이 저장소 클론 → `colab/colab_pixel_backend.py` 사용  
3. **AUTOMATIC1111 WebUI** 클론 및 실행 (백그라운드) — `--api --listen`  
4. ControlNet 확장 + **SD1.5용 Canny 모델** 설치 (노트북 안내)  
5. FastAPI(`uvicorn`)를 백그라운드로 `0.0.0.0:8000` 에 바인딩  
6. **`ngrok http 8000`** 으로 공개 URL 출력 → 이 URL을 Vercel에 넣음  

---

## Vercel(https://pixelart-snowy.vercel.app/) 연결 설정

| 위치 | 변수명 | 값 예시 |
|------|--------|---------|
| **Vercel → Environment Variables** | `VITE_API_BASE_URL` | `https://xxxx-xx-xx.ngrok-free.app` |
| 동일 | `REACT_APP_AI_URL` | 위와 **동일** (둘 중 하나만 있어도 됨) |

- **`https://` 포함**, 끝에 **`/` 없음**, **`/api` 붙이지 않음** (프론트가 자동으로 `/api/...` 추가)  
- ngrok 무료 도메인은 세션이 끝나면 URL이 바뀌므로 **Colab 재실행 후 Vercel 값도 갱신·재배포** 필요  

### Colab 안 환경 변수 (선택)

노트북 또는 FastAPI 실행 전에 설정:

```python
import os
os.environ["CORS_ORIGINS"] = "https://pixelart-snowy.vercel.app,http://localhost:5173"
os.environ["SKIP_LORA_TAGS"] = "1"   # Colab에 pixel_art/chibi LoRA 없으면 1 권장
# WebUI에 설치된 Canny 이름이 다르면:
# os.environ["CANNY_MODEL"] = "control_v11p_sd15_canny [b18e0966]"
```

기본값으로 이미 `https://pixelart-snowy.vercel.app` 가 CORS에 포함되어 있습니다.

### Stable Diffusion WebUI 쪽

WebUI 실행 인수에 다음을 포함하는 것이 안전합니다.

```text
--api --listen --xformers --enable-insecure-extension-access
```

브라우저에서 WebUI Gradio까지 외부 공개가 필요하면 `--share` 를 추가할 수 있지만, **Vercel 앱은 FastAPI(ngrok 8000)만 보면 되므로 필수는 아님**.

---

## 웹앱에서 SD 주소 (`sd_url`)

AI 도트 패널의 **SD WebUI URL** 칸:

- Colab에서 WebUI가 **같은 머신의 7860**에서만 돌아가면 → **`http://127.0.0.1:7860`** (백엔드가 Colab 안에서 WebUI로 프록시하므로 브라우저가 아니라 **서버 입장의 주소**)

※ 프론트가 보내는 `sd_url`은 **FastAPI(Colab)** 가 받아서 그대로 WebUI에 붙입니다. Colab 단일 런타임이면 **`http://127.0.0.1:7860`** 이 맞습니다.

---

## 트러블슈팅

| 증상 | 확인 |
|------|------|
| CORS 에러 | `CORS_ORIGINS`에 정확히 `https://pixelart-snowy.vercel.app` 있는지 |
| 502 / 연결 실패 | WebUI가 뜰 때까지 대기 후 생성 버튼 재시도; `sdapi/v1/options` 직접 호출 테스트 |
| ControlNet 오류 | 확장 설치 + Canny 모델 이름이 `CANNY_MODEL` 과 일치하는지 WebUI에서 확인 |
| LoRA 오류 | `SKIP_LORA_TAGS=1` 로 LoRA 태그 제거 후 재시도 |

---

## 수동 실행 (노트북 없이)

```bash
cd colab
export CORS_ORIGINS="https://pixelart-snowy.vercel.app"
uvicorn colab_pixel_backend:app --host 0.0.0.0 --port 8000
```

(WebUI는 별도 프로세스에서 `7860` 에서 이미 실행 중이어야 합니다.)
