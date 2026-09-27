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
