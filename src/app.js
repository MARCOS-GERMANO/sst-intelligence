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
  loginScreen.style.display = 'none';
  appShell.style.display = 'flex';
  await loadUserInfo();
  dashboard();
}

async function loadUserInfo() {
  const { data } = await supabaseClient.from('profiles').select('full_name, role').eq('id', currentUser.id).single();
  const name = data?.full_name || currentUser.email;
  const role = data?.role ? data.role.toUpperCase() : '';
  userInfo.innerHTML = `${name} <span>${role}</span> <button id="logout-btn">Sair</button>`;
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
  if (error) console.error(error);
  return data || [];
}
async function fetchWorkers() {
  const { data, error } = await supabaseClient.from('workers').select('*, sites(name)').order('created_at');
  if (error) console.error(error);
  return data || [];
}
async function fetchInspections() {
  const { data, error } = await supabaseClient.from('inspections').select('*, sites(name)').order('created_at', { ascending: false });
  if (error) console.error(error);
  return data || [];
}
async function fetchNCs() {
  const { data, error } = await supabaseClient.from('non_conformities').select('*, sites(name)').order('created_at', { ascending: false });
  if (error) console.error(error);
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
  const [sites, workers, inspections, ncs] = await Promise.all([fetchSites(), fetchWorkers(), fetchInspections(), fetchNCs()]);
  const activeSites = sites.filter(s => s.status === 'Ativa').length;
  const activeWorkers = workers.filter(w => w.status === 'Ativo').length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const inspectionsThisMonth = inspections.filter(i => (i.inspection_date || '').startsWith(thisMonth)).length;
  const openNCs = ncs.filter(n => n.status !== 'RESOLVED');
  const critical = openNCs.filter(n => n.priority === 'CRITICAL').length;
  const overdue = openNCs.filter(n => n.due_date && n.due_date < today).length;
  const rows = openNCs.slice(0, 5).map(n => [n.code, n.sites?.name || '-', n.description, n.priority, n.status]);

  content.innerHTML = `<div class="grid">
    <div class="card"><div class="label">OBRAS ATIVAS</div><div class="metric">${activeSites}</div></div>
    <div class="card"><div class="label">TRABALHADORES ATIVOS</div><div class="metric">${activeWorkers}</div></div>
    <div class="card"><div class="label">INSPEÇÕES NO MÊS</div><div class="metric">${inspectionsThisMonth}</div></div>
    <div class="card"><div class="label">NCs ABERTAS</div><div class="metric danger">${openNCs.length}</div></div>
  </div>
  <div class="section"><h2>Indicadores de controle</h2><div class="grid">
    <div class="card"><div class="label">CRÍTICAS</div><div class="metric danger">${critical}</div></div>
    <div class="card"><div class="label">ATRASADAS</div><div class="metric danger">${overdue}</div></div>
    <div class="card"><div class="label">RESOLVIDAS</div><div class="metric success">${ncs.length - openNCs.length}</div></div>
    <div class="card"><div class="label">OBRAS</div><div class="metric">${sites.length}</div></div>
  </div></div>
  <div class="section"><h2>NCs por mês</h2><div class="card"><canvas id="ncs-chart" height="90"></canvas></div></div>
  <div class="section"><h2>Últimas não conformidades</h2>${table(rows, ['Código', 'Obra', 'Descrição', 'Prioridade', 'Status'])}</div>`;

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
  const sites = await fetchSites();
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
  const workers = await fetchWorkers();
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
  const sites = await fetchSites();
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
  const ncs = await fetchNCs();
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
  const inspections = await fetchInspections();
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
  const sites = await fetchSites();
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
  title.textContent = `Checklist — ${checklist_type}`;
  content.innerHTML = `<div class="card"><div class="label">INSPEÇÃO ${data.code} · EM ANDAMENTO</div>${activeInspection.items.map((x, i) => `<div style="padding:18px 0;border-bottom:1px solid #edf0f2"><b>${i + 1}. ${x}</b><div style="margin-top:10px">
    <label><input type="radio" name="i${i}" value="conforme" checked> Conforme</label> &nbsp;
    <label><input type="radio" name="i${i}" value="nao_conforme"> <span class="danger">Não conforme</span></label> &nbsp;
    <label><input type="radio" name="i${i}" value="na"> N/A</label>
    <div style="margin-top:8px"><input type="file" id="photo${i}" accept="image/*"></div>
  </div></div>`).join('')}<br><button class="btn" onclick="finishInspection()">Finalizar inspeção</button></div>`;
}

async function uploadPhoto(file, inspectionId, index) {
  if (!file) return null;
  const path = `${inspectionId}/${index}-${Date.now()}-${file.name}`;
  const { error } = await supabaseClient.storage.from('inspection-photos').upload(path, file);
  if (error) { console.error('Erro ao enviar foto:', error.message); return null; }
  const { data } = supabaseClient.storage.from('inspection-photos').getPublicUrl(path);
  return data?.publicUrl || null;
}

async function finishInspection() {
  const items = [];
  for (let i = 0; i < activeInspection.items.length; i++) {
    const description = activeInspection.items[i];
    const checked = document.querySelector(`input[name="i${i}"]:checked`);
    const fileInput = document.getElementById(`photo${i}`);
    const file = fileInput && fileInput.files[0];
    const photo_url = await uploadPhoto(file, activeInspection.id, i);
    items.push({ inspection_id: activeInspection.id, description, result: checked ? checked.value : 'na', photo_url });
  }

  const { error: itemsError } = await supabaseClient.from('inspection_items').insert(items);
  if (itemsError) { alert('Erro ao salvar itens: ' + itemsError.message); return; }

  await supabaseClient.from('inspections').update({ status: 'COMPLETED' }).eq('id', activeInspection.id);

  const { data: ncsGenerated } = await supabaseClient.from('non_conformities').select('code').eq('inspection_id', activeInspection.id);
  const count = ncsGenerated ? ncsGenerated.length : 0;
  const photos = items.filter(i => i.photo_url);

  title.textContent = 'Inspeção concluída';
  content.innerHTML = `<div class="card"><h2>Inspeção ${activeInspection.code} registrada</h2>
    <p>${count > 0 ? `${count} não conformidade(s) foram geradas automaticamente a partir dos itens marcados como "Não conforme".` : 'Nenhuma não conformidade foi identificada nesta inspeção.'}</p>
    ${photos.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">${photos.map(p => `<img src="${p.photo_url}" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1px solid #e2e7eb">`).join('')}</div>` : ''}
    <button class="btn" onclick="dashboard()">Voltar ao dashboard</button></div>`;
  activeInspection = null;
}

// ================== Navegação ==================
window.newInspection = newInspection;
window.startChecklist = startChecklist;
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
