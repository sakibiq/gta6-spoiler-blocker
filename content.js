// GTA 6 Spoiler Blocker: finds GTA 6 videos, Shorts, posts and comments on YouTube and blurs or hides them.
(() => {
  // Every kind of video/post tile YouTube uses (home, search, sidebar, channel, Shorts shelf, notifications, posts).
  const TILE_SELECTOR = [
    "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-compact-video-renderer", "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer", "ytd-playlist-panel-video-renderer", "ytd-reel-item-renderer",
    "ytd-playlist-renderer", "ytd-compact-playlist-renderer", "ytd-radio-renderer", "ytd-compact-radio-renderer",
    "ytd-movie-renderer", "ytd-channel-renderer", "ytd-notification-renderer", "ytd-post-renderer",
    "ytd-backstage-post-thread-renderer", "ytd-universal-watch-card-renderer", "ytd-end-screen-video-renderer",
    "yt-lockup-view-model", "ytm-shorts-lockup-view-model", "ytm-shorts-lockup-view-model-v2",
    "yt-official-card-view-model",   // the big game card at the top of search results
    // mobile site
    "ytm-video-with-context-renderer", "ytm-compact-video-renderer", "ytm-reel-item-renderer", "ytm-rich-item-renderer"
  ].join(",");
  const COMMENT_SELECTOR = "ytd-comment-thread-renderer, ytm-comment-thread-renderer";
  const ATTR_TEXT = "[title], [aria-label], img[alt]";

  let settings = null;
  let regex = null;
  let scanTimer = 0;
  const revealedTiles = new WeakSet();     // tiles the user chose to show
  const revealedVideos = new Set();        // video ids the user chose to watch anyway

  // ---- text of an element: visible text plus titles / aria-labels / image alt text ----
  function textOf(el) {
    let t = el.textContent || "";
    const cover = el.querySelector(":scope > .gsb-cover");   // our own label says "GTA 6", so leave it out
    if (cover) t = t.replace(cover.textContent, "");
    for (const a of el.querySelectorAll(ATTR_TEXT)) {
      t += " " + (a.getAttribute("title") || "") + " " + (a.getAttribute("aria-label") || "") + " " + (a.getAttribute("alt") || "");
    }
    return t.replace(/\s+/g, " ");
  }

  // ---- tiles and comments ----
  function clearMark(el) {
    el.classList.remove("gsb-blurred", "gsb-hidden");
    el.querySelector(":scope > .gsb-cover")?.remove();
    delete el.dataset.gsbFlagged;
  }

  function mark(el, what) {
    el.dataset.gsbFlagged = "1";
    if (settings.mode === "hide") {
      el.classList.add("gsb-hidden");
      return;
    }
    el.classList.add("gsb-blurred");
    if (el.querySelector(":scope > .gsb-cover")) return;
    const cover = document.createElement("div");
    cover.className = "gsb-cover";
    const label = document.createElement("div");
    label.className = "gsb-cover-label";
    label.textContent = `GTA 6 ${what} hidden`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Show";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      revealedTiles.add(el);
      clearMark(el);
    });
    cover.append(label, btn);
    el.append(cover);
  }

  function check(el, what) {
    // YouTube reuses tile elements for new videos, so re-check whenever the text changes
    const text = textOf(el);
    if (el.dataset.gsbText === text) return;
    el.dataset.gsbText = text;
    revealedTiles.delete(el);
    if (regex && regex.test(text)) mark(el, what);
    else clearMark(el);
  }

  function scanTiles() {
    for (const el of document.querySelectorAll(TILE_SELECTOR)) {
      // only handle the outermost tile (some tiles are nested inside others)
      if (el.parentElement?.closest(TILE_SELECTOR)) continue;
      if (revealedTiles.has(el) && el.dataset.gsbText === textOf(el)) continue;
      check(el, "video");
    }
    if (settings.hideComments) {
      for (const el of document.querySelectorAll(COMMENT_SELECTOR)) {
        if (revealedTiles.has(el) && el.dataset.gsbText === textOf(el)) continue;
        check(el, "comment");
      }
    }
  }

  // ---- hover / autoplay previews ----
  // YouTube plays previews in one floating player laid over the tile, outside the tile itself,
  // so the blur doesn't reach it. Pause and hide it whenever it sits over a blocked tile.
  const PREVIEW_SELECTOR = "ytd-video-preview, ytm-video-preview";

  function checkPreviews() {
    for (const p of document.querySelectorAll(PREVIEW_SELECTOR)) {
      const r = p.getBoundingClientRect();
      let spoiler = false;
      if (r.width && r.height) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (const el of document.querySelectorAll("[data-gsb-flagged]")) {
          const t = el.getBoundingClientRect();
          if (cx >= t.left && cx <= t.right && cy >= t.top && cy <= t.bottom) { spoiler = true; break; }
        }
        if (!spoiler && regex && regex.test(textOf(p))) spoiler = true;
      }
      p.classList.toggle("gsb-preview-off", spoiler);
      if (spoiler) for (const v of p.querySelectorAll("video")) if (!v.paused) v.pause();
    }
  }

  // ---- video page guard: cover the page and pause when the open video is about GTA 6 ----
  function currentVideoId() {
    const u = new URL(location.href);
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/shorts\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function currentVideoText() {
    const parts = [];
    if (location.pathname === "/watch") {
      const watch = document.querySelector("ytd-watch-metadata h1");
      if (watch) parts.push(watch.textContent);
      const owner = document.querySelector("ytd-watch-metadata #owner #channel-name");
      if (owner) parts.push(owner.textContent);
    } else {
      // Shorts: only the reel on screen (the hidden watch page can still hold an old title)
      const reel = document.querySelector("ytd-reel-video-renderer[is-active]");
      if (reel) parts.push(textOf(reel.querySelector("#overlay, .metadata-container, yt-reel-metapanel-view-model") || reel));
    }
    const mobile = document.querySelector(".slim-video-information-title, ytm-slim-video-metadata-section-renderer");
    if (mobile) parts.push(mobile.textContent);
    return parts.join(" ").replace(/\s+/g, " ");
  }

  function guardActive() {
    return !!document.querySelector(".gsb-guard");
  }

  function pauseAll() {
    for (const v of document.querySelectorAll("video")) if (!v.paused) v.pause();
  }

  function showGuard(id) {
    if (guardActive()) return;
    const g = document.createElement("div");
    g.className = "gsb-guard";
    g.dataset.video = id;
    // built with DOM calls: YouTube's Trusted Types policy blocks innerHTML
    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text) n.textContent = text;
      return n;
    };
    const box = el("div", "gsb-guard-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "gsb-guard-title");
    const title = el("p", "gsb-guard-title", "This video looks like a GTA 6 spoiler");
    title.id = "gsb-guard-title";
    const back = el("button", "gsb-back", "Go back");
    const watch = el("button", "gsb-secondary gsb-watch", "Watch anyway");
    back.type = watch.type = "button";
    back.addEventListener("click", () => {
      if (history.length > 1) history.back();
      else location.href = "https://www.youtube.com/";
    });
    watch.addEventListener("click", () => {
      revealedVideos.add(id);
      hideGuard();
    });
    const actions = el("div", "gsb-guard-actions");
    actions.append(back, watch);
    box.append(title, el("p", "gsb-guard-text", "It's paused and covered so you don't see anything by accident."), actions);
    g.append(box);
    (document.body || document.documentElement).append(g);
    pauseAll();
  }

  function hideGuard() {
    document.querySelector(".gsb-guard")?.remove();
  }

  // ---- what is this video called? ----
  // "sure": the page's own title, once it belongs to the video in the URL.
  // "early": quicker hints (the player's title bar, the tab title) that show up before the page has drawn,
  //          enough to cover a video early but not to clear one.
  let navigating = false;   // between YouTube's in-page navigation start and finish the tab title is stale
  window.addEventListener("yt-navigate-start", () => { navigating = true; });
  window.addEventListener("yt-navigate-finish", () => { navigating = false; scheduleScan(); });

  function videoTitles(id) {
    let sure = null;
    const early = [];
    if (location.pathname === "/watch") {
      const flexy = document.querySelector("ytd-watch-flexy");
      const h1 = document.querySelector("ytd-watch-metadata h1")?.textContent.trim();
      if (h1 && flexy?.getAttribute("video-id") === id) sure = currentVideoText();
      const player = document.querySelector("#movie_player .ytp-title-link")?.textContent.trim();
      if (player) early.push(player);
      if (!navigating && document.title !== "YouTube") early.push(document.title);
    } else {
      const text = currentVideoText().trim();   // the Short on screen
      if (text) sure = text;
    }
    return { sure, early: early.join(" ") };
  }

  const clearedVideos = new Set();   // checked and not a spoiler
  let heldVideo = null;              // a video we paused while its title was still loading
  let holdTimer = 0;
  const HOLD_MS = 6000;              // never hold a normal video longer than this

  function releaseHeld() {
    clearTimeout(holdTimer);
    holdTimer = 0;
    const v = heldVideo;
    heldVideo = null;
    if (v && v.paused && !guardActive()) v.play().catch(() => {});
  }

  function scanVideoPage() {
    const id = currentVideoId();
    const g = document.querySelector(".gsb-guard");
    if (g && g.dataset.video !== id) hideGuard();    // navigated to another page
    if (!id || !settings.guardWatch || revealedVideos.has(id) || clearedVideos.has(id)) {
      if (heldVideo) releaseHeld();
      return;
    }
    if (!regex) return;
    const { sure, early } = videoTitles(id);
    if (sure !== null) {
      if (regex.test(sure)) {
        heldVideo = null;
        showGuard(id);
        delete document.querySelector(".gsb-guard").dataset.early;   // confirmed
      } else {
        clearedVideos.add(id);
        hideGuard();             // an early hint was wrong
        releaseHeld();
      }
    } else if (early && regex.test(early)) {
      // cover now; the page title will confirm it (or lift the cover and resume)
      const playing = [...document.querySelectorAll("video")].find((v) => !v.paused);
      if (playing) heldVideo = playing;
      showGuard(id);
      document.querySelector(".gsb-guard").dataset.early = "1";
    }
  }

  // Hold playback until the title is checked, and keep a covered video from starting
  // (autoplay, keyboard shortcuts, Shorts scrolling).
  document.addEventListener("play", (e) => {
    if (!settings?.enabled || !(e.target instanceof HTMLMediaElement)) return;
    if (e.target.closest(PREVIEW_SELECTOR)) { checkPreviews(); return; }   // a hover/autoplay preview
    const id = currentVideoId();
    const g = document.querySelector(".gsb-guard");
    if (g && g.dataset.video === id) {                               // this video is covered
      e.target.pause();
      if (g.dataset.early) heldVideo = e.target;                     // resume it if the cover turns out wrong
      return;
    }
    if (g) hideGuard();                                              // cover left over from the previous video
    if (!settings.guardWatch || !id || revealedVideos.has(id) || clearedVideos.has(id)) return;
    e.target.pause();
    heldVideo = e.target;
    scheduleScan();
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      // the page title never showed up: let it play unless a quick hint says GTA 6
      const { early } = videoTitles(id);
      if (regex && early && regex.test(early)) { heldVideo = null; showGuard(id); return; }
      clearedVideos.add(id);
      releaseHeld();
    }, HOLD_MS);
  }, true);

  // ---- scanning ----
  function scan() {
    scanTimer = 0;
    if (!settings) return;
    if (!settings.enabled) { resetAll(); return; }
    scanTiles();
    checkPreviews();
    scanVideoPage();
  }

  function scheduleScan() {
    if (!scanTimer) scanTimer = setTimeout(scan, 150);
  }

  function resetAll() {
    for (const el of document.querySelectorAll("[data-gsb-text]")) {
      clearMark(el);
      delete el.dataset.gsbText;
    }
    for (const p of document.querySelectorAll(".gsb-preview-off")) p.classList.remove("gsb-preview-off");
    clearedVideos.clear();   // keywords may have changed: check open videos again
    hideGuard();
  }

  function flaggedCount() {
    return document.querySelectorAll("[data-gsb-flagged]").length + (guardActive() ? 1 : 0);
  }

  async function applySettings() {
    settings = await gsbLoadSettings();
    regex = gsbBuildRegex(settings.keywords);
    resetAll();
    scan();
  }

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "sync") applySettings();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === "gsb-count") reply({ count: flaggedCount() });
  });

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["title", "aria-label", "is-active"]
  });
  window.addEventListener("popstate", scheduleScan);

  applySettings();
})();
