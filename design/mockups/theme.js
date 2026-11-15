// Seleciona a variação de design pela URL: ?v=a | b | c | d
// O CSS do tema entra por último no <head> para sobrepor os estilos da página.
window.V = new URLSearchParams(location.search).get('v') || 'a';
document.documentElement.dataset.v = window.V;
if (window.V !== 'a') {
  document.addEventListener('DOMContentLoaded', () => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `theme-${window.V}.css`;
    document.head.appendChild(l);
  });
}
