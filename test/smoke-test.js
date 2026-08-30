// Smoke test: simula o DOM + um Supabase falso (sem rede) e navega
// por todas as telas, incluindo o fluxo completo de inspeção.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

const errors = [];
const tick = () => new Promise((r) => setTimeout(r, 20));
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await tick(); };

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost:3000/' });
const { window } = dom;
window.onerror = (msg) => errors.push('window.onerror: ' + msg);
window.alert = (msg) => errors.push('alert() chamado inesperadamente: ' + msg);

// ---- Supabase falso: dados fixos, sem chamadas de rede ----
const fakeData = {
  sites: [{ id: 's1', name: 'Obra Teste', code: 'OB-001', status: 'Ativa', responsible_team: 'Equipe A' }],
  workers: [{ id: 'w1', full_name: 'Fulano', role: 'Pedreiro', status: 'Ativo', sites: { name: 'Obra Teste' } }],
  inspections: [{ id: 'i1', code: 'INS-00001', checklist_type: 'NR-18', inspection_date: '2026-08-01', status: 'COMPLETED', sites: { name: 'Obra Teste' } }],
  non_conformities: [{ id: 'nc1', code: 'NC-2026-000001', description: 'Teste', priority: 'MEDIUM', status: 'OPEN', sites: { name: 'Obra Teste' } }],
  profiles: [{ id: 'u1', full_name: 'Usuário Teste', role: 'tecnico' }],
};

function makeBuilder(tableName) {
  let mode = 'select';
  const b = {
    select() { return b; },
    eq() { return b; },
    order() { return b; },
    insert() { mode = 'insert'; return b; },
    update() { mode = 'update'; return b; },
    single() {
      if (mode === 'insert') return Promise.resolve({ data: { id: 'new-id', code: 'INS-99999' }, error: null });
      const arr = fakeData[tableName] || [];
      return Promise.resolve({ data: arr[0] || null, error: null });
    },
    then(resolve, reject) {
      const data = mode === 'insert' ? [] : (fakeData[tableName] || []);
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return b;
}

window.supabase = {
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'teste@empresa.com' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: (tableName) => makeBuilder(tableName),
  }),
};
window.SUPABASE_URL = 'http://fake.local';
window.SUPABASE_ANON_KEY = 'fake-key';

try {
  dom.window.eval(appjs);
} catch (e) {
  errors.push('Erro ao carregar app.js: ' + e.message);
}

async function clickPage(page) {
  const btn = window.document.querySelector(`.nav[data-page="${page}"]`);
  if (!btn) { errors.push(`Botão de nav não encontrado: ${page}`); return; }
  try { btn.onclick(); await flush(); } catch (e) { errors.push(`Erro ao clicar em "${page}": ${e.message}`); }
}

(async () => {
  await flush(); // aguarda boot() (getSession -> showApp -> dashboard)

  for (const page of ['dashboard', 'inspections', 'ncs', 'sites', 'workers']) {
    await clickPage(page);
  }

  // Fluxo completo: nova inspeção -> checklist -> finalizar
  let inspectionConfirmationHtml = '';
  try {
    await clickPage('inspections');
    window.newInspection();
    await flush();
    await window.startChecklist();
    await flush();
    await window.finishInspection();
    await flush();
    inspectionConfirmationHtml = window.document.getElementById('content').innerHTML;
  } catch (e) {
    errors.push('Erro no fluxo de inspeção: ' + e.message);
  }

  // Fluxo: cadastro de obra
  try {
    await clickPage('sites');
    window.newSite();
    await flush();
    window.document.getElementById('site-name').value = 'Obra de Teste';
    window.document.getElementById('site-code').value = 'OB-999';
    await window.saveSite();
    await flush();
  } catch (e) {
    errors.push('Erro no fluxo de cadastro de obra: ' + e.message);
  }

  // Fluxo: cadastro de trabalhador
  try {
    await clickPage('workers');
    await window.newWorker();
    await flush();
    window.document.getElementById('worker-name').value = 'Trabalhador Teste';
    window.document.getElementById('worker-role').value = 'Eletricista';
    await window.saveWorker();
    await flush();
  } catch (e) {
    errors.push('Erro no fluxo de cadastro de trabalhador: ' + e.message);
  }

  const content = window.document.getElementById('content').innerHTML;
  if (!content || content.trim().length === 0) errors.push('Conteúdo final da página está vazio');
  if (!inspectionConfirmationHtml.includes('Inspeção') || !inspectionConfirmationHtml.includes('registrada')) {
    errors.push('Fluxo de inspeção não chegou à tela de confirmação esperada');
  }

  if (errors.length) {
    console.log('FALHAS ENCONTRADAS:');
    errors.forEach((e) => console.log(' - ' + e));
    process.exit(1);
  } else {
    console.log('Todos os fluxos testados sem erros (login, dashboard, navegação e inspeção completa).');
  }
})();
