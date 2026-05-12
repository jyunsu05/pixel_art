# Pixel Art Converter — Unity Sprite Generator

이미지를 업로드하여 게임용 픽셀 아트 리소스로 변환하고, 유니티에서 즉시 사용 가능한 스프라이트 시트로 내보내는 풀스택 웹 애플리케이션입니다.

## 폴더 구조

```
pixel-art-converter/
├── frontend/                       # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/
│   │   │   ├── StepIndicator.jsx   # 5단계 진행 표시 UI
│   │   │   ├── UploadZone.jsx      # [1단계] 드래그 앤 드롭 업로드
│   │   │   ├── PixelPanel.jsx      # [2단계] 도트 변환 패널
│   │   │   ├── ChromakeyAiPanel.jsx# [3단계] 크로마키 + AI 변환
│   │   │   ├── AnimationPreview.jsx# [4단계] 모션 프리뷰 플레이어
│   │   │   └── ExportPanel.jsx     # [5단계] 스프라이트 시트 내보내기
│   │   ├── hooks/
│   │   │   └── usePixelConverter.js# 전체 5단계 상태 관리 훅
│   │   ├── services/
│   │   │   └── api.js              # FastAPI 연동 API 클라이언트
│   │   ├── App.jsx                 # 메인 레이아웃 (사이드바 + 패널)
│   │   └── index.css               # Tailwind + 다크 모드 스타일
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
└── backend/                        # FastAPI (Python)
    ├── app/
    │   ├── main.py                 # FastAPI 앱 진입점, CORS, 라우터 등록
    │   ├── routers/
    │   │   ├── upload.py           # POST /api/upload
    │   │   ├── pixel.py            # POST /api/pixel
    │   │   ├── chromakey.py        # POST /api/chromakey
    │   │   ├── ai_transform.py     # POST /api/ai
    │   │   ├── animation.py        # POST /api/animation
    │   │   └── export.py           # POST /api/export, /api/export/zip
    │   ├── services/
    │   │   ├── pixel_service.py    # OpenCV k-means 픽셀화 + 색상 양자화
    │   │   ├── chromakey_service.py# HSV 마스크 기반 크로마키 제거
    │   │   ├── ai_service.py       # Replicate / HuggingFace / Mock 인터페이스
    │   │   ├── animation_service.py# Walk/Attack/Jump 등 프레임 생성
    │   │   └── export_service.py   # 스프라이트 시트 + Unity JSON 메타 생성
    │   └── utils/
    │       └── image_utils.py      # PIL 공통 유틸리티
    ├── requirements.txt
    └── .env.example
```

## 빠른 시작

### 1. 백엔드 설정

```bash
cd backend

# 가상환경 생성 (권장)
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# 패키지 설치
pip install -r requirements.txt

# 환경변수 설정
copy .env.example .env
# .env 파일에서 AI_PROVIDER, API 키 등 설정

# 서버 실행
uvicorn app.main:app --reload --port 8000
```

### 2. 프론트엔드 설정

```bash
cd frontend

# 패키지 설치
npm install

# 개발 서버 실행
npm run dev
# → http://localhost:5173
```

## API 엔드포인트

| Method | URL | 설명 |
|--------|-----|------|
| POST | `/api/upload` | 이미지 업로드 (multipart) |
| POST | `/api/pixel` | 픽셀화 + 색상 양자화 (OpenCV k-means) |
| POST | `/api/chromakey` | 크로마키 배경 제거 |
| POST | `/api/ai` | AI img2img 변환 (Replicate/HF/Mock) |
| POST | `/api/animation` | 모션 프레임 시퀀스 생성 |
| GET  | `/api/animation/motions` | 지원 모션 목록 |
| POST | `/api/export` | 스프라이트 시트 + JSON 메타 생성 |
| POST | `/api/export/zip` | ZIP 다운로드 (시트+JSON+개별 프레임) |

## AI 연동

`.env` 파일에서 `AI_PROVIDER`를 설정합니다:

- `mock` (기본값): API 키 없이 로컬 픽셀화로 대체
- `replicate`: [Replicate](https://replicate.com) 계정 및 `REPLICATE_API_TOKEN` 필요
- `huggingface`: [Hugging Face](https://huggingface.co) 계정 및 `HF_API_TOKEN` 필요

## Unity에서 사용하기

1. `Export` 단계에서 **ZIP 다운로드** 클릭
2. 스프라이트 시트 PNG를 Unity `Assets/Sprites/` 폴더에 복사
3. Inspector에서 설정:
   - Texture Type: **Sprite (2D and UI)**
   - Sprite Mode: **Multiple**
   - Filter Mode: **Point (no filter)**
   - Compression: **None**
   - Pixels Per Unit: `cell_size` 값 (기본 64)
4. **Sprite Editor** → **Slice** → Cell Size: `{cell_size}×{cell_size}` 적용
5. 동봉된 JSON 파일에서 프레임 이름/좌표 확인
6. Animator Controller에서 프레임을 애니메이션 클립으로 배치

## 파일 명명 규칙

```
{캐릭터명}_{액션}_{프레임번호:02d}.png
예: Character_walk_00.png, Hero_attack_03.png
```

## 기술 스택

- **프론트엔드**: React 18, Vite, Tailwind CSS, Framer Motion, react-dropzone
- **백엔드**: FastAPI, Uvicorn, Pillow, OpenCV, NumPy
- **AI 연동**: Replicate SDK, Hugging Face Inference API
