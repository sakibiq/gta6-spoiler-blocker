// Popup: edit settings (saved straight to chrome.storage.sync; open YouTube tabs update live).
const $ = (id) => document.getElementById(id);
let saveTimer = 0;

function render(s) {
  $("enabled").checked = s.enabled;
  document.body.classList.toggle("off", !s.enabled);
  for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === s.mode;
  $("guardWatch").checked = s.guardWatch;
  $("hideComments").checked = s.hideComments;
  $("keywords").value = s.keywords.join("\n");
}

async function save(patch) {
  await chrome.storage.sync.set(patch);
  $("saved").textContent = "Saved";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => ($("saved").textContent = ""), 1500);
  setTimeout(showCount, 400);
}

async function showCount() {
  const status = $("status");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https:\/\/(www|m)\.youtube\.com\//.test(tab.url)) {
    status.textContent = "Open YouTube to start blocking.";
    return;
  }
  if (!$("enabled").checked) { status.textContent = "Blocking is off."; return; }
  try {
    const { count } = await chrome.tabs.sendMessage(tab.id, { type: "gsb-count" });
    status.innerHTML = count
      ? `<strong>${count}</strong> GTA 6 spoiler${count === 1 ? "" : "s"} blocked on this page.`
      : "No GTA 6 spoilers on this page.";
  } catch {
    status.textContent = "Reload this YouTube tab to start blocking.";
  }
}

(async () => {
  render(await gsbLoadSettings());
  showCount();

  $("enabled").addEventListener("change", (e) => {
    document.body.classList.toggle("off", !e.target.checked);
    save({ enabled: e.target.checked });
  });
  for (const r of document.querySelectorAll('input[name="mode"]')) {
    r.addEventListener("change", () => save({ mode: r.value }));
  }
  $("guardWatch").addEventListener("change", (e) => save({ guardWatch: e.target.checked }));
  $("hideComments").addEventListener("change", (e) => save({ hideComments: e.target.checked }));

  let typingTimer = 0;
  $("keywords").addEventListener("input", (e) => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      const keywords = e.target.value.split("\n").map((k) => k.trim()).filter(Boolean);
      save({ keywords });
    }, 500);
  });
  $("reset").addEventListener("click", async () => {
    render(GSB_DEFAULTS);
    await save({ ...GSB_DEFAULTS });
  });
})();
