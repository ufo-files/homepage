const fieldCanvas = document.getElementById("field");
const fieldCtx = fieldCanvas.getContext("2d");
const screenshotMode = new URLSearchParams(window.location.search).has("screenshot");
const prefersReducedMotion = screenshotMode || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let viewportWidth = 0;
let viewportHeight = 0;
let fieldPoints = [];
let pointer = { x: 0, y: 0, active: false };
let animationFrame = 0;
let screenshotSeed = 0;
let archiveCountLoading = false;
const archiveCountRefreshMs = 60 * 1000;
const archiveCountUrl = "https://raw.githubusercontent.com/ufo-files/data-archive-2/archive-count/archive-count.json";
const menuToggle = document.getElementById("menu-toggle");
const siteHeader = document.getElementById("site-header");
const siteNavigation = document.getElementById("site-navigation");
const mobileMenu = window.matchMedia("(max-width: 820px)");
const announcement = document.querySelector(".announcement-banner p");
const announcementMessages = [
  "Happy seeking.",
  "Enjoy your trip.",
  "Explore freely.",
  "Welcome to the rabbit hole.",
  "Question everything.",
  "Prepare to suspend disbelief.",
  "Trust no one.",
  "Open your eyes.",
  "Free your mind.",
  "Tune in.",
];

if (announcement) {
  const messageIndex = screenshotMode ? 0 : Math.floor(Math.random() * announcementMessages.length);
  announcement.textContent = announcementMessages[messageIndex];
}

function setMenuState(open = false) {
  if (!menuToggle || !siteHeader || !siteNavigation) return;
  const isMobile = mobileMenu.matches;
  const isOpen = isMobile && open;
  menuToggle.hidden = !isMobile;
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  siteNavigation.hidden = isMobile && !isOpen;
  siteHeader.classList.toggle("menu-open", isOpen);
}

if (menuToggle && siteNavigation) {
  setMenuState(false);
  menuToggle.addEventListener("click", () => {
    setMenuState(menuToggle.getAttribute("aria-expanded") !== "true");
  });
  siteNavigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuState(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
      setMenuState(false);
      menuToggle.focus();
    }
  });
  mobileMenu.addEventListener("change", () => setMenuState(false));
}

function seededRandom() {
  screenshotSeed = (screenshotSeed * 1664525 + 1013904223) >>> 0;
  return screenshotSeed / 4294967296;
}

function fieldRandom() {
  return screenshotMode ? seededRandom() : Math.random();
}

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;
  fieldCanvas.width = Math.floor(viewportWidth * ratio);
  fieldCanvas.height = Math.floor(viewportHeight * ratio);
  fieldCanvas.style.width = `${viewportWidth}px`;
  fieldCanvas.style.height = `${viewportHeight}px`;
  fieldCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  buildFieldPoints();
  if (prefersReducedMotion) {
    drawField();
  }
}

function buildFieldPoints() {
  const count = Math.max(42, Math.round((viewportWidth * viewportHeight) / 28000));
  screenshotSeed = (viewportWidth * 73856093) ^ (viewportHeight * 19349663) ^ 0x9e3779b9;
  fieldPoints = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: fieldRandom() * viewportWidth,
      y: fieldRandom() * viewportHeight,
      vx: Math.cos(angle) * (0.08 + fieldRandom() * 0.12),
      vy: Math.sin(angle) * (0.08 + fieldRandom() * 0.12),
      r: 1 + fieldRandom() * 1.8,
      ox: 0,
      oy: 0,
      rx: 0,
      ry: 0,
    };
  });
}

function drawField() {
  fieldCtx.clearRect(0, 0, viewportWidth, viewportHeight);
  fieldCtx.fillStyle = "rgba(17, 17, 17, .24)";
  fieldCtx.strokeStyle = "rgba(17, 17, 17, .045)";
  fieldCtx.lineWidth = 1;

  fieldPoints.forEach((point) => {
    if (!prefersReducedMotion) {
      point.x += point.vx;
      point.y += point.vy;
      if (point.x < -20) point.x = viewportWidth + 20;
      if (point.x > viewportWidth + 20) point.x = -20;
      if (point.y < -20) point.y = viewportHeight + 20;
      if (point.y > viewportHeight + 20) point.y = -20;
    }

    let targetOx = 0;
    let targetOy = 0;
    if (pointer.active && !prefersReducedMotion) {
      const dx = point.x - pointer.x;
      const dy = point.y - pointer.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < 220) {
        const influence = (1 - distance / 220) ** 2;
        targetOx = (-dx / distance) * influence * 34;
        targetOy = (-dy / distance) * influence * 34;
      }
    }
    point.ox += (targetOx - point.ox) * 0.08;
    point.oy += (targetOy - point.oy) * 0.08;
    point.rx = point.x + point.ox;
    point.ry = point.y + point.oy;

    fieldCtx.beginPath();
    fieldCtx.arc(point.rx, point.ry, point.r, 0, Math.PI * 2);
    fieldCtx.fill();
  });

  for (let i = 0; i < fieldPoints.length; i += 1) {
    for (let j = i + 1; j < fieldPoints.length; j += 1) {
      const a = fieldPoints[i];
      const b = fieldPoints[j];
      const distance = Math.hypot(a.rx - b.rx, a.ry - b.ry);
      if (distance > 150) continue;
      fieldCtx.globalAlpha = 1 - distance / 150;
      fieldCtx.beginPath();
      fieldCtx.moveTo(a.rx, a.ry);
      fieldCtx.lineTo(b.rx, b.ry);
      fieldCtx.stroke();
    }
  }

  if (pointer.active && !prefersReducedMotion) {
    fieldCtx.strokeStyle = "rgba(17, 17, 17, .07)";
    fieldCtx.lineWidth = 1;
    fieldPoints.forEach((point) => {
      const distance = Math.hypot(point.rx - pointer.x, point.ry - pointer.y);
      if (distance > 132) return;
      fieldCtx.globalAlpha = (1 - distance / 132) * .38;
      fieldCtx.beginPath();
      fieldCtx.moveTo(pointer.x, pointer.y);
      fieldCtx.lineTo(point.rx, point.ry);
      fieldCtx.stroke();
    });
  }
  fieldCtx.globalAlpha = 1;
}

function draw() {
  drawField();
  if (!prefersReducedMotion) {
    animationFrame = requestAnimationFrame(draw);
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatArchiveDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
    timeZoneName: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

async function loadPublishedArchiveCount() {
  const response = await fetch(`${archiveCountUrl}?v=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`archive count returned ${response.status}`);
  const archive = await response.json();
  if (!Number.isInteger(archive.count) || archive.count < 0) {
    throw new Error("archive count was malformed");
  }
  return {
    count: archive.count,
    generatedDate: formatArchiveDate(archive.generated_utc),
  };
}

async function loadArchiveCount() {
  const countElement = document.getElementById("archive-count");
  const statusElement = document.getElementById("archive-count-status");
  if (!countElement || !statusElement || archiveCountLoading) return;

  archiveCountLoading = true;
  try {
    const archive = await loadPublishedArchiveCount();
    countElement.textContent = formatNumber(archive.count);
    const updated = archive.generatedDate ? ` Updated ${archive.generatedDate}.` : "";
    statusElement.textContent = `Live Data Archive index.${updated}`;
  } catch (error) {
    countElement.textContent = "Unavailable";
    statusElement.textContent = "The live archive index is temporarily unavailable.";
  } finally {
    archiveCountLoading = false;
  }
}

resize();
loadArchiveCount();
if (!screenshotMode) {
  window.setInterval(loadArchiveCount, archiveCountRefreshMs);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadArchiveCount();
  });
}
if (!prefersReducedMotion && !animationFrame) {
  animationFrame = requestAnimationFrame(draw);
}
window.addEventListener("resize", resize);
window.addEventListener("pointermove", (event) => {
  pointer = { x: event.clientX, y: event.clientY, active: true };
});
window.addEventListener("pointerleave", () => {
  pointer.active = false;
});
