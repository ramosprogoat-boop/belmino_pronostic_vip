const SUPABASE_URL = 'https://zmoztqqjhanugypctfom.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vf0S1GMe8-O9P7QZjuWzhQ_lysBucX9';

const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let supabase = null;

const STORAGE_KEYS = {
  USERS: 'belmino_users_v1',
  SESSION: 'belmino_session_v1',
  MATCHES: 'belmino_matches_v1',
  ANALYSES: 'belmino_analyses_v1'
};

const state = {
  currentUser: null,
  matches: [],
  analyses: [],
  users: [],
  historyFilter: 'all',
  statsQuery: '',
  deferredInstallPrompt: null
};

function escapeHTML(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sha256(text) {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatDate(isoStr) {
  if (!isoStr) return 'Horaire non défini';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return 'Horaire invalide';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function isToday(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function hasVipAccess(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'vip') return false;
  if (!user.vipExpiresAt) return true;
  return new Date(user.vipExpiresAt) > new Date();
}

function outcomeLabel(outcome) {
  const map = {
    won: { text: 'Validé', cls: 'status-won' },
    lost: { text: 'Non validé', cls: 'status-lost' },
    void: { text: 'Annulé', cls: 'status-void' },
    pending: { text: 'En attente', cls: 'status-pending' }
  };
  return map[outcome] || map.pending;
}

function mapMatchRow(row) {
  return {
    id: row.id,
    competition: row.competition,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
    venue: row.venue || '',
    homeForm: row.home_form || '',
    awayForm: row.away_form || '',
    homeGoalsFor: row.home_stats?.goalsFor || '',
    homeGoalsAgainst: row.home_stats?.goalsAgainst || '',
    awayGoalsFor: row.away_stats?.goalsFor || '',
    awayGoalsAgainst: row.away_stats?.goalsAgainst || ''
  };
}

function mapAnalysisRow(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    title: row.title,
    predictionLabel: row.prediction_label,
    confidence: row.confidence,
    analysisText: row.analysis_text,
    isVip: row.is_vip,
    isPublished: row.is_published,
    outcome: row.outcome,
    createdAt: row.created_at
  };
}

async function initBackend() {
  if (USE_SUPABASE) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}

async function refreshData() {
  if (!USE_SUPABASE) {
    state.users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    state.matches = JSON.parse(localStorage.getItem(STORAGE_KEYS.MATCHES) || '[]');
    state.analyses = JSON.parse(localStorage.getItem(STORAGE_KEYS.ANALYSES) || '[]');
    const sessionId = localStorage.getItem(STORAGE_KEYS.SESSION);
    state.currentUser = state.users.find((u) => u.id === sessionId) || null;
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const authUser = sessionData?.session?.user || null;

  if (authUser) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    state.currentUser = profile
      ? {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          role: profile.role,
          vipExpiresAt: profile.vip_expires_at
        }
      : null;
  } else {
    state.currentUser = null;
  }

  const { data: matchesRows } = await supabase
    .from('matches')
    .select('*')
    .order('kickoff_at', { ascending: true });
  state.matches = (matchesRows || []).map(mapMatchRow);

  const { data: analysesRows } = await supabase
    .from('analyses')
    .select('*')
    .order('created_at', { ascending: false });
  state.analyses = (analysesRows || []).map(mapAnalysisRow);

  if (state.currentUser?.role === 'admin') {
    const { data: profilesRows } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    state.users = (profilesRows || []).map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      role: p.role,
      vipExpiresAt: p.vip_expires_at
    }));
  } else {
    state.users = [];
  }
}

function saveLocalStore() {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
  localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(state.matches));
  localStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(state.analyses));
}

function navigateTo(sectionName) {
  document.querySelectorAll('.page-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `section-${sectionName}`);
  });
  document.querySelectorAll('.quick-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.nav === sectionName);
  });
  document.querySelectorAll('.bottom-nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === sectionName);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  renderHeaderAndAuth();
  renderHome();
  renderMatches();
  renderFreeAnalyses();
  renderVipSpace();
  renderTeamStats();
  renderHistory();
  renderAdminPanel();
}

function renderHeaderAndAuth() {
  const badge = document.getElementById('headerUserBadge');
  const authContainer = document.getElementById('authContainer');
  const profileContainer = document.getElementById('profileContainer');
  const adminDashboard = document.getElementById('adminDashboard');

  if (!state.currentUser) {
    badge.textContent = 'Connexion';
    authContainer.classList.remove('hidden');
    profileContainer.classList.add('hidden');
    adminDashboard.classList.add('hidden');
    return;
  }

  const u = state.currentUser;
  const roleLabel =
    u.role === 'admin' ? 'Administrateur' : hasVipAccess(u) ? 'Membre VIP' : 'Membre Standard';

  badge.textContent = u.role === 'admin' ? 'ADMIN' : hasVipAccess(u) ? 'VIP' : u.fullName.split(' ')[0];
  authContainer.classList.add('hidden');
  profileContainer.classList.remove('hidden');

  document.getElementById('profileName').textContent = u.fullName;
  document.getElementById('profileEmail').textContent = u.email;
  document.getElementById('profileRoleBadge').textContent = roleLabel;

  const vipExpiryEl = document.getElementById('profileVipExpiry');
  if (u.role === 'admin') {
    vipExpiryEl.textContent = 'Accès complet administrateur activé.';
  } else if (hasVipAccess(u)) {
    vipExpiryEl.textContent = u.vipExpiresAt
      ? `Accès VIP actif jusqu'au ${formatDate(u.vipExpiresAt)}.`
      : 'Accès VIP actif (illimité).';
  } else {
    vipExpiryEl.textContent = "Compte standard. L'activation VIP s'effectue uniquement via l'administrateur.";
  }

  adminDashboard.classList.toggle('hidden', u.role !== 'admin');
}

function renderHome() {
  const todayMatches = state.matches.filter((m) => isToday(m.kickoffAt));
  const published = state.analyses.filter((a) => a.isPublished);
  const freePublished = published.filter((a) => !a.isVip);
  const vipPublished = published.filter((a) => a.isVip);

  const settled = published.filter((a) => a.outcome === 'won' || a.outcome === 'lost');
  const wonCount = settled.filter((a) => a.outcome === 'won').length;
  const rate = settled.length ? `${Math.round((wonCount / settled.length) * 100)}%` : '—';

  document.getElementById('kpiTodayMatches').textContent = todayMatches.length;
  document.getElementById('kpiFreeAnalyses').textContent = freePublished.length;
  document.getElementById('kpiVipAnalyses').textContent = vipPublished.length;
  document.getElementById('kpiSuccessRate').textContent = rate;

  const container = document.getElementById('homeFeaturedList');
  if (freePublished.length === 0) {
    container.innerHTML = `<div class="empty-card">Aucune analyse publiée pour le moment.</div>`;
    return;
  }
  container.innerHTML = freePublished.slice(0, 3).map(renderAnalysisCardHTML).join('');
}

function renderMatches() {
  const container = document.getElementById('matchesList');
  if (state.matches.length === 0) {
    container.innerHTML = `<div class="empty-card">Aucun match publié pour le moment.</div>`;
    return;
  }
  const sorted = [...state.matches].sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt));
  container.innerHTML = sorted
    .map((m) => `
      <article class="match-card">
        <div class="card-meta">
          <span>${escapeHTML(m.competition)}</span>
          <span>${escapeHTML(formatDate(m.kickoffAt))}</span>
        </div>
        <div class="teams-row">${escapeHTML(m.homeTeam)} vs ${escapeHTML(m.awayTeam)}</div>
        ${m.venue ? `<p class="muted small-text">Lieu : ${escapeHTML(m.venue)}</p>` : ''}
        <div class="card-actions">
          <button class="btn-secondary btn-sm" onclick="window.openMatchModal('${m.id}')">Voir fiche &amp; statistiques</button>
        </div>
      </article>
    `)
    .join('');
}

function renderFreeAnalyses() {
  const container = document.getElementById('freeAnalysesList');
  const list = state.analyses.filter((a) => a.isPublished && !a.isVip);
  container.innerHTML = list.length
    ? list.map(renderAnalysisCardHTML).join('')
    : `<div class="empty-card">Aucune analyse gratuite publiée actuellement.</div>`;
}

function renderVipSpace() {
  const gate = document.getElementById('vipGateContainer');
  const listEl = document.getElementById('vipAnalysesList');
  const vipList = state.analyses.filter((a) => a.isPublished && a.isVip);

  if (!hasVipAccess(state.currentUser)) {
    gate.innerHTML = `
      <div class="vip-lock-card">
        <span class="badge-gold">ACCÈS RESTREINT</span>
        <h3>Contenu réservé aux membres VIP</h3>
        <p class="muted">Connectez-vous avec un compte VIP activé par l'administrateur pour consulter les analyses VIP.</p>
        <div class="card-actions" style="justify-content:center;">
          <button class="btn-primary" onclick="window.goAccount()">Mon compte / Connexion</button>
        </div>
      </div>`;
    listEl.innerHTML = '';
    return;
  }

  gate.innerHTML = '';
  listEl.innerHTML = vipList.length
    ? vipList.map(renderAnalysisCardHTML).join('')
    : `<div class="empty-card">Aucune analyse VIP publiée pour le moment.</div>`;
}

function renderTeamStats() {
  const container = document.getElementById('teamStatsList');
  const q = state.statsQuery.trim().toLowerCase();
  const filtered = state.matches.filter((m) => {
    if (!q) return true;
    return (
      m.homeTeam.toLowerCase().includes(q) ||
      m.awayTeam.toLowerCase().includes(q) ||
      m.competition.toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-card">Aucune statistique d'équipe enregistrée.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((m) => `
      <article class="match-card">
        <div class="card-meta">
          <span>${escapeHTML(m.competition)}</span>
          <span>${escapeHTML(formatDate(m.kickoffAt))}</span>
        </div>
        <div class="teams-row">${escapeHTML(m.homeTeam)} vs ${escapeHTML(m.awayTeam)}</div>
        <div class="prediction-pill">
          <span>Forme Dom. : <strong>${escapeHTML(m.homeForm || 'N/R')}</strong></span>
          <span>Forme Ext. : <strong>${escapeHTML(m.awayForm || 'N/R')}</strong></span>
        </div>
        <div class="card-meta">
          <span>Buts marqués/m : ${escapeHTML(m.homeGoalsFor || '—')} / ${escapeHTML(m.awayGoalsFor || '—')}</span>
          <span>Encaissés/m : ${escapeHTML(m.homeGoalsAgainst || '—')} / ${escapeHTML(m.awayGoalsAgainst || '—')}</span>
        </div>
      </article>
    `)
    .join('');
}

function renderHistory() {
  const container = document.getElementById('historyList');
  let list = state.analyses.filter((a) => a.isPublished && a.outcome !== 'pending');
  if (state.historyFilter !== 'all') {
    list = list.filter((a) => a.outcome === state.historyFilter);
  }
  container.innerHTML = list.length
    ? list.map(renderAnalysisCardHTML).join('')
    : `<div class="empty-card">Aucun résultat clôturé pour ce filtre.</div>`;
}

function renderAnalysisCardHTML(analysis) {
  const match = state.matches.find((m) => m.id === analysis.matchId);
  const statusInfo = outcomeLabel(analysis.outcome);
  const accessBadge = analysis.isVip
    ? `<span class="badge-gold">VIP</span>`
    : `<span class="badge-free">GRATUIT</span>`;

  return `
    <article class="match-card">
      <div class="card-meta">
        <span>${match ? escapeHTML(match.competition) : 'Compétition'} • ${match ? escapeHTML(formatDate(match.kickoffAt)) : ''}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          ${accessBadge}
          <span class="badge-status ${statusInfo.cls}">${statusInfo.text}</span>
        </div>
      </div>
      <div class="teams-row">${match ? `${escapeHTML(match.homeTeam)} vs ${escapeHTML(match.awayTeam)}` : escapeHTML(analysis.title)}</div>
      <div class="prediction-pill">
        <strong>${escapeHTML(analysis.predictionLabel)}</strong>
        <span class="muted small-text">Confiance : ${escapeHTML(analysis.confidence)}</span>
      </div>
      <p class="muted" style="font-size:13px;">${escapeHTML(analysis.analysisText.slice(0, 140))}${analysis.analysisText.length > 140 ? '…' : ''}</p>
      <div class="card-actions">
        <button class="btn-outline-gold btn-sm" onclick="window.openAnalysisModal('${analysis.id}')">Lire l'analyse complète</button>
      </div>
    </article>
  `;
}

function renderAdminPanel() {
  if (!state.currentUser || state.currentUser.role !== 'admin') return;

  const select = document.getElementById('aMatchId');
  select.innerHTML = state.matches.length
    ? state.matches
        .map((m) => `<option value="${m.id}">${escapeHTML(m.homeTeam)} vs ${escapeHTML(m.awayTeam)} (${formatDate(m.kickoffAt)})</option>`)
        .join('')
    : '<option value="">Ajoutez d’abord un match (Onglet 1)</option>';

  const manageEl = document.getElementById('adminManageList');
  manageEl.innerHTML = state.analyses.length
    ? state.analyses
        .map((a) => {
          const match = state.matches.find((m) => m.id === a.matchId);
          return `
            <div class="match-card">
              <div class="card-meta">
                <span>${match ? escapeHTML(match.homeTeam + ' vs ' + match.awayTeam) : 'Match'}</span>
                <span>${a.isPublished ? 'Publiée' : 'Brouillon'} • ${a.isVip ? 'VIP' : 'Gratuit'}</span>
              </div>
              <strong>${escapeHTML(a.predictionLabel)}</strong>
              <div class="card-actions">
                <button class="btn-secondary btn-sm" onclick="window.adminSetOutcome('${a.id}', 'won')">Validé</button>
                <button class="btn-secondary btn-sm" onclick="window.adminSetOutcome('${a.id}', 'lost')">Non validé</button>
                <button class="btn-secondary btn-sm" onclick="window.adminSetOutcome('${a.id}', 'void')">Annulé</button>
                <button class="btn-secondary btn-sm" onclick="window.adminEditAnalysis('${a.id}')">Modifier</button>
                <button class="btn-secondary btn-sm" onclick="window.adminDeleteAnalysis('${a.id}')">Supprimer</button>
              </div>
            </div>`;
        })
        .join('')
    : `<div class="empty-card">Aucune analyse créée.</div>`;

  const usersEl = document.getElementById('adminUsersList');
  const otherUsers = state.users.filter((u) => u.id !== state.currentUser.id);
  usersEl.innerHTML = otherUsers.length
    ? otherUsers
        .map((u) => `
          <div class="match-card">
            <div class="card-meta">
              <strong>${escapeHTML(u.fullName)}</strong>
              <span class="badge-role">${escapeHTML(u.role.toUpperCase())}</span>
            </div>
            <p class="muted small-text">${escapeHTML(u.email)}</p>
            <div class="card-actions">
              <button class="btn-primary btn-sm" onclick="window.adminToggleVip('${u.id}', 30)">Activer VIP (30j)</button>
              <button class="btn-secondary btn-sm" onclick="window.adminRevokeVip('${u.id}')">Passer Standard</button>
            </div>
          </div>
        `)
        .join('')
    : `<div class="empty-card">Aucun autre utilisateur inscrit pour le moment.</div>`;
}

function showModal(title, htmlContent) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = htmlContent;
  document.getElementById('detailModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('detailModal').classList.add('hidden');
}

window.openMatchModal = (matchId) => {
  const m = state.matches.find((item) => item.id === matchId);
  if (!m) return;
  showModal(
    `${m.homeTeam} vs ${m.awayTeam}`,
    `
      <p class="muted">${escapeHTML(m.competition)} • ${escapeHTML(formatDate(m.kickoffAt))}</p>
      ${m.venue ? `<p class="small-text">Stade : ${escapeHTML(m.venue)}</p>` : ''}
      <div class="prediction-pill">
        <span>Forme Domicile : <strong>${escapeHTML(m.homeForm || 'N/R')}</strong></span>
        <span>Forme Extérieur : <strong>${escapeHTML(m.awayForm || 'N/R')}</strong></span>
      </div>
      <p class="small-text">Buts marqués/match : ${escapeHTML(m.homeGoalsFor || '—')} (Dom.) | ${escapeHTML(m.awayGoalsFor || '—')} (Ext.)</p>
      <p class="small-text">Buts encaissés/match : ${escapeHTML(m.homeGoalsAgainst || '—')} (Dom.) | ${escapeHTML(m.awayGoalsAgainst || '—')} (Ext.)</p>
    `
  );
};

window.openAnalysisModal = (analysisId) => {
  const a = state.analyses.find((item) => item.id === analysisId);
  if (!a) return;
  if (a.isVip && !hasVipAccess(state.currentUser)) {
    navigateTo('vip');
    return;
  }
  const m = state.matches.find((item) => item.id === a.matchId);
  showModal(
    m ? `${m.homeTeam} vs ${m.awayTeam}` : a.title,
    `
      <p class="muted">${m ? escapeHTML(m.competition + ' • ' + formatDate(m.kickoffAt)) : ''}</p>
      <div class="prediction-pill">
        <strong>${escapeHTML(a.predictionLabel)}</strong>
        <span class="badge-gold">${escapeHTML(a.confidence)}</span>
      </div>
      <h4 style="margin:10px 0 6px;">${escapeHTML(a.title)}</h4>
      <p style="white-space:pre-line;font-size:14px;">${escapeHTML(a.analysisText)}</p>
    `
  );
};

window.goAccount = () => navigateTo('account');

window.adminSetOutcome = async (id, outcome) => {
  if (USE_SUPABASE) {
    await supabase.from('analyses').update({ outcome }).eq('id', id);
    await refreshData();
  } else {
    const item = state.analyses.find((a) => a.id === id);
    if (item) item.outcome = outcome;
    saveLocalStore();
  }
  renderAll();
};

window.adminEditAnalysis = (id) => {
  const item = state.analyses.find((a) => a.id === id);
  if (!item) return;
  document.getElementById('aEditId').value = item.id;
  document.getElementById('aMatchId').value = item.matchId;
  document.getElementById('aTitle').value = item.title;
  document.getElementById('aPrediction').value = item.predictionLabel;
  document.getElementById('aConfidence').value = item.confidence;
  document.getElementById('aIsVip').value = String(item.isVip);
  document.getElementById('aText').value = item.analysisTe
