// ================== Supabase ==================
const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ================== DOM refs ==================
const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const userInfo = document.getElementById('user-info');
const content = document.getElementById('content');
const title = document.getElementById('title');

let currentUser = null;
const CHECKLISTS = {
  'NR-06 — EPI': ['Capacete de segurança em uso', 'Óculos de proteção adequados à atividade', 'Luvas apropriadas para o trabalho', 'Calçado de segurança (botina) em bom estado'],
  'NR-10 — Instalações elétricas': ['Quadros elétricos sinalizados e trancados', 'Fiação sem emendas expostas', 'Aterramento das instalações', 'Uso de EPI isolante por eletricistas'],
  'NR-11 — Transporte e movimentação de materiais': ['Empilhamento seguro e estável', 'Sinalização das rotas de circulação', 'Capacidade de carga respeitada nos equipamentos', 'Operadores de máquinas habilitados'],
  'NR-12 — Máquinas e equipamentos': ['Proteções fixas e móveis instaladas', 'Dispositivo de parada de emergência funcional', 'Manual de instruções disponível', 'Manutenção preventiva em dia'],
  'NR-17 — Ergonomia': ['Mobiliário e postos de trabalho adequados', 'Pausas para descanso respeitadas', 'Levantamento de peso dentro dos limites', 'Iluminação adequada ao posto de trabalho'],
  'NR-18 — Canteiro': ['Guarda-corpo e proteção contra quedas', 'Organização do canteiro', 'Instalações elétricas', 'Uso adequado de EPI'],
  'NR-23 — Proteção contra incêndios': ['Extintores dentro da validade e desobstruídos', 'Saídas de emergência sinalizadas e livres', 'Brigada de incêndio treinada', 'Rota de fuga sem obstáculos'],
  'NR-26 — Sinalização de segurança': ['Sinalização de áreas de risco visível', 'Cores de segurança aplicadas corretamente', 'Placas de EPI obrigatório nos acessos', 'Sinalização de piso molhado/escorregadio'],
  'NR-33 — Espaços confinados': ['Permissão de Entrada e Trabalho (PET) preenchida', 'Monitoramento de gases realizado', 'Ventilação do espaço', 'Vigia posicionado na entrada'],
  'NR-35 — Trabalho em altura': ['Uso de cinto de segurança tipo paraquedista', 'Ponto de ancoragem adequado', 'Treinamento e capacitação da equipe', 'Sinalização da área de risco'],
};
let activeInspection = null; // {id, code, items:[description,...]}
let finishingInspection = false;

// ================== Autenticação ==================
async function boot() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  session ? showApp(session.user) : showLogin();
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    session ? showApp(session.user) : showLogin();
  });
}

function showLogin() {
  currentUser = null;
  loginScreen.style.display = 'flex';
  appShell.style.display = 'none';
}

async function showApp(user) {
  currentUser = user;
  const expired = await isAccessExpired();
  if (expired) {
    await supabaseClient.auth.signOut();
    currentUser = null;
    loginScreen.style.display = 'flex';
    appShell.style.display = 'none';
    loginError.textContent = 'Seu acesso de teste expirou. Fale com o administrador para liberar de novo.';
    return;
  }
  loginScreen.style.display = 'none';
  appShell.style.display = 'flex';
  await loadUserInfo();
  dashboard();
}

async function isAccessExpired() {
  const { data } = await supabaseClient.from('profiles').select('access_expires_at').eq('id', currentUser.id).single();
  if (!data || !data.access_expires_at) return false;
  return new Date(data.access_expires_at).getTime() < Date.now();
}

async function loadUserInfo() {
  const { data } = await supabaseClient.from('profiles').select('full_name, role').eq('id', currentUser.id).single();
  const name = data?.full_name || currentUser.email;
  const role = data?.role ? data.role.toUpperCase() : 'USUÁRIO';
  userInfo.innerHTML = `<button class="logout-button" id="logout-btn" aria-label="Sair da conta" title="Sair">↗</button>`;
  const profileName = document.querySelector(".profile-copy strong");
  if (profileName) { profileName.textContent = name; profileName.title = name; }
  const profileRole = document.getElementById('profile-role');
  if (profileRole) profileRole.textContent = role;
  document.getElementById('logout-btn').onclick = () => supabaseClient.auth.signOut();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) loginError.textContent = 'E-mail ou senha inválidos.';
});

// ================== Acesso a dados ==================
async function fetchSites() {
  const { data, error } = await supabaseClient.from('sites').select('*').order('created_at');
  if (error) throw error;
  return data || [];
}
async function fetchWorkers() {
  const { data, error } = await supabaseClient.from('workers').select('*, sites(name)').order('created_at');
  if (error) throw error;
  return data || [];
}
async function fetchInspections() {
  const { data, error } = await supabaseClient.from('inspections').select('*, sites(name)').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
async function fetchNCs() {
  const { data, error } = await supabaseClient.from('non_conformities').select('*, sites(name)').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ================== Render helpers ==================
function table(rows, heads) {
  if (!rows.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
  return `<table class="table"><thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((x, i) => `<td>${i >= 3 ? `<span class="badge ${String(x).includes('CRITICAL') || String(x).includes('OPEN') ? 'red' : String(x).includes('HIGH') || String(x).includes('IN_PROGRESS') ? 'amber' : String(x).includes('COMPLETED') || String(x).includes('Ativa') || String(x).includes('RESOLVED') ? 'green' : ''}">${x}</span>` : x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function loading() { content.innerHTML = `<div class="empty">Carregando...</div>`; }
function friendlyError(error) {
  if (!error) return '';
  if (String(error.message).toLowerCase().includes('row-level security')) {
    return 'Você não tem permissão para esta ação (restrito a admin/TST).';
  }
  return error.message;
}

function exportCSV(headers, rows, filename) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportPDF() { window.print(); }

// ================== Páginas ==================
async function dashboard() {
  title.textContent = 'Dashboard';
  loading();
  let sites, workers, inspections, ncs;
  try { [sites, workers, inspections, ncs] = await Promise.all([fetchSites(), fetchWorkers(), fetchInspections(), fetchNCs()]); }
  catch (error) { content.innerHTML = '<div class="empty" role="alert"><strong>Não foi possível carregar os dados.</strong><p>Confira a conexão e tente novamente.</p><button class="btn secondary" onclick="dashboard()">Tentar novamente</button></div>'; return; }
  const activeSites = sites.filter(s => s.status === 'Ativa').length;
  const activeWorkers = workers.filter(w => w.status === 'Ativo').length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const inspectionsThisMonth = inspections.filter(i => (i.inspection_date || '').startsWith(thisMonth)).length;
  const openNCs = ncs.filter(n => n.status !== 'RESOLVED');
  const critical = openNCs.filter(n => n.priority === 'CRITICAL').length;
  const overdue = openNCs.filter(n => n.due_date && n.due_date < today).length;
  const rows = openNCs.slice(0, 5).map(n => [n.code, n.sites?.name || '-', n.description, n.priority, n.status]);

  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pending = overdue + critical;
  content.innerHTML = `<div class="hero"><div><div class="hero-eyebrow">VISÃO GERAL · SEGURANÇA EM CAMPO</div><h2>${openNCs.length ? 'Sua operação em foco' : 'Tudo começa com uma inspeção'}</h2><p>${openNCs.length ? `${openNCs.length} ocorrência(s) em aberto. Acompanhe as prioridades e mantenha sua equipe segura.` : 'Registre inspeções e acompanhe a segurança da equipe em um só lugar.'}</p><button class="hero-action" onclick="newInspection()">＋ Nova inspeção</button></div><div class="hero-icon" aria-hidden="true">✦</div></div>
  <div class="section-heading"><div><span class="section-kicker">PANORAMA</span><h2>O que precisa de atenção</h2></div></div>
  <div class="metric-grid"><button class="metric-tile critical-tile" onclick="ncsPage()"><span class="metric-symbol">!</span><span class="metric-label">NCs abertas</span><strong>${openNCs.length}</strong><small>Ver ocorrências →</small></button>
  <button class="metric-tile" onclick="ncsPage()"><span class="metric-symbol amber-icon">◷</span><span class="metric-label">Em atraso</span><strong>${overdue}</strong><small>Consultar prazos →</small></button>
  <button class="metric-tile" onclick="inspectionsPage()"><span class="metric-symbol blue-icon">✓</span><span class="metric-label">Inspeções no mês</span><strong>${inspectionsThisMonth}</strong><small>Ver inspeções →</small></button>
  <button class="metric-tile" onclick="sitesPage()"><span class="metric-symbol green-icon">⌂</span><span class="metric-label">Obras ativas</span><strong>${activeSites}</strong><small>Ver obras →</small></button></div>
  <div class="dashboard-panels"><section class="dashboard-panel"><div class="panel-heading"><div><span class="section-kicker">ACOMPANHAMENTO</span><h2>Últimas ocorrências</h2></div><button class="text-link" onclick="ncsPage()">Ver todas →</button></div>${openNCs.length ? `<div class="occurrence-list">${openNCs.slice(0,4).map(n => `<div class="occurrence"><span class="occurrence-dot ${n.priority === 'CRITICAL' || n.priority === 'HIGH' ? 'hot' : ''}"></span><div><strong>${safe(n.description)}</strong><small>${safe(n.sites?.name || 'Obra não informada')} · ${safe(n.code)}</small></div><span class="badge ${n.priority === 'CRITICAL' ? 'red' : n.priority === 'HIGH' ? 'amber' : ''}">${safe(({CRITICAL:'Crítica',HIGH:'Alta',MEDIUM:'Média',LOW:'Baixa'})[n.priority] || n.priority)}</span></div>`).join('')}</div>` : `<div class="empty dashboard-empty"><span aria-hidden="true">✓</span><strong>Nenhuma ocorrência em aberto</strong><p>Quando houver não conformidades, elas aparecem aqui.</p></div>`}</section>
  <section class="dashboard-panel"><div class="panel-heading"><div><span class="section-kicker">EVOLUÇÃO</span><h2>Ocorrências por mês</h2></div></div>${ncs.length ? '<div class="chart-wrap"><canvas id="ncs-chart" height="170"></canvas></div>' : '<div class="empty dashboard-empty"><span aria-hidden="true">▥</span><strong>Seu histórico começa aqui</strong><p>O gráfico aparece assim que houver ocorrências registradas.</p></div>'}</section></div>
  <div class="team-strip"><span class="metric-symbol green-icon">♙</span><div><strong>${activeWorkers} trabalhador(es) ativos</strong><small>Acompanhe a equipe e suas obras</small></div><button class="text-link" onclick="workersPage()">Ver equipe →</button></div>`;

  renderNCsChart(ncs);
}

let ncsChartInstance = null;
function renderNCsChart(ncs) {
  const canvas = document.getElementById('ncs-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  const monthLabel = (m) => {
    const [y, mo] = m.split('-');
    return `${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][parseInt(mo, 10) - 1]}/${y.slice(2)}`;
  };
  const createdByMonth = months.map(m => ncs.filter(n => (n.created_at || '').startsWith(m)).length);
  const resolvedByMonth = months.map(m => ncs.filter(n => n.status === 'RESOLVED' && (n.resolved_at || '').startsWith(m)).length);

  if (ncsChartInstance) ncsChartInstance.destroy();
  ncsChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months.map(monthLabel),
      datasets: [
        { label: 'Abertas', data: createdByMonth, backgroundColor: '#b42318' },
        { label: 'Resolvidas', data: resolvedByMonth, backgroundColor: '#137333' },
      ],
    },
    options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
  });
}

async function sitesPage() {
  title.textContent = 'Obras';
  loading();
  let sites;
  try { sites = await fetchSites(); } catch (error) { content.innerHTML = '<div class="empty" role="alert"><strong>Não foi possível carregar os dados.</strong><p>Confira a conexão e tente novamente.</p></div>'; return; }
  content.innerHTML = `<div class="actions"><button class="btn" onclick="newSite()">+ Novo registro</button></div>${sitesTable(sites)}`;
}

function sitesTable(sites) {
  if (!sites.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
  return `<table class="table"><thead><tr><th>Obra</th><th>Código</th><th>Status</th><th>Responsável</th><th></th></tr></thead><tbody>
    ${sites.map(s => `<tr><td>${s.name}</td><td>${s.code}</td><td><span class="badge ${s.status === 'Ativa' ? 'green' : ''}">${s.status}</span></td><td>${s.responsible_team || '-'}</td>
      <td><button class="btn secondary" onclick="editSite('${s.id}')">Editar</button></td></tr>`).join('')}
  </tbody></table>`;
}

function newSite() {
  title.textContent = 'Nova obra';
  content.innerHTML = `<div class="form">
    <label>Nome<input id="site-name" placeholder="Ex.: Obra Norte"></label>
    <label>Código<input id="site-code" placeholder="Ex.: OB-004"></label>
    <label>Status<select id="site-status"><option value="Ativa">Ativa</option><option value="Inativa">Inativa</option></select></label>
    <label>Equipe responsável<input id="site-team" placeholder="Ex.: Equipe A"></label>
    <div class="full"><button class="btn" onclick="saveSite()">Salvar</button> <button class="btn secondary" onclick="sitesPage()">Cancelar</button></div>
  </div>`;
}

async function saveSite() {
  const name = document.getElementById('site-name').value.trim();
  const code = document.getElementById('site-code').value.trim();
  const status = document.getElementById('site-status').value;
  const responsible_team = document.getElementById('site-team').value.trim();
  if (!name || !code) { alert('Preencha nome e código.'); return; }

  const { error } = await supabaseClient.from('sites').insert({ name, code, status, responsible_team });
  if (error) { alert('Erro ao salvar obra: ' + friendlyError(error)); return; }
  sitesPage();
}

async function editSite(id) {
  loading();
  const { data: s, error } = await supabaseClient.from('sites').select('*').eq('id', id).single();
  if (error) { alert('Erro ao carregar obra: ' + friendlyError(error)); sitesPage(); return; }
  title.textContent = 'Editar obra';
  content.innerHTML = `<div class="form">
    <label>Nome<input id="site-name" value="${s.name}"></label>
    <label>Código<input id="site-code" value="${s.code}"></label>
    <label>Status<select id="site-status">
      <option value="Ativa" ${s.status === 'Ativa' ? 'selected' : ''}>Ativa</option>
      <option value="Inativa" ${s.status === 'Inativa' ? 'selected' : ''}>Inativa</option>
    </select></label>
    <label>Equipe responsável<input id="site-team" value="${s.responsible_team || ''}"></label>
    <div class="full"><button class="btn" onclick="updateSite('${id}')">Salvar alterações</button> <button class="btn secondary" onclick="sitesPage()">Cancelar</button></div>
  </div>`;
}

async function updateSite(id) {
  const name = document.getElementById('site-name').value.trim();
  const code = document.getElementById('site-code').value.trim();
  const status = document.getElementById('site-status').value;
  const responsible_team = document.getElementById('site-team').value.trim();
  if (!name || !code) { alert('Preencha nome e código.'); return; }

  const { error } = await supabaseClient.from('sites').update({ name, code, status, responsible_team }).eq('id', id);
  if (error) { alert('Erro ao atualizar obra: ' + friendlyError(error)); return; }
  sitesPage();
}

async function workersPage() {
  title.textContent = 'Trabalhadores';
  loading();
  let workers;
  try { workers = await fetchWorkers(); } catch (error) { content.innerHTML = '<div class="empty" role="alert"><strong>Não foi possível carregar os dados.</strong><p>Confira a conexão e tente novamente.</p></div>'; return; }
  content.innerHTML = `<div class="actions"><button class="btn" onclick="newWorker()">+ Novo registro</button></div>${workersTable(workers)}`;
}

function workersTable(workers) {
  if (!workers.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
  return `<table class="table"><thead><tr><th>Nome</th><th>Função</th><th>Obra</th><th>Status</th><th></th></tr></thead><tbody>
    ${workers.map(w => `<tr><td>${w.full_name}</td><td>${w.role}</td><td>${w.sites?.name || '-'}</td><td><span class="badge ${w.status === 'Ativo' ? 'green' : ''}">${w.status}</span></td>
      <td><button class="btn secondary" onclick="editWorker('${w.id}')">Editar</button></td></tr>`).join('')}
  </tbody></table>`;
}

async function newWorker() {
  title.textContent = 'Novo trabalhador';
  loading();
  let sites;
  try { sites = await fetchSites(); } catch (error) { content.innerHTML = '<div class="empty" role="alert"><strong>Não foi possível carregar os dados.</strong><p>Confira a conexão e tente novamente.</p></div>'; return; }
  content.innerHTML = `<div class="form">
    <label>Nome<input id="worker-name" placeholder="Nome completo"></label>
    <label>Função<input id="worker-role" placeholder="Ex.: Pedreiro"></label>
    <label>Obra<select id="worker-site">${sites.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></label>
    <label>Status<select id="worker-status"><option value="Ativo">Ativo</option><option value="Inativo">Inativo</option></select></label>
    <div class="full"><button class="btn" onclick="saveWorker()">Salvar</button> <button class="btn secondary" onclick="workersPage()">Cancelar</button></div>
  </div>`;
}

async function saveWorker() {
  const full_name = document.getElementById('worker-name').value.trim();
  const role = document.getElementById('worker-role').value.trim();
  const site_id = document.getElementById('worker-site').value;
  const status = document.getElementById('worker-status').value;
  if (!full_name || !role) { alert('Preencha nome e função.'); return; }

  const { error } = await supabaseClient.from('workers').insert({ full_name, role, site_id, status });
  if (error) { alert('Erro ao salvar trabalhador: ' + friendlyError(error)); return; }
  workersPage();
}

async function editWorker(id) {
  loading();
  const [{ data: w, error }, sites] = await Promise.all([
    supabaseClient.from('workers').select('*').eq('id', id).single(),
    fetchSites(),
  ]);
  if (error) { alert('Erro ao carregar trabalhador: ' + friendlyError(error)); workersPage(); return; }
  title.textContent = 'Editar trabalhador';
  content.innerHTML = `<div class="form">
    <label>Nome<input id="worker-name" value="${w.full_name}"></label>
    <label>Função<input id="worker-role" value="${w.role}"></label>
    <label>Obra<select id="worker-site">${sites.map(s => `<option value="${s.id}" ${s.id === w.site_id ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>
    <label>Status<select id="worker-status">
      <option value="Ativo" ${w.status === 'Ativo' ? 'selected' : ''}>Ativo</option>
      <option value="Inativo" ${w.status === 'Inativo' ? 'selected' : ''}>Inativo</option>
    </select></label>
    <div class="full"><button class="btn" onclick="updateWorker('${id}')">Salvar alterações</button> <button class="btn secondary" onclick="workersPage()">Cancelar</button></div>
  </div>`;
}

async function updateWorker(id) {
  const full_name = document.getElementById('worker-name').value.trim();
  const role = document.getElementById('worker-role').value.trim();
  const site_id = document.getElementById('worker-site').value;
  const status = document.getElementById('worker-status').value;
  if (!full_name || !role) { alert('Preencha nome e função.'); return; }

  const { error } = await supabaseClient.from('workers').update({ full_name, role, site_id, status }).eq('id', id);
  if (error) { alert('Erro ao atualizar trabalhador: ' + friendlyError(error)); return; }
  workersPage();
}

async function ncsPage() {
  title.textContent = 'Não conformidades';
  loading();
  let ncs;
  try { ncs = await fetchNCs(); } catch (error) { content.innerHTML = '<div class="empty" role="alert"><strong>Não foi possível carregar os dados.</strong><p>Confira a conexão e tente novamente.</p></div>'; return; }
  window._ncsData = ncs;
  content.innerHTML = `<div class="actions"><button class="btn secondary" onclick="exportNCsCSV()">Exportar CSV</button><button class="btn secondary" onclick="exportPDF()">Exportar PDF</button></div>${ncsTable(ncs)}`;
}

function exportNCsCSV() {
  const rows = (window._ncsData || []).map(n => [n.code, n.sites?.name || '-', n.description, n.priority, n.status, n.due_date || '']);
  exportCSV(['Código', 'Obra', 'Descrição', 'Prioridade', 'Status', 'Prazo'], rows, 'nao-conformidades.csv');
}

const NC_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_VALIDATION', 'RESOLVED'];

function ncsTable(ncs) {
  if (!ncs.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
  const today = new Date().toISOString().slice(0, 10);
  return `<table class="table"><thead><tr><th>Código</th><th>Obra</th><th>Descrição</th><th>Prioridade</th><th>Foto</th><th>Prazo</th><th>Status</th></tr></thead><tbody>
    ${ncs.map(n => {
      const overdue = n.due_date && n.due_date < today && n.status !== 'RESOLVED';
      return `<tr><td>${n.code}</td><td>${n.sites?.name || '-'}</td><td>${n.description}</td>
      <td><span class="badge ${n.priority === 'CRITICAL' ? 'red' : n.priority === 'HIGH' ? 'amber' : ''}">${n.priority}</span></td>
      <td>${n.photo_url ? `<a href="${n.photo_url}" target="_blank"><img src="${n.photo_url}" style="width:40px;height:40px;object-fit:cover;border-radius:6px"></a>` : '-'}</td>
      <td><input type="date" value="${n.due_date || ''}" onchange="updateNCDueDate('${n.id}', this.value)">${overdue ? ' <span class="badge red">ATRASADA</span>' : ''}</td>
      <td><select onchange="updateNCStatus('${n.id}', this.value)">
        ${NC_STATUSES.map(s => `<option value="${s}" ${s === n.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select></td></tr>`;
    }).join('')}
  </tbody></table>`;
}

async function updateNCDueDate(id, due_date) {
  const { error } = await supabaseClient.from('non_conformities').update({ due_date: due_date || null }).eq('id', id);
  if (error) { alert('Erro ao atualizar prazo: ' + friendlyError(error)); }
  ncsPage();
}

async function updateNCStatus(id, status) {
  const payload = { status, resolved_at: status === 'RESOLVED' ? new Date().toISOString() : null };
  const { error } = await supabaseClient.from('non_conformities').update(payload).eq('id', id);
  if (error) { alert('Erro ao atualizar NC: ' + friendlyError(error)); ncsPage(); return; }
  ncsPage();
}

async function inspectionsPage() {
  title.textContent = 'Inspeções';
  loading();
  let inspections;
  try { inspections = await fetchInspections(); } catch (error) { content.innerHTML = '<div class="empty" role="alert"><strong>Não foi possível carregar os dados.</strong><p>Confira a conexão e tente novamente.</p></div>'; return; }
  window._inspectionsData = inspections;
  const rows = inspections.map(i => [i.code, i.sites?.name || '-', i.checklist_type, i.inspection_date, i.status]);
  content.innerHTML = `<div class="actions"><button class="btn" onclick="newInspection()">+ Nova inspeção</button><button class="btn secondary" onclick="exportInspectionsCSV()">Exportar CSV</button><button class="btn secondary" onclick="exportPDF()">Exportar PDF</button></div>${table(rows, ['Código', 'Obra', 'Tipo', 'Data', 'Status'])}`;
}

function exportInspectionsCSV() {
  const rows = (window._inspectionsData || []).map(i => [i.code, i.sites?.name || '-', i.checklist_type, i.inspection_date, i.status]);
  exportCSV(['Código', 'Obra', 'Tipo', 'Data', 'Status'], rows, 'inspecoes.csv');
}

async function newInspection() {
  title.textContent = 'Nova inspeção';
  loading();
  let sites;
  try { sites = await fetchSites(); } catch (error) { content.innerHTML = '<div class="empty" role="alert"><strong>Não foi possível carregar os dados.</strong><p>Confira a conexão e tente novamente.</p></div>'; return; }
  content.innerHTML = `<div class="form">
    <label>Obra<select id="insp-site">${sites.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></label>
    <label>Checklist<select id="insp-checklist">${Object.keys(CHECKLISTS).map(name => `<option value="${name}">${name}</option>`).join('')}</select></label>
    <label class="full">Local<input id="insp-location" placeholder="Ex.: Setor de alvenaria"></label>
    <label class="full">Observação<textarea id="insp-notes" placeholder="Descrição da inspeção"></textarea></label>
    <div class="full"><button class="btn" onclick="startChecklist()">Iniciar checklist</button></div>
  </div>`;
}

async function startChecklist() {
  const site_id = document.getElementById('insp-site').value;
  const checklist_type = document.getElementById('insp-checklist').value;
  const location = document.getElementById('insp-location').value;
  const notes = document.getElementById('insp-notes').value;
  if (!site_id) return;

  const { data, error } = await supabaseClient.from('inspections').insert({
    site_id, checklist_type, location, notes, inspector_id: currentUser.id
  }).select('id, code').single();
  if (error) { alert('Erro ao criar inspeção: ' + error.message); return; }

  activeInspection = { id: data.id, code: data.code, items: CHECKLISTS[checklist_type] || [] };
  finishingInspection = false;
  title.textContent = `Checklist — ${checklist_type}`;
  content.innerHTML = `<div class="inspection-head"><span class="section-kicker">INSPEÇÃO ${data.code} · EM ANDAMENTO</span><h2>Vamos conferir a segurança?</h2><p>Escolha uma resposta para cada item. Você poderá revisar antes de concluir.</p><div class="progress-row"><span id="inspection-progress">0 de ${activeInspection.items.length} respondidos</span><span id="inspection-percent">0%</span></div><div class="progress-track"><div id="inspection-progress-bar"></div></div></div>
  <div class="inspection-list">${activeInspection.items.map((x, i) => `<fieldset class="inspection-item"><legend><span class="item-number">${i+1}</span> ${x}</legend><div class="answer-options">
    <label><input type="radio" name="i${i}" value="conforme" onchange="updateInspectionProgress()"><span>✓ Conforme</span></label>
    <label><input type="radio" name="i${i}" value="nao_conforme" onchange="updateInspectionProgress()"><span>! Não conforme</span></label>
    <label><input type="radio" name="i${i}" value="na" onchange="updateInspectionProgress()"><span>— Não se aplica</span></label></div>
    <p class="photo-note">📷 Anexos de foto ainda não estão disponíveis nesta versão.</p></fieldset>`).join('')}</div><div class="inspection-footer"><p id="inspection-feedback" role="status">Responda todos os itens para revisar.</p><button class="btn" onclick="reviewInspection()">Revisar inspeção →</button></div>`;
}

function updateInspectionProgress() {
  if (!activeInspection) return;
  const answered = activeInspection.items.filter((_, i) => document.querySelector(`input[name="i${i}"]:checked`)).length;
  const pct = Math.round(answered * 100 / activeInspection.items.length);
  document.getElementById('inspection-progress').textContent = `${answered} de ${activeInspection.items.length} respondidos`;
  document.getElementById('inspection-percent').textContent = `${pct}%`;
  document.getElementById('inspection-progress-bar').style.width = `${pct}%`;
  document.getElementById('inspection-feedback').textContent = answered === activeInspection.items.length ? 'Tudo respondido. Revise antes de concluir.' : 'Responda todos os itens para revisar.';
}
function reviewInspection() {
  const missing = activeInspection.items.findIndex((_, i) => !document.querySelector(`input[name="i${i}"]:checked`));
  if (missing !== -1) { document.getElementById('inspection-feedback').textContent = `Falta responder o item ${missing + 1}.`; document.querySelector(`input[name="i${missing}"]`).focus(); return; }
  const counts = {conforme:0, nao_conforme:0, na:0};
  activeInspection.items.forEach((_,i) => counts[document.querySelector(`input[name="i${i}"]:checked`).value]++);
  if (window.confirm(`Revisão: ${counts.conforme} conforme(s), ${counts.nao_conforme} não conforme(s), ${counts.na} não se aplica. Finalizar a inspeção?`)) finishInspection();
}
window.updateInspectionProgress = updateInspectionProgress;
window.reviewInspection = reviewInspection;

async function uploadPhoto(file, inspectionId, index) {
  if (!file) return null;
  const path = `${inspectionId}/${index}-${Date.now()}-${file.name}`;
  const { error } = await supabaseClient.storage.from('inspection-photos').upload(path, file);
  if (error) throw new Error(`Não foi possível enviar a foto do item ${index + 1}: ${error.message}`);
  const { data } = supabaseClient.storage.from('inspection-photos').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error(`Não foi possível obter o endereço da foto do item ${index + 1}.`);
  return data.publicUrl;
}

async function finishInspection() {
  if (!activeInspection || finishingInspection) return;
  const selectedPhotos = [...content.querySelectorAll('input[type="file"]')].some(input => input.files?.length);
  if (selectedPhotos) {
    const feedback = document.getElementById('inspection-feedback');
    if (feedback) feedback.textContent = 'O esquema atual não armazena o vínculo das fotos aos itens. Remova as fotos selecionadas antes de concluir; nenhuma alteração foi gravada.';
    return;
  }
  const missing = activeInspection.items.findIndex((_, i) => !document.querySelector(`input[name="i${i}"]:checked`));
  if (missing !== -1) {
    const feedback = document.getElementById('inspection-feedback');
    if (feedback) feedback.textContent = `Falta responder o item ${missing + 1}.`;
    document.querySelector(`input[name="i${missing}"]`)?.focus();
    return;
  }

  finishingInspection = true;
  const buttons = [...content.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  content.querySelectorAll('input').forEach(input => { input.disabled = true; });
  const feedback = document.getElementById('inspection-feedback');
  if (feedback) feedback.textContent = 'Salvando inspeção… Não feche esta tela.';
  let itemsWritten = false;
  try {
    // Check the server state before writing, so a repeated submission cannot duplicate checklist rows.
    const { data: existing, error: statusError } = await supabaseClient.from('inspections')
      .select('status').eq('id', activeInspection.id).single();
    if (statusError) throw new Error(`Não foi possível verificar o estado da inspeção: ${statusError.message}`);
    if (!existing || existing.status === 'COMPLETED') {
      if (existing?.status === 'COMPLETED') {
        content.innerHTML = `<div class="card"><h2>Inspeção ${activeInspection.code} já concluída</h2><p>O servidor confirmou que esta inspeção já foi concluída. Nenhum item foi gravado novamente.</p><button class="btn" onclick="inspectionsPage()">Voltar às inspeções</button></div>`;
        activeInspection = null;
        return;
      }
      throw new Error('A inspeção não foi encontrada. Nenhum item foi salvo.');
    }

    const { data: previousItems, error: previousItemsError } = await supabaseClient.from('inspection_items')
      .select('id').eq('inspection_id', activeInspection.id);
    if (previousItemsError) throw new Error(`Não foi possível verificar itens já salvos: ${previousItemsError.message}`);
    if (previousItems?.length) throw new Error('Já existem itens vinculados a esta inspeção. Para evitar duplicidade, ela não será reenviada; confira o registro na lista.');

    const items = activeInspection.items.map((description, i) => ({
      inspection_id: activeInspection.id,
      description,
      result: document.querySelector(`input[name="i${i}"]:checked`).value,
    }));

    const { error: itemsError } = await supabaseClient.from('inspection_items').insert(items);
    if (itemsError) throw new Error(`Erro ao salvar os itens: ${itemsError.message}`);
    itemsWritten = true;

    const { data: completed, error: updateError } = await supabaseClient.from('inspections')
      .update({ status: 'COMPLETED' }).eq('id', activeInspection.id).select('id,status').single();
    if (updateError || completed?.status !== 'COMPLETED') {
      throw new Error(`Os itens foram salvos, mas o servidor não confirmou a conclusão${updateError ? `: ${updateError.message}` : '.'}`);
    }

    const { data: ncsGenerated, error: ncsError } = await supabaseClient.from('non_conformities')
      .select('code').eq('inspection_id', activeInspection.id);
    const count = ncsGenerated ? ncsGenerated.length : 0;
    const photos = items.filter(i => i.photo_url);
    title.textContent = 'Inspeção concluída';
    content.innerHTML = `<div class="card"><h2>Inspeção ${activeInspection.code} registrada</h2>
      <p>${count > 0 ? `${count} não conformidade(s) foram geradas automaticamente a partir dos itens marcados como "Não conforme".` : 'Inspeção concluída.'}${ncsError ? ' Não foi possível carregar a contagem de não conformidades; confira a lista de NCs.' : ''}</p>
      ${photos.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">${photos.map(p => `<img src="${p.photo_url}" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1px solid #e2e7eb">`).join('')}</div>` : ''}
      <button class="btn" onclick="dashboard()">Voltar ao dashboard</button></div>`;
    activeInspection = null;
  } catch (error) {
    console.error('Falha ao concluir inspeção:', error);
    const message = itemsWritten
      ? 'Os itens já foram enviados, mas a confirmação final falhou. Para evitar duplicidade, não tente concluir novamente; atualize a lista de inspeções e confira o status antes de qualquer nova ação.'
      : `A inspeção não foi concluída: ${error.message}`;
    content.innerHTML = `<div class="empty" role="alert"><strong>Não foi possível concluir a inspeção.</strong><p>${message}</p><button class="btn secondary" onclick="inspectionsPage()">Voltar à lista sem reenviar</button></div>`;
    // After any successful item insert, retain the lock: a retry could duplicate items/NCs.
    if (!itemsWritten) {
      finishingInspection = false;
      buttons.forEach(button => { button.disabled = false; });
      content.querySelectorAll('input').forEach(input => { input.disabled = false; });
    }
  }
}

// ================== Navegação ==================
window.newInspection = newInspection;
window.startChecklist = startChecklist;
window.inspectionsPage = inspectionsPage;
window.ncsPage = ncsPage;
window.finishInspection = finishInspection;
window.dashboard = dashboard;
window.sitesPage = sitesPage;
window.workersPage = workersPage;
window.newSite = newSite;
window.saveSite = saveSite;
window.editSite = editSite;
window.updateSite = updateSite;
window.newWorker = newWorker;
window.saveWorker = saveWorker;
window.editWorker = editWorker;
window.updateWorker = updateWorker;
window.updateNCStatus = updateNCStatus;
window.updateNCDueDate = updateNCDueDate;
window.exportNCsCSV = exportNCsCSV;
window.exportInspectionsCSV = exportInspectionsCSV;
window.exportPDF = exportPDF;

document.querySelectorAll('.nav').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  const pages = { dashboard, inspections: inspectionsPage, ncs: ncsPage, sites: sitesPage, workers: workersPage };
  pages[b.dataset.page]();
});

boot();
