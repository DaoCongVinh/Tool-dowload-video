import os
import re
import uuid
import mimetypes
import tempfile
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file

import yt_dlp


app = Flask(__name__, static_folder="static", template_folder="templates")

# Persistent downloads root (skips re-downloads across sessions)x
DOWNLOADS_ROOT = Path("downloads")
DOWNLOADS_ROOT.mkdir(parents=True, exist_ok=True)


def sanitize_filename(name: str) -> str:
    """Return a safe filename by removing characters not allowed on Windows/macOS/Linux."""
    name = re.sub(r"[\\/:*?\"<>|]", "_", name)
    # collapse whitespace and underscores
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"_+", "_", name)
    return name or f"video-{uuid.uuid4().hex[:8]}"


def is_youtube_url(url: str) -> bool:
    try:
        import urllib.parse as _urlparse
        netloc = _urlparse.urlparse(url).netloc.lower()
    except Exception:
        return False
    return any(h in netloc for h in ("youtube.com", "youtu.be"))


def with_yt_client(opts: dict, client_name: str) -> dict:
    updated = dict(opts)
    ea = {"youtube": {"player_client": [client_name]}}
    updated["extractor_args"] = ea
    return updated


def try_extract_with_clients(url: str, base_opts: dict, clients: list[str]) -> tuple[dict, dict]:
    last_exc: Exception | None = None
    for c in clients:
        try:
            with yt_dlp.YoutubeDL(with_yt_client(base_opts, c)) as ydl:
                info = ydl.extract_info(url, download=True)
                return info, with_yt_client(base_opts, c)
        except Exception as exc:  # pylint: disable=broad-except
            last_exc = exc
            continue
    if last_exc:
        raise last_exc
    raise RuntimeError("Extraction failed without exception")


@app.get("/")
def index():
    return render_template("landing.html")


@app.get("/download")
def download_page():
    return render_template("index.html")


@app.post("/api/download")
def download():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    mode = (data.get("mode") or "video").strip().lower()  # "video" or "audio"
    raw_cookies = (data.get("cookies") or "").strip()

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
        # Improve YouTube access without cookies (use Android client, bypass geo, IPv4)
        "extractor_args": {"youtube": {"player_client": ["android"]}},
        "geo_bypass": True,
        "force_ipv4": True,
    }

    # Provide a realistic UA and optional Cookie header for platforms that require login
    # Referer helps some CDNs; we can set it to the input URL's origin
    try:
        import urllib.parse as _urlparse
        parsed = _urlparse.urlparse(url)
        referer = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else url
    except Exception:  # pragma: no cover
        referer = url

    default_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "vi,vi-VN;q=0.9,en;q=0.8",
        "Referer": referer,
    }
    if raw_cookies:
        default_headers["Cookie"] = raw_cookies
    ydl_opts["http_headers"] = default_headers

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
        if is_youtube_url(url):
            clients = ["android", "ios", "tv_embedded", "tv"]
            info, ydl_opts = try_extract_with_clients(url, ydl_opts, clients)
        else:
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


@app.post("/api/channel_download")
def channel_download():
    data = request.get_json(silent=True) or {}
    raw_username = (data.get("username") or "").strip()
    count = int(data.get("count") or 0)
    mode = (data.get("mode") or "video").strip().lower()
    raw_cookies = (data.get("cookies") or "").strip()

    if not raw_username:
        return jsonify({"ok": False, "error": "Missing username"}), 400
    if count <= 0 or count > 100:
        return jsonify({"ok": False, "error": "Count must be 1-100"}), 400

    # Normalize handle (remove any leading @)
    handle = raw_username.lstrip("@")
    # yt-dlp can take the channel page URL
    channel_url = f"https://www.youtube.com/@{handle}/videos"

    # Persist downloads under per-handle directory
    handle_dir = DOWNLOADS_ROOT / sanitize_filename(handle)
    handle_dir.mkdir(parents=True, exist_ok=True)
    archive_file = handle_dir / "archive.txt"

    is_audio = mode == "audio"

    ydl_opts: dict = {
        "paths": {"home": str(handle_dir)},
        "outtmpl": {"default": "%(title)s-%(id)s.%(ext)s"},
        "quiet": True,
        "no_warnings": True,
        "restrictfilenames": True,
        "noplaylist": False,
        # Limit number of items
        "playlistend": count,
        # Skip already downloaded by id
        "download_archive": str(archive_file),
        # Merge format
        "merge_output_format": "mp4" if not is_audio else None,
        # YouTube tweaks
        "extractor_args": {"youtube": {"player_client": ["android"]}},
        "geo_bypass": True,
        "force_ipv4": True,
    }

    # Headers/cookies (mainly useful if channel has age-restriction or region locks)
    default_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "vi,vi-VN;q=0.9,en;q=0.8",
        "Referer": channel_url,
    }
    if raw_cookies:
        default_headers["Cookie"] = raw_cookies
    ydl_opts["http_headers"] = default_headers

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
        ydl_opts.update({"format": "bestvideo+bestaudio/best"})

    # Track files created during this invocation
    before_files = {p.resolve() for p in handle_dir.glob("**/*") if p.is_file()}

    try:
        if is_youtube_url(channel_url):
            clients = ["android", "ios", "tv_embedded", "tv"]
            # reuse try-extract helper; ignore returned info, we only need files
            try_extract_with_clients(channel_url, ydl_opts, clients)
        else:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(channel_url, download=True)
    except Exception as exc:  # pylint: disable=broad-except
        return jsonify({"ok": False, "error": f"Channel download failed: {str(exc)}"}), 400

    after_files = [p for p in handle_dir.glob("**/*") if p.is_file()]
    new_files = [p for p in after_files if p.resolve() not in before_files]

    if not new_files:
        return jsonify({"ok": True, "message": "No new videos to download (all skipped).", "files": []})

    # Zip only new files and return
    import zipfile
    temp_zip = Path(tempfile.mkdtemp(prefix="zip_")) / f"{handle}-{uuid.uuid4().hex[:6]}.zip"
    with zipfile.ZipFile(temp_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in new_files:
            # Place under handle/ inside zip
            zf.write(f, arcname=f"{handle}/{f.name}")

    return send_file(
        str(temp_zip),
        as_attachment=True,
        download_name=f"{handle}-{len(new_files)}-videos.zip",
        mimetype="application/zip",
        conditional=True,
        max_age=0,
    )


def build_profile_url(platform: str, handle: str) -> str:
    p = platform.lower()
    h = handle.lstrip("@")
    if p == "youtube":
        return f"https://www.youtube.com/@{h}/videos"
    if p == "tiktok":
        return f"https://www.tiktok.com/@{h}"
    if p == "instagram":
        return f"https://www.instagram.com/{h}/"
    if p == "reddit":
        return f"https://www.reddit.com/user/{h}/submitted/"
    # default: try as is
    return h


def format_for_quality(is_audio: bool, quality: str) -> dict:
    if is_audio:
        return {
            "format": "bestaudio/best",
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
        }
    q = (quality or "auto").lower()
    if q == "1080p":
        return {"format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]"}
    if q == "720p":
        return {"format": "bestvideo[height<=720]+bestaudio/best[height<=720]"}
    return {"format": "bestvideo+bestaudio/best"}


@app.post("/api/profile_download")
def profile_download():
    data = request.get_json(silent=True) or {}
    platform = (data.get("platform") or "youtube").strip().lower()
    raw_username = (data.get("username") or "").strip()
    count = int(data.get("count") or 0)
    mode = (data.get("mode") or "video").strip().lower()
    quality = (data.get("quality") or "auto").strip()
    raw_cookies = (data.get("cookies") or "").strip()

    if not raw_username:
        return jsonify({"ok": False, "error": "Missing username"}), 400
    if count <= 0 or count > 100:
        return jsonify({"ok": False, "error": "Count must be 1-100"}), 400

    handle = raw_username.lstrip("@")
    profile_url = build_profile_url(platform, handle)

    # per-platform dir
    base_dir = DOWNLOADS_ROOT / sanitize_filename(platform) / sanitize_filename(handle)
    base_dir.mkdir(parents=True, exist_ok=True)
    archive_file = base_dir / "archive.txt"

    is_audio = mode == "audio"
    ydl_opts: dict = {
        "paths": {"home": str(base_dir)},
        "outtmpl": {"default": "%(title)s-%(id)s.%(ext)s"},
        "quiet": True,
        "no_warnings": True,
        "restrictfilenames": True,
        "noplaylist": False,
        "playlistend": count,
        "download_archive": str(archive_file),
        "merge_output_format": "mp4" if not is_audio else None,
        # YouTube tweaks
        "extractor_args": {"youtube": {"player_client": ["android"]}},
        "geo_bypass": True,
        "force_ipv4": True,
    }

    # quality/mode
    ydl_opts.update(format_for_quality(is_audio, quality))

    # Set headers including optional Cookie for sites like Instagram/Facebook/Reddit
    default_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "vi,vi-VN;q=0.9,en;q=0.8",
        "Referer": profile_url,
    }
    if raw_cookies:
        default_headers["Cookie"] = raw_cookies
    ydl_opts["http_headers"] = default_headers

    before = {p.resolve() for p in base_dir.glob("**/*") if p.is_file()}
    try:
        if platform == "youtube" and is_youtube_url(profile_url):
            clients = ["android", "ios", "tv_embedded", "tv"]
            try_extract_with_clients(profile_url, ydl_opts, clients)
        else:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(profile_url, download=True)
    except Exception as exc:  # pylint: disable=broad-except
        hint = " (cần cookie đăng nhập)" if platform in {"instagram", "facebook", "threads"} else ""
        return jsonify({"ok": False, "error": f"Profile download failed: {str(exc)}{hint}"}), 400

    after = [p for p in base_dir.glob("**/*") if p.is_file()]
    new_files = [p for p in after if p.resolve() not in before]

    if not new_files:
        return jsonify({"ok": True, "message": "Không có video mới (đã bỏ qua).", "files": []})

    import zipfile
    temp_zip = Path(tempfile.mkdtemp(prefix="zip_")) / f"{platform}-{handle}-{uuid.uuid4().hex[:6]}.zip"
    with zipfile.ZipFile(temp_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in new_files:
            zf.write(f, arcname=f"{platform}/{handle}/{f.name}")

    return send_file(
        str(temp_zip),
        as_attachment=True,
        download_name=f"{platform}-{handle}-{len(new_files)}-videos.zip",
        mimetype="application/zip",
        conditional=True,
        max_age=0,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)

