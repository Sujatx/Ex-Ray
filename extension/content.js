(function () {
  console.log("[Ex-Ray] content script loaded on", location.href);

  const TARGET_COUNT = 40;
  let deepScanInProgress = false;
  let lastPath = location.pathname;

  // per-thread deep scan cache
  const deepCacheByThread = new Map();

  function isDmThread() {
    return location.pathname.startsWith("/direct/t/");
  }

  function getThreadId() {
    const parts = location.pathname.split("/");
    const tIndex = parts.indexOf("t");
    if (tIndex !== -1 && parts.length > tIndex + 1) {
      return parts[tIndex + 1] || null;
    }
    return null;
  }

  function parseBubble(el) {
    const rect = el.getBoundingClientRect();
    const isYou = rect.left > window.innerWidth / 2;

    let full = el.innerText?.trim();
    if (!full) return null;

    let lines = full
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !l.startsWith("You replied"))
      .filter((l) => !l.startsWith("Original message"))
      .filter((l) => !l.startsWith("You sent"));

    const timeRegex = /^\d{1,2}:\d{2}$/;
    lines = lines.filter((l) => !timeRegex.test(l));

    if (!lines.length) return null;

    const messageText = lines[lines.length - 1];
    if (!messageText) return null;

    if (messageText === "Loading..." || messageText === "Enter") return null;
    if (messageText.length < 1 || messageText.length > 400) return null;

    return {
      sender: isYou ? "you" : "them",
      text: messageText,
    };
  }

  function getVisibleMessages() {
    if (!isDmThread()) return [];
    const bubbles = document.querySelectorAll("div[role='row'] div[dir='auto']");
    const messages = [];

    bubbles.forEach((el) => {
      const parsed = parseBubble(el);
      if (parsed) messages.push(parsed);
    });

    console.log("[Ex-Ray] visible messages:", messages.length);
    return messages;
  }

  function findScroller() {
    const anyBubble = document.querySelector("div[role='row'] div[dir='auto']");
    if (!anyBubble) return null;

    let node = anyBubble.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      const scrollable =
        (overflowY === "auto" || overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight + 20;

      if (scrollable) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  async function runDeepScan() {
    if (!isDmThread()) {
      console.log("[Ex-Ray] deep scan skipped (not DM thread)");
      return;
    }
    if (deepScanInProgress) {
      console.log("[Ex-Ray] deep scan already in progress");
      return;
    }

    const threadId = getThreadId();
    if (!threadId) {
      console.log("[Ex-Ray] deep scan: no thread id");
      return;
    }

    const scroller = findScroller();
    if (!scroller) {
      console.log("[Ex-Ray] deep scan: no scroller found");
      return;
    }

    deepScanInProgress = true;
    deepCacheByThread.set(threadId, []);
    console.log("[Ex-Ray] deep scan started for thread", threadId);

    const seen = new Set();

    try {
      let attempts = 0;

      // scroll upwards and collect up to TARGET_COUNT messages
      while (attempts < 25) {
        const visible = getVisibleMessages();
        const cache = deepCacheByThread.get(threadId) || [];

        for (const m of visible) {
          const key = m.sender + "||" + m.text;
          if (!seen.has(key)) {
            seen.add(key);
            cache.push(m);
          }
        }

        deepCacheByThread.set(threadId, cache);

        if (cache.length >= TARGET_COUNT) {
          console.log("[Ex-Ray] deep scan hit target:", cache.length);
          break;
        }

        if (scroller.scrollTop <= 0) {
          console.log("[Ex-Ray] deep scan reached top, stopping");
          break;
        }

        scroller.scrollTop -= 500;
        attempts++;
        await new Promise((r) => setTimeout(r, 250));
      }

      let finalCache = deepCacheByThread.get(threadId) || [];
      if (finalCache.length > TARGET_COUNT) {
        finalCache = finalCache.slice(-TARGET_COUNT);
      }
      deepCacheByThread.set(threadId, finalCache);

      console.log("[Ex-Ray] deep scan collected messages:", finalCache.length);
    } finally {
      // scroll back to bottom
      try {
        const scroller2 = findScroller();
        if (scroller2) {
          scroller2.scrollTop = scroller2.scrollHeight;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 250));

      deepScanInProgress = false;
      console.log("[Ex-Ray] deep scan finished");
    }
  }

  function getMessagesForAnalysis() {
    const threadId = getThreadId();
    const visible = getVisibleMessages();

    let combined = [];
    const seen = new Set();

    const addList = (list) => {
      for (const m of list) {
        const key = m.sender + "||" + m.text;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(m);
        }
      }
    };

    if (threadId && deepCacheByThread.has(threadId)) {
      const cached = deepCacheByThread.get(threadId) || [];
      console.log("[Ex-Ray] using cached deep scan messages:", cached.length);
      addList(cached);
    }

    addList(visible);

    if (combined.length > TARGET_COUNT) {
      combined = combined.slice(-TARGET_COUNT);
    }

    console.log("[Ex-Ray] messages used for analysis:", combined.length);
    return combined;
  }

  /* --------------------------
     UI: glassy loading overlay
     -------------------------- */
  function showLoadingOverlay() {
    let overlay = document.getElementById("exray-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "exray-overlay";
      overlay.style.position = "fixed";
      overlay.style.bottom = "130px";
      overlay.style.right = "24px";
      overlay.style.zIndex = "9999999";
      overlay.style.padding = "14px";
      overlay.style.borderRadius = "14px";
      // glass morphism
      overlay.style.background = "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02))";
      overlay.style.backdropFilter = "blur(8px) saturate(120%)";
      overlay.style.webkitBackdropFilter = "blur(8px) saturate(120%)";
      overlay.style.border = "1px solid rgba(255,255,255,0.06)";
      overlay.style.boxShadow = "0 12px 30px rgba(0,0,0,0.55)";
      overlay.style.color = "#e6eef8";
      overlay.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      overlay.style.fontSize = "13px";
      overlay.style.maxWidth = "360px";
      document.body.appendChild(overlay);
    }

    overlay.style.display = "block";
    overlay.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
        <div style="font-weight:700; letter-spacing:0.02em; color:#dbeafe;">Ex-Ray Scan</div>

        <button id="exray-close-btn"
          aria-label="Close"
          style="
            border:none;
            width:28px;
            height:28px;
            border-radius:50%;
            font-size:14px;
            cursor:pointer;
            background:rgba(255,255,255,0.03);
            color:#fff;
            display:flex;
            align-items:center;
            justify-content:center;
            padding:0;
            line-height:1;
            border:1px solid rgba(255,255,255,0.06);
          ">
          ×
        </button>
      </div>

      <div style="font-size:12px; opacity:0.95; margin-bottom:10px;">
        Scanning this chat — fetching up to ${TARGET_COUNT} messages. Please wait...
      </div>

  <div style="display:flex; justify-content:flex-end;">
    <div style="
      font-size:11px;
      color:rgba(230,238,248,0.85);
      background:rgba(255,255,255,0.03);
      border:1px solid rgba(255,255,255,0.06);
      padding:6px 10px;
      border-radius:999px;
      display:flex;
      align-items:center;
      gap:6px;
    ">
      <span style="
        width:6px;
        height:6px;
        border-radius:999px;
        background:#22c55e;
        box-shadow:0 0 6px rgba(34,197,94,0.8);
      "></span>
      <span>deep scan in progress…</span>
    </div>
  </div>
    `;

    const closeBtn = overlay.querySelector("#exray-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        overlay.style.display = "none";
      });
    }
  }

  /* --------------------------
     UI: glassy final overlay (with branding)
     -------------------------- */
  function showOverlay(data) {
    let overlay = document.getElementById("exray-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "exray-overlay";
      overlay.style.position = "fixed";
      overlay.style.bottom = "120px";
      overlay.style.right = "24px";
      overlay.style.zIndex = "9999999";
      overlay.style.padding = "14px";
      overlay.style.borderRadius = "16px";
      overlay.style.background = "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02))";
      overlay.style.backdropFilter = "blur(10px) saturate(120%)";
      overlay.style.webkitBackdropFilter = "blur(10px) saturate(120%)";
      overlay.style.border = "1px solid rgba(255,255,255,0.06)";
      overlay.style.boxShadow = "0 18px 50px rgba(0,0,0,0.6)";
      overlay.style.color = "#e6eef8";
      overlay.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      overlay.style.fontSize = "13px";
      overlay.style.maxWidth = "380px";
      document.body.appendChild(overlay);
    }

    overlay.style.display = "block";

    const threadId = getThreadId();
    const hasDeep =
      threadId &&
      deepCacheByThread.has(threadId) &&
      (deepCacheByThread.get(threadId)?.length || 0) > 0;

    const overallRaw = data.overall_label || "unknown";
    const youLabel = data.you_label || "unknown";
    const themLabel = data.them_label || "unknown";
    const stats = data.stats || {};
    const verdict = data.verdict || "";

    const youMsgs = stats.you_messages ?? "?";
    const themMsgs = stats.them_messages ?? "?";
    const totalMsgs = stats.total_messages ?? "?";
    const energyMatch = stats.energy_match ?? "?";
    const ghostRisk = stats.ghost_risk ?? "?";
    const willAgain = stats.will_they_text_again ?? "?";

    const prettyOverall = String(overallRaw).replace(/_/g, " ");

    // color accent
    let overallColor = "#94a3b8";
    if (overallRaw === "flirty_playful") overallColor = "#fb923c";
    else if (overallRaw === "friendly_chill") overallColor = "#34d399";
    else if (overallRaw === "dry_drifting") overallColor = "#9ca3af";
    else if (overallRaw === "awkward_forced") overallColor = "#f59e0b";
    else if (overallRaw === "argument_tension") overallColor = "#fb7185";
    else if (overallRaw === "transactional_only") overallColor = "#94a3b8";

    const deepTag = hasDeep
      ? `<span style="color:#10b981; font-size:11px; margin-left:6px; padding:4px 7px; border-radius:999px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.12);">deep scan</span>`
      : "";

    overlay.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;">
        <div>
          <div style="font-size:11px; letter-spacing:0.03em; text-transform:uppercase; color:rgba(226,234,248,0.8);">Ex-Ray</div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
            <span style="
              font-size:14px;
              font-weight:700;
              padding:6px 12px;
              border-radius:999px;
              background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
              border:1px solid rgba(148,163,184,0.06);
              display:inline-flex;
              align-items:center;
              gap:8px;
            ">
              <span style="
                display:inline-block;
                width:10px;
                height:10px;
                border-radius:999px;
                background:${overallColor};
                box-shadow: 0 2px 8px rgba(0,0,0,0.35) inset;
              "></span>
              <span style="color:#e6eef8;">${prettyOverall}</span>
            </span>
            ${deepTag}
          </div>
        </div>

        <button id="exray-close-btn" title="Close"
          style="
            border:none;
            width:28px;
            height:28px;
            border-radius:50%;
            font-size:14px;
            cursor:pointer;
            background:rgba(255,255,255,0.02);
            color:#e6eef8;
            display:flex;
            align-items:center;
            justify-content:center;
            padding:0;
            line-height:1;
            border:1px solid rgba(255,255,255,0.06);
          ">
          ×
        </button>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:4px; font-size:13px;">
        <div style="padding:10px; border-radius:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04);">
          <div style="font-weight:700; margin-bottom:6px; color:#e6eef8;">You</div>
          <div style="opacity:0.9;">Mood: <b>${youLabel}</b></div>
          <div style="opacity:0.9;">Msgs: <b>${youMsgs}</b></div>
        </div>
        <div style="padding:10px; border-radius:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04);">
          <div style="font-weight:700; margin-bottom:6px; color:#e6eef8;">Them</div>
          <div style="opacity:0.9;">Mood: <b>${themLabel}</b></div>
          <div style="opacity:0.9;">Msgs: <b>${themMsgs}</b></div>
        </div>
      </div>

      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; font-size:13px;">
        <div style="padding:7px 10px; border-radius:999px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04);">
          Total: <b>${totalMsgs}</b>
        </div>
        <div style="padding:7px 10px; border-radius:999px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04);">
          Energy match: <b>${energyMatch}%</b>
        </div>
        <div style="padding:7px 10px; border-radius:999px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04);">
          Ghost risk: <b>${ghostRisk}%</b>
        </div>
        <div style="padding:7px 10px; border-radius:999px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04);">
          Will they text: <b>${willAgain}%</b>
        </div>
      </div>

      <div style="margin-top:12px; font-size:13px; line-height:1.45; color:#dbeafe;">
        ${verdict}
      </div>

      <div style="margin-top:12px; text-align:right;">
        <button id="exray-rescan-btn" style="
            border:none;
            padding:8px 12px;
            border-radius:999px;
            font-size:13px;
            cursor:pointer;
            background:linear-gradient(135deg,#2563eb,#7c3aed);
            color:#fff;
            border:1px solid rgba(255,255,255,0.06);
          ">Scan again</button>
      </div>

      <div style="margin-top:10px; font-size:11px; opacity:0.6; text-align:left;">
        Ex-Ray • by Sujat
      </div>
    `;

    // close & rescan wiring
    const closeBtn = overlay.querySelector("#exray-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        overlay.style.display = "none";
      });
    }

    const rescanBtn = overlay.querySelector("#exray-rescan-btn");
    if (rescanBtn) {
      rescanBtn.addEventListener("click", () => {
        scanCurrentThread();
      });
    }
  }

  async function scanCurrentThread() {
    if (!isDmThread()) {
      alert("Open an Instagram DM chat to analyze vibes.");
      return;
    }

    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      console.log("[Ex-Ray] path changed:", lastPath);
    }

    // disable FAB visually while scanning
    const fab = document.getElementById("exray-fab");
    if (fab) {
      fab.disabled = true;
      fab.style.opacity = "0.6";
      fab.style.cursor = "wait";
    }

    showLoadingOverlay();

    try {
      // always attempt a deep scan first to get more context
      await runDeepScan();

      const messages = getMessagesForAnalysis();
      if (!messages.length) {
        console.warn("[Ex-Ray] no messages found for analysis");
        showOverlay({
          overall_label: "unknown",
          you_label: "unknown",
          them_label: "unknown",
          stats: { total_messages: 0 },
          verdict: "No readable messages found in this chat.",
        });
        return;
      }

      console.log("[Ex-Ray] sending messages to backend:", messages.length);

      const res = await fetch("https://ex-ray-backend.onrender.com/analyze_instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      if (!res.ok) {
        console.warn("[Ex-Ray] backend error status:", res.status);
        showOverlay({
          overall_label: "error",
          you_label: "unknown",
          them_label: "unknown",
          stats: {},
          verdict: "Backend error while analyzing this chat.",
        });
        return;
      }

      const data = await res.json();
      console.log("[Ex-Ray] backend response:", data);
      showOverlay(data);
    } catch (err) {
      console.error("[Ex-Ray] error calling backend:", err);
      showOverlay({
        overall_label: "error",
        you_label: "unknown",
        them_label: "unknown",
        stats: {},
        verdict: "Something broke while scanning. Try again.",
      });
    } finally {
      // restore FAB
      if (fab) {
        fab.disabled = false;
        fab.style.opacity = "1";
        fab.style.cursor = "pointer";
      }
    }
  }

  function createLauncherButton() {
    if (document.getElementById("exray-fab")) return;

    const btn = document.createElement("button");
    btn.id = "exray-fab";

    // chat bubble + vibe waves (svg)
    btn.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
           xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <!-- bubble -->
        <path d="M5 5.5C5 4.12 6.12 3 7.5 3h9A2.5 2.5 0 0 1 19 5.5v6a2.5 2.5 0 0 1-2.5 2.5H13l-2.5 3L10.6 14H7.5A2.5 2.5 0 0 1 5 11.5v-6Z"
              stroke="white" stroke-width="1.8" stroke-linejoin="round" fill="none"/>
        <!-- 2 “vibe” lines inside -->
        <path d="M8.5 7.5h5.5" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M8.5 10.5h3.5" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
        <!-- lil sparkle -->
        <path d="M18 7.2l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4.4-.9Z"
              fill="white"/>
      </svg>
    `;

    btn.style.position = "fixed";
    btn.style.bottom = "90px";
    btn.style.right = "24px";
    btn.style.width = "56px";
    btn.style.height = "56px";
    btn.style.borderRadius = "50%";
    btn.style.border = "1px solid rgba(255,255,255,0.06)";
    btn.style.background = "linear-gradient(135deg, #4f46e5, #ec4899)";
    btn.style.color = "#ffffff";
    btn.style.cursor = "pointer";
    btn.style.zIndex = "99999999";
    btn.style.boxShadow = "0 12px 34px rgba(4,7,16,0.65)";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.backdropFilter = "blur(6px) saturate(120%)";
    btn.style.transition = "0.18s ease-out";
    btn.style.padding = "0";
    // ensure GPU layer for crispness
    btn.style.transform = "translateZ(0)";

    btn.onmouseenter = () => {
      btn.style.transform = "translateZ(0) scale(1.08) translateY(-3px)";
      btn.style.boxShadow = "0 18px 48px rgba(4,7,16,0.72)";
    };
    btn.onmouseleave = () => {
      btn.style.transform = "translateZ(0) scale(1) translateY(0)";
      btn.style.boxShadow = "0 12px 34px rgba(4,7,16,0.65)";
    };

    // ONE-SHOT SCAN ON CLICK
    btn.addEventListener("click", () => {
      scanCurrentThread();
    });

    document.body.appendChild(btn);
  }

  // wait a bit for IG DOM, then inject launcher
  setTimeout(createLauncherButton, 1500);
})();
