import os
import re
import uuid
import mimetypes
import tempfile
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file

import yt_dlp


app = Flask(__name__, static_folder="static", template_folder="templates")


def sanitize_filename(name: str) -> str:
    """Return a safe filename by removing characters not allowed on Windows/macOS/Linux."""
    name = re.sub(r"[\\/:*?\"<>|]", "_", name)
    # collapse whitespace and underscores
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"_+", "_", name)
    return name or f"video-{uuid.uuid4().hex[:8]}"


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/download")
def download():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    mode = (data.get("mode") or "video").strip().lower()  # "video" or "audio"

    if not url:
        return jsonify({"ok": False, "error": "Missing URL"}), 400

    temp_dir = Path(tempfile.mkdtemp(prefix="media_dl_"))

    # Configure yt-dlp options
    is_audio = mode == "audio"
    ydl_opts: dict = {
        "paths": {"home": str(temp_dir)},
        "outtmpl": {
            "default": "%(title)s-%(id)s.%(ext)s",
        },
        # Avoid overly verbose logs in server
        "quiet": True,
        "no_warnings": True,
        # Restrict filenames to be filesystem safe
        "restrictfilenames": True,
        # Prefer mp4/m4a when possible
        "merge_output_format": "mp4" if not is_audio else None,
        # Fail on playlist by default; we take only first entry if playlist
        "noplaylist": False,
    }

    if is_audio:
        ydl_opts.update(
            {
                "format": "bestaudio/best",
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }
                ],
            }
        )
    else:
        # Try best video+audio, fallback to best
        ydl_opts.update({"format": "bestvideo+bestaudio/best"})

    info = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as exc:  # pylint: disable=broad-except
        return (
            jsonify({"ok": False, "error": f"Download failed: {str(exc)}"}),
            400,
        )

    # Resolve the final downloaded file path
    def find_downloaded_paths(extracted: dict) -> list[Path]:
        candidates: list[Path] = []
        if not extracted:
            return candidates

        # Flatten playlist entries, else handle single
        entries = []
        if extracted.get("entries"):
            entries = [e for e in extracted.get("entries") or [] if e]
        else:
            entries = [extracted]

        for entry in entries:
            # yt-dlp >= 2023 exposes 'requested_downloads' with exact filepaths
            for rd in (entry.get("requested_downloads") or []):
                fp = rd.get("filepath")
                if fp:
                    p = Path(fp)
                    if p.exists():
                        candidates.append(p)

            # Fallback: derive name and search by id in temp_dir
            video_id = entry.get("id") or ""
            if video_id:
                for p in temp_dir.glob(f"*{video_id}*"):
                    if p.is_file():
                        candidates.append(p)

        # Deduplicate preserving order
        seen = set()
        unique: list[Path] = []
        for p in candidates:
            if str(p) not in seen:
                unique.append(p)
                seen.add(str(p))
        return unique

    paths = find_downloaded_paths(info)
    if not paths:
        return (
            jsonify({"ok": False, "error": "Could not locate downloaded file."}),
            500,
        )

    # Only return first file (if playlist URL, we serve the first entry)
    file_path = paths[0]

    # Build a nice download filename
    title = info.get("title") if not info.get("entries") else (info.get("entries") or [{}])[0].get("title")
    title = sanitize_filename(title or file_path.stem)
    ext = file_path.suffix.lstrip(".") or ("mp3" if is_audio else "mp4")
    download_name = f"{title}.{ext}"

    guessed_mime, _ = mimetypes.guess_type(str(file_path))
    if not guessed_mime:
        guessed_mime = "audio/mpeg" if is_audio else "video/mp4"

    # Stream the file back to the client; let the OS temp directory clean up later
    return send_file(
        str(file_path),
        as_attachment=True,
        download_name=download_name,
        mimetype=guessed_mime,
        conditional=True,
        max_age=0,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)

