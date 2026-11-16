const $ = (id) => document.getElementById(id);
let token = localStorage.getItem('token');
let project = null;
let gen = null;
let preview = null;

async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && token) return logout();
  const data = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new Error(data.error?.message + (data.error?.details ? '\n' + data.error.details.map((d) => d.message || d).join('\n') : ''));
  return data;
}

/* ---- auth ---- */
async function auth(path) {
  $('authMsg').textContent = '';
  try {
    const d = await api('POST', '/auth/' + path, { name: $('name').value, email: $('email').value, password: $('password').value });
    token = d.token;
    localStorage.setItem('token', token);
    start();
  } catch (e) { $('authMsg').textContent = e.message; }
}
$('loginBtn').onclick = () => auth('login');
$('registerBtn').onclick = () => auth('register');
function logout() { localStorage.removeItem('token'); location.reload(); }

async function start() {
  if (!token) { $('auth').hidden = false; return; }
  const { user } = await api('GET', '/auth/me');
  $('auth').hidden = true; $('app').hidden = false;
  $('who').innerHTML = `${user.email} <button class="ghost" id="out">Log out</button>`;
  $('out').onclick = logout;
  loadProjects();
}

/* ---- projects ---- */
async function loadProjects() {
  const { data } = await api('GET', '/projects');
  $('projects').innerHTML = '';
  data.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p.name;
    li.className = project?.id === p.id ? 'on' : '';
    li.onclick = () => openProject(p.id);
    $('projects').append(li);
  });
}
$('newProj').onclick = async () => {
  if (!$('projName').value.trim()) return;
  const { data } = await api('POST', '/projects', { name: $('projName').value });
  $('projName').value = '';
  await loadProjects();
  openProject(data.id);
};

async function openProject(id) {
  const { data } = await api('GET', '/projects/' + id);
  project = data;
  $('empty').hidden = true; $('editor').hidden = false;
  $('projTitle').textContent = data.name;
  $('schema').value = data.latestSchema || $('schema').value;
  $('history').innerHTML = data.generations.map((g) => `<option value="${g.id}">v${g.version} · ${new Date(g.createdAt).toLocaleString()}</option>`).join('');
  loadProjects();
  if (data.generations[0]) loadGeneration(data.generations[0].id); else $('result').hidden = true;
}

$('sampleBtn').onclick = async () => { $('schema').value = await (await fetch('/sample.prisma')).text(); };

/* ---- generate ---- */
$('genBtn').onclick = async () => {
  $('genBtn').disabled = true; $('status').className = 'muted'; $('status').textContent = 'Generating…';
  try {
    const { data } = await api('POST', `/projects/${project.id}/generations`, { schema: $('schema').value });
    $('status').textContent = `v${data.version}: ${data.fileCount} files in ${data.durationMs}ms`;
    await openProject(project.id);
  } catch (e) { $('status').className = 'err'; $('status').textContent = e.message; }
  $('genBtn').disabled = false;
};

$('history').onchange = () => loadGeneration($('history').value);

async function loadGeneration(id) {
  const [{ data }, { data: diff }] = await Promise.all([api('GET', '/generations/' + id), api('GET', `/generations/${id}/diff`)]);
  gen = data;
  $('result').hidden = false; $('preview').hidden = true; preview = null;
  const s = diff.summary;
  const changed = new Map([...s.added.map((f) => [f.path, 'A']), ...s.modified.map((f) => [f.path, 'M'])]);
  $('changes').textContent = [
    ...(data.summary.warnings || []).map((w) => '⚠ ' + w),
    diff.from
      ? `vs v${diff.from.version}: +${s.added.length} added, ~${s.modified.length} modified, -${s.removed.length} removed, ${s.unchanged} unchanged`
      : 'First generation',
    ...s.modified.map((f) => `  M ${f.path} (+${f.additions} -${f.deletions})`),
    ...(diff.from ? s.added.map((f) => `  A ${f.path}`) : []),
    ...s.removed.map((f) => `  D ${f.path}`),
  ].join('\n');
  $('fileList').innerHTML = '';
  data.files.forEach((f, i) => {
    const li = document.createElement('li');
    li.textContent = (diff.from && changed.get(f.path) ? changed.get(f.path) + ' ' : '') + f.path;
    li.onclick = () => {
      [...$('fileList').children].forEach((c) => (c.className = ''));
      li.className = 'on'; $('fileView').textContent = f.content;
    };
    $('fileList').append(li);
    if (i === 0) li.onclick();
  });
}

/* ---- download (fetch so the JWT header is sent) ---- */
$('dlBtn').onclick = async () => {
  const res = await fetch(`/api/generations/${gen.id}/download`, { headers: { Authorization: 'Bearer ' + token } });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = `${gen.summary.slug}-v${gen.version}.zip`;
  a.click();
};

/* ---- live preview ---- */
$('prevBtn').onclick = async () => {
  $('prevBtn').disabled = true;
  try {
    const { data } = await api('POST', `/generations/${gen.id}/preview`);
    preview = data;
    $('preview').hidden = false;
    $('endpoint').innerHTML = data.endpoints.map((e, i) => `<option value="${i}">${e.method} ${e.path}</option>`).join('');
    $('endpoint').onchange();
    $('resp').textContent = `Preview running (seeded: ${JSON.stringify(data.seeded)}), expires ${new Date(data.expiresAt).toLocaleTimeString()}`;
  } catch (e) { alert(e.message); }
  $('prevBtn').disabled = false;
};
$('endpoint').onchange = () => {
  const e = preview.endpoints[$('endpoint').value];
  $('reqBody').value = e.body ? JSON.stringify(e.body, null, 2) : '';
  $('reqBody').hidden = !e.body;
  $('idInput').hidden = !e.path.includes(':id');
};
$('sendBtn').onclick = async () => {
  const e = preview.endpoints[$('endpoint').value];
  const url = preview.baseUrl + e.path.replace(':id', encodeURIComponent($('idInput').value || '1')) + (e.query ? '?' + e.query : '');
  const t = performance.now();
  const res = await fetch(url, { method: e.method, headers: { 'Content-Type': 'application/json' }, body: e.body ? $('reqBody').value : undefined });
  const text = await res.text();
  let out = text;
  try { out = JSON.stringify(JSON.parse(text), null, 2); } catch {}
  $('resp').textContent = `${e.method} ${url} → ${res.status} (${Math.round(performance.now() - t)}ms)\n\n${out}`;
};

start().catch(() => logout());
