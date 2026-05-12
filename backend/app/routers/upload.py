import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import aiofiles

from app.utils.image_utils import generate_file_id

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


@router.post("")
async def upload_image(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: PNG, JPEG, WEBP, BMP",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File size exceeds 20 MB limit")

    ext = os.path.splitext(file.filename or "image.png")[1] or ".png"
    file_id = generate_file_id()
    filename = f"{file_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(contents)

    return JSONResponse(
        {
            "file_id": file_id,
            "filename": filename,
            "original_name": file.filename,
            "url": f"/uploads/{filename}",
            "size": len(contents),
            "content_type": file.content_type,
        }
    )
