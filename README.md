# AI Pixel Art Character Generator

사용자 사진을 입력받아 **Human Base 스타일 8프레임 뼈대 시트**를 기준으로 **Unity용 도트 캐릭터 스프라이트**를 재구성하는 웹 도구입니다. 일반 픽셀화 파이프라인과 **Stable Diffusion WebUI API** 기반 AI 도트(뼈대 + 참조 이미지) 생성을 함께 지원합니다.

---

## 주요 기능

- 이미지 업로드, 배경 제거(캔버스), 픽셀화 및 스프라이트 시트 내보내기
- **AI 도트**: 뼈대 시트 + 캐릭터 참조 이미지로 SD WebUI(`txt2img` + ControlNet) 연동
- 애니메이션·비디오 프레임 추출·Unity 내보내기(JSON 포함) 워크플로

---

## 아키텍처

| 구분 | 역할 |
|------|------|
| **프론트엔드 (이 저장소)** | React + Vite UI. **프로덕션에서는 [Vercel](https://vercel.com) 등 정적 호스팅**에 배포하는 것을 전제로 합니다. |
| **백엔드 (FastAPI)** | 업로드·픽셀 처리·SD 프록시 역할의 API 서버. 로컬/`Render`/`Railway` 등 **별도 프로세스**로 실행합니다. |
| **Stable Diffusion WebUI** | 실제 **AI 이미지 연산**은 WebUI의 REST API(`--api`)를 통해 수행합니다. 로컬 GPU, **Google Colab**, 또는 자체 호스팅 인스턴스에 두고 **공개 URL**(ngrok, Cloudflare Tunnel 등)을 백엔드·브라우저 CORS와 맞춥니다. Hugging Face Spaces 등 **API 호환 엔드포인트**를 쓰는 경우에도 동일하게 `sd_url`만 맞추면 됩니다. |

> Vercel 서버리스만으로 SD 연산을 돌리지는 않습니다. **브라우저 → (선택) 백엔드 → SD WebUI API** 경로를 유지하세요.

---

## 저장소 구조

```
pixel_art/
├── frontend/          # React + Vite (Vercel 빌드 대상)
├── backend/           # FastAPI
├── README.md
├── vercel.json        # Vercel 루트 빌드 설정
└── package.json       # 루트 빌드 스크립트 (npm run build)
```

---

## 사전 요구 사항

- **Node.js** 18 이상  
- **Python** 3.10 이상 (백엔드)  
- AI 기능 사용 시: **Stable Diffusion WebUI**(ControlNet 등 확장 설치) 또는 동등한 API 엔드포인트  

---

## Stable Diffusion WebUI 실행 (기술 문서)

브라우저에서 호스팅된 프론트(Vercel 등)와 통신하려면 WebUI가 **API를 노출**하고, **CORS**를 허용해야 합니다. 아래 인수는 **필수에 가깝게 사용**하는 것을 권장합니다.

### 필수 플래그

| 플래그 | 설명 |
|--------|------|
| `--api` | `/sdapi/v1/*` REST API 활성화 |
| `--cors-allow-origins=*` | 교차 출처 요청 허용 (프로덕션에서는 특정 오리진으로 좁히는 것이 안전합니다) |

### 예시 (launch 인자)

```bash
# Automatic1111 WebUI 예시 — 셸에 따라 따옴표가 필요할 수 있음
python launch.py --api --listen --cors-allow-origins=*
```

Windows `webui-user.bat` 등에서는 다음과 같이 설정할 수 있습니다.

```bat
set COMMANDLINE_ARGS=--api --listen --cors-allow-origins=*
```

Stability Matrix 등 패키지 매니저를 쓰는 경우에도 **동일한 인수가 Launch 인자에 포함**되도록 설정하세요.

### 보안 참고

- 공개 망에 올릴 때는 `--cors-allow-origins=*` 대신 **`https://your-app.vercel.app`** 과 같이 **허용 출처를 명시**하고, 가능하면 **인증·방화벽**을 추가하세요.

---

## 로컬 개발

### 백엔드

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
source venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 프론트엔드

```bash
cd frontend
npm ci
npm run dev
```

개발 시 Vite 프록시가 `/api` 등을 `localhost:8000`으로 넘깁니다.

---

## Vercel 배포

1. GitHub에 이 저장소를 연결합니다.  
2. Vercel 프로젝트에서 **Framework Preset**은 Vite로 두거나, 저장소 루트의 **`vercel.json`** 을 사용합니다.  
3. **빌드 출력**은 `frontend/dist` 입니다 (루트 `vercel.json`에 정의됨).  

### 프론트엔드 환경 변수

백엔드(AI/FastAPI 서버)가 **Vercel 도메인과 다른 호스트**에 있을 때 반드시 설정합니다.

| 변수 | 설명 |
|------|------|
| `VITE_API_BASE_URL` | **필수(프로덕션).** 예: `https://xxxx.ngrok-free.app` — 스킴+호스트만 (끝 `/` 없음, `/api` 접미사 없음). 클라이언트는 `${VITE_API_BASE_URL}/api/...` 로 요청합니다. 비우면 배포 환경에서 API 호출이 실패합니다. |

값은 **빌드 시점**에 포함되므로 변경 후 **Redeploy** 하세요.

### 백엔드 CORS

백엔드 `CORS_ORIGINS`에 프론트 URL 전체를 추가하세요.  
예: `http://localhost:5173,https://pixelart-snowy.vercel.app`  
(프리뷰·프로덕션 도메인을 각각 넣을 수 있습니다.)

Colab 기본값(`colab_pixel_backend.py`)에는 `https://pixelart-snowy.vercel.app` 가 이미 포함되어 있습니다.

---

## GitHub에 코드 업로드 (터미널 명령 순서)

저장소 루트(`pixel_art` 클론/프로젝트 폴더)에서 실행합니다. **이 프로젝트 폴더에만** 커밋 사용자 이름을 고정합니다.

### PowerShell (Windows)

```powershell
cd C:\경로\pixel-art-converter

git config --local user.name "jyunsu05"
git config --local user.email "jyunsu05@users.noreply.github.com"

git status
# 초기화가 안 되어 있다면: git init

git remote remove origin 2>$null
git remote add origin https://github.com/jyunsu05/pixel_art.git

git add .
git commit -m "chore: initial import — AI Pixel Art Character Generator"
git branch -M main
git push -u origin main
```

### Bash (macOS / Linux)

```bash
cd /path/to/pixel-art-converter

git config --local user.name "jyunsu05"
git config --local user.email "jyunsu05@users.noreply.github.com"

git status
# 필요 시: git init

git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/jyunsu05/pixel_art.git

git add .
git commit -m "chore: initial import — AI Pixel Art Character Generator"
git branch -M main
git push -u origin main
```

> 이미 `origin` 이 있고 URL만 바꾸려면:  
> `git remote set-url origin https://github.com/jyunsu05/pixel_art.git`

---

## 라이선스

이 저장소에 별도 라이선스 파일이 없다면, 배포 전 **LICENSE** 추가 여부를 결정하세요.
