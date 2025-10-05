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
});

