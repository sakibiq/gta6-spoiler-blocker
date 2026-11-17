// Settings and keyword matching shared by the content script and the popup.

const GSB_DEFAULTS = {
  enabled: true,
  mode: "blur",          // "blur" = blurred with a "Show" button, "hide" = removed from the page
  hideComments: true,    // also check comments
  guardWatch: true,      // pause and cover a video page whose title is about GTA 6
  keywords: [
    "gta 6",
    "gta vi",
    "grand theft auto 6",
    "grand theft auto vi",
    "vice city",
    "leonida",
    "lucia caminos",
    "jason duval"
  ]
};

// Turn the keyword list into one case-insensitive regex.
// Spaces in a keyword match any run of spaces, dashes, dots, colons or underscores,
// or nothing, so "gta 6" also catches "GTA6", "gta-6" and "#GTA6".
// A keyword only matches as a whole word: "gta vi" won't match "gta vice city", "gta 6" won't match "gta 60fps".
function gsbBuildRegex(keywords) {
  const parts = (keywords || [])
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .map((k) => k.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\-_.:]*"));
  if (!parts.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`, "iu");
}

async function gsbLoadSettings() {
  const stored = await chrome.storage.sync.get(GSB_DEFAULTS);
  return { ...GSB_DEFAULTS, ...stored };
}
