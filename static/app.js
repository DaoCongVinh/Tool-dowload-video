const $ = (s) => document.querySelector(s);

function setStatus(visible, text = "") {
  const st = $("#status");
  const tx = $("#statusText");
  if (!st || !tx) return;
  tx.textContent = text;
  st.classList.toggle("hidden", !visible);
}

function setError(message = "") {
  const el = $("#error");
  if (!el) return;
  if (!message) {
    el.classList.add("hidden");
    el.textContent = "";
  } else {
    el.textContent = message;
    el.classList.remove("hidden");
  }
}

async function download() {
  setError("");
  const url = $("#url").value.trim();
  const mode = document.querySelector('input[name="mode"]:checked')?.value || "video";
  if (!url) {
    setError("Vui lòng dán liên kết hợp lệ.");
    return;
  }

  setStatus(true, "Đang tải, vui lòng đợi...");
  const btn = $("#downloadBtn");
  btn.disabled = true;

  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, mode }),
    });

    if (!res.ok) {
      // Try to read error json
      let msg = `Lỗi tải (${res.status})`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch (_) {}
      throw new Error(msg);
    }

    // Determine filename from headers or fallback
    let filename = "download";
    const cd = res.headers.get("Content-Disposition");
    if (cd) {
      const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const picked = decodeURIComponent(m?.[1] || m?.[2] || "");
      if (picked) filename = picked;
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    setError(err?.message || "Có lỗi xảy ra. Hãy thử lại.");
  } finally {
    setStatus(false);
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-target');
      document.querySelectorAll('main .card').forEach(sec => sec.classList.add('hidden'));
      if (target) document.querySelector(target)?.classList.remove('hidden');
    });
  });

  $("#downloadBtn").addEventListener("click", (e) => {
    e.preventDefault();
    download();
  });

  $("#url").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      download();
    }
  });

  const chBtn = document.querySelector("#channelBtn");
  if (chBtn) {
    chBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await channelDownload();
    });
  }

  const pfBtn = document.querySelector('#pfBtn');
  if (pfBtn) {
    pfBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await profileDownload();
    });
  }
});

async function channelDownload() {
  const err = document.querySelector('#chError');
  err?.classList.add('hidden');
  if (err) err.textContent = '';

  const handle = document.querySelector('#ytHandle')?.value.trim();
  const count = parseInt(document.querySelector('#ytCount')?.value || '0', 10) || 0;
  const mode = document.querySelector('input[name="modeChannel"]:checked')?.value || 'video';
  if (!handle || count <= 0) {
    if (err) { err.textContent = 'Vui lòng nhập username và số lượng hợp lệ.'; err.classList.remove('hidden'); }
    return;
  }

  setStatus(true, 'Đang tải video từ kênh...');
  const btn = document.querySelector('#channelBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/channel_download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: handle, count, mode }),
    });
    if (!res.ok) {
      let msg = `Lỗi tải (${res.status})`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }

    // if server says no new files
    const cd = res.headers.get('Content-Type') || '';
    if (cd.includes('application/json')) {
      const j = await res.json();
      if (j?.message) {
        if (err) { err.textContent = j.message; err.classList.remove('hidden'); }
        return;
      }
    }

    let filename = 'channel.zip';
    const dispo = res.headers.get('Content-Disposition');
    if (dispo) {
      const m = dispo.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const picked = decodeURIComponent(m?.[1] || m?.[2] || '');
      if (picked) filename = picked;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) {
    if (err) { err.textContent = e?.message || 'Có lỗi xảy ra.'; err.classList.remove('hidden'); }
  } finally {
    setStatus(false);
    btn.disabled = false;
  }
}

async function profileDownload() {
  const err = document.querySelector('#pfError');
  err?.classList.add('hidden');
  if (err) err.textContent = '';

  const username = document.querySelector('#pfHandle')?.value.trim();
  const platform = document.querySelector('#pfPlatform')?.value || 'youtube';
  const count = parseInt(document.querySelector('#pfCount')?.value || '0', 10) || 0;
  const quality = document.querySelector('#pfQuality')?.value || 'auto';
  const mode = 'video';
  if (!username || count <= 0) {
    if (err) { err.textContent = 'Vui lòng nhập username và số lượng hợp lệ.'; err.classList.remove('hidden'); }
    return;
  }

  setStatus(true, 'Đang tải từ tài khoản...');
  const btn = document.querySelector('#pfBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/profile_download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, username, count, quality, mode }),
    });
    if (!res.ok) {
      let msg = `Lỗi tải (${res.status})`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    const ctype = res.headers.get('Content-Type') || '';
    if (ctype.includes('application/json')) {
      const j = await res.json();
      if (j?.message) {
        if (err) { err.textContent = j.message; err.classList.remove('hidden'); }
        return;
      }
    }
    let filename = 'profile.zip';
    const dispo = res.headers.get('Content-Disposition');
    if (dispo) {
      const m = dispo.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const picked = decodeURIComponent(m?.[1] || m?.[2] || '');
      if (picked) filename = picked;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) {
    if (err) { err.textContent = e?.message || 'Có lỗi xảy ra.'; err.classList.remove('hidden'); }
  } finally {
    setStatus(false);
    btn.disabled = false;
  }
}

