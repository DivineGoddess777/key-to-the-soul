const themes = {
  lunar: { name: 'The Eclipse Gate', logo: 'logos/lunar-key.svg', compact: 'logos/lunar-key-compact.svg', meaning: 'YOU HOLD THE KEY' },
  velvet: { name: 'The Unbroken Thread', logo: 'logos/velvet-oracle.svg', compact: 'logos/velvet-oracle-compact.svg', meaning: 'EVERY PHASE IS STILL YOU' },
  flame: { name: 'The Ember Seal', logo: 'logos/sacred-flame.svg', hero: 'images/ember-seal-sculpted.png', compact: 'logos/sacred-flame-compact.svg', meaning: 'RETURN TO YOUR OWN FIRE' }
};
const preview = document.querySelector('.store-preview');
const status = document.querySelector('#direction-status');
const paperToggle = document.querySelector('#paper-toggle');

function readPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Preview works with storage disabled. */ }
}
function setTheme(key) {
  if (!themes[key]) key = 'flame';
  preview.dataset.theme = key;
  document.querySelector('#store-logo').src = themes[key].compact;
  document.querySelector('#hero-mark').src = themes[key].hero || themes[key].logo;
  document.querySelector('#hero-mark').classList.toggle('sculpted-hero', key === 'flame');
  document.querySelector('#hero-mark').alt = key === 'flame' ? 'Sculpted gold Ember Seal with copper edges and floating lunar phases' : themes[key].name + ': an original seal surrounded by eight moon phases';
  document.querySelector('#hero-meaning').textContent = themes[key].meaning;
  document.querySelector('#label-mark').src = themes[key].logo;
  document.querySelector('#stamp-mark').src = themes[key].compact;
  document.querySelector('.application-study').dataset.theme = key;
  status.textContent = `${themes[key].name} · storefront concept`;
  document.querySelectorAll('[data-theme]').forEach(button => {
    if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.theme === key));
  });
  document.querySelectorAll('[data-concept]').forEach(card => card.toggleAttribute('data-selected', card.dataset.concept === key));
  savePreference('ktts-direction-v3', key);
}
document.querySelectorAll('button[data-theme]').forEach(button => {
  button.addEventListener('click', () => {
    setTheme(button.dataset.theme);
    document.querySelector('#preview').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  });
});
function setPaper(enabled) {
  document.body.classList.toggle('paper-mode', enabled);
  paperToggle.setAttribute('aria-pressed', String(enabled));
  paperToggle.innerHTML = `${enabled ? 'View logos on dark' : 'View logos on ivory'} <span aria-hidden="true">◐</span>`;
  savePreference('ktts-paper', String(enabled));
}
paperToggle.addEventListener('click', () => setPaper(!document.body.classList.contains('paper-mode')));
setTheme(readPreference('ktts-direction-v3'));
setPaper(readPreference('ktts-paper') === 'true');
