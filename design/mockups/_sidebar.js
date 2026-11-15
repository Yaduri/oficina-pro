// Navegação compartilhada entre os mockups desktop.
// Variação B usa navegação no topo; as demais, menu lateral.
const NAV = [
  [null, [['layout-dashboard', 'Início'], ['calendar', 'Agenda']]],
  ['Atendimento', [['clipboard-check', 'Check-in'], ['file-text', 'Orçamentos', '6'], ['wrench', 'Ordens de serviço', '18']]],
  ['Cadastros', [['users', 'Clientes'], ['car', 'Veículos'], ['package', 'Estoque']]],
  ['Financeiro', [['wallet', 'Contas'], ['receipt', 'Notas fiscais'], ['bar-chart-3', 'Relatórios']]],
];
const BRAND = `<div class="brand"><div class="brand-mark"><i data-lucide="wrench"></i></div>Oficina<span class="brand-sub">Pro</span></div>`;
const SWITCHER = `<div class="switcher">
  <button class="on"><i data-lucide="layers" style="width:15px;height:15px"></i>Todas</button>
  <button><span class="tag mec" style="padding:0;background:none">Mecânica</span></button>
  <button><span class="tag ele" style="padding:0;background:none">Elétrica</span></button>
</div>`;

function renderSidebar(active) {
  window.ACTIVE = active;
  if (window.V === 'b') return;
  let html = BRAND;
  for (const [label, items] of NAV) {
    if (label) html += `<div class="nav-label">${label}</div>`;
    for (const [icon, name, count] of items) {
      html += `<div class="nav-item${name === active ? ' active' : ''}"><i data-lucide="${icon}"></i>${name}${count ? `<span class="count">${count}</span>` : ''}</div>`;
    }
  }
  html += `<div class="sidebar-foot">
    <div class="nav-item"><i data-lucide="settings"></i>Configurações</div>
    <div class="nav-item user"><span class="avatar sm">CS</span><div style="line-height:1.25"><div class="u-name">Carlos Silva</div><div class="u-org">Auto Center Silva</div></div></div>
  </div>`;
  document.querySelector('.sidebar').innerHTML = html;
}

function renderTopbar() {
  const bar = document.querySelector('.topbar');
  if (window.V === 'b') {
    const top = [['Início'], ['Agenda'], ['Check-in'], ['Orçamentos'], ['Ordens de serviço'], ['Clientes'], ['Estoque'], ['Financeiro']];
    bar.innerHTML = `${BRAND}
      <nav class="topnav">${top.map(([n]) => `<a class="${n === window.ACTIVE ? 'on' : ''}">${n}</a>`).join('')}</nav>
      <div class="spacer"></div>
      ${SWITCHER}
      <button class="icon-btn"><i data-lucide="search"></i></button>
      <button class="icon-btn"><i data-lucide="bell"></i><span class="dot"></span></button>
      <span class="avatar">CS</span>`;
    return;
  }
  bar.innerHTML = `
    <div class="search"><i data-lucide="search"></i>Buscar placa, cliente ou OS<kbd>Ctrl K</kbd></div>
    <div class="spacer"></div>
    ${SWITCHER}
    <button class="icon-btn"><i data-lucide="bell"></i><span class="dot"></span></button>
    <button class="btn primary"><i data-lucide="plus"></i>Novo check-in</button>`;
}
