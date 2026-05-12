import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import aiofiles

from app.utils.image_utils import generate_file_id

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "outputs")
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


@router.post("/bg-removed")
async def upload_bg_removed(file: UploadFile = File(...)):
    """
    Receive a PNG (with transparency) that has been manually bg-removed
    in the frontend canvas tool. Saves to outputs/ and returns the path
    for the next pipeline step (pixelation).
    """
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    file_id = generate_file_id()
    filename = f"manual_bg_{file_id}.png"
    filepath = os.path.join(OUTPUT_DIR, filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(contents)

    return JSONResponse(
        {
            "file_id": file_id,
            "filename": filename,
            "url": f"/outputs/{filename}",
            "size": len(contents),
        }
    )
