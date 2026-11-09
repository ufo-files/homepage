const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.getElementById('site-navigation');
const mobile = window.matchMedia('(max-width: 640px)');

function setMenuState(open = false) {
  const expanded = mobile.matches && open;
  menuToggle.hidden = !mobile.matches;
  menuToggle.setAttribute('aria-expanded', String(expanded));
  menuToggle.textContent = expanded ? 'Close' : 'Menu';
  navigation.hidden = mobile.matches && !expanded;
  navigation.classList.toggle('menu-open', expanded);
}

menuToggle.addEventListener('click', () => {
  setMenuState(menuToggle.getAttribute('aria-expanded') !== 'true');
});
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenuState(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    setMenuState(false);
    menuToggle.focus();
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('header')) setMenuState(false);
});
mobile.addEventListener('change', () => setMenuState(false));
setMenuState(false);

// Keep YouTube requests out of the initial page load. The link remains usable without JS.
const watchStream = document.getElementById('watch-stream');
watchStream?.addEventListener('click', (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const iframe = document.createElement('iframe');
  iframe.src = 'https://www.youtube-nocookie.com/embed/wxNOhusyI8w?autoplay=1&mute=1&playsinline=1';
  iframe.title = 'UFN — Field Station live camera and radio spectrum';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  document.getElementById('broadcast-player').replaceChildren(iframe);
  iframe.focus();
});
