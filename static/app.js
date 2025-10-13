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
  const cookies = document.querySelector('#cookies')?.value?.trim() || '';
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
      body: JSON.stringify({ url, mode, cookies }),
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
  // Tabs (new Sera UI style)
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-target');
      document.querySelectorAll('.download-card').forEach(sec => sec.classList.add('card-hidden'));
      if (target) document.getElementById(target)?.classList.remove('card-hidden');
    });
  });

  // Scroll header effect
  const header = document.querySelector('.download-header');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  // Add ripple effect to buttons
  document.querySelectorAll('.sera-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const ripple = document.createElement('span');
      ripple.classList.add('ripple-effect');
      
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.style.position = 'absolute';
      ripple.style.borderRadius = '50%';
      ripple.style.background = 'rgba(255, 255, 255, 0.5)';
      ripple.style.pointerEvents = 'none';
      ripple.style.animation = 'ripple-animation 0.6s ease-out';
      
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });

  // Add CSS for ripple animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ripple-animation {
      to { transform: scale(4); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  $("#downloadBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    download();
  });

  $("#url").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      download();
    }
  });

  const pfBtn = document.querySelector('#pfBtn');
  if (pfBtn) {
    pfBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await profileDownload();
    });
  }

  // Input focus animations
  document.querySelectorAll('.sera-input').forEach(input => {
    input.addEventListener('focus', function() {
      this.parentElement?.classList.add('input-focused');
    });
    input.addEventListener('blur', function() {
      this.parentElement?.classList.remove('input-focused');
    });
  });
});

function showToast(message) {
  const bar = document.querySelector('#snackbar');
  const text = document.querySelector('#snackbarText');
  if (!bar || !text) return;
  text.textContent = message;
  bar.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => bar.classList.add('hidden'), 2500);
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
  const cookies = document.querySelector('#pfCookies')?.value?.trim() || '';
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
      body: JSON.stringify({ platform, username, count, quality, mode, cookies }),
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
        showToast(j.message);
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


