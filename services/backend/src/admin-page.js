function adminPageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>花牌后端管理</title>
  <style>
    :root {
      --ink: #0F1720;
      --paper: #F4F1EA;
      --panel: #FFFDF8;
      --muted: #5F6670;
      --line: #D4C9BA;
      --copper: #C96B2C;
      --green: #24745A;
      --red: #B83A2F;
      --red-dark: #8F2D25;
      --field: #FFFFFF;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(90deg, rgba(15, 23, 32, 0.055) 1px, transparent 1px),
        linear-gradient(180deg, rgba(15, 23, 32, 0.04) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      font-family: Verdana, Geneva, sans-serif;
    }
    main {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(250px, 330px) minmax(0, 1fr);
    }
    aside {
      background: var(--ink);
      color: var(--paper);
      padding: 34px 28px;
      border-right: 8px solid var(--copper);
      display: flex;
      flex-direction: column;
      gap: 26px;
    }
    h1, h2, h3 {
      font-family: Georgia, serif;
      letter-spacing: 0;
    }
    h1 {
      font-size: 33px;
      line-height: 1.1;
      margin: 0;
    }
    h2 {
      font-size: 25px;
      margin: 0 0 8px;
    }
    h3 {
      font-size: 18px;
      margin: 0 0 12px;
    }
    p {
      line-height: 1.65;
      margin: 0;
    }
    .rail-note {
      color: #D9D0C4;
      font-size: 13px;
    }
    .identity {
      border-top: 1px solid rgba(244, 241, 234, 0.22);
      padding-top: 20px;
      display: grid;
      gap: 10px;
      font-size: 13px;
    }
    .badge {
      display: inline-flex;
      width: fit-content;
      border: 1px solid rgba(244, 241, 234, 0.34);
      border-radius: 4px;
      padding: 5px 8px;
      color: #F7E3C8;
      font-size: 12px;
    }
    section {
      padding: 30px clamp(18px, 4vw, 46px) 42px;
    }
    .login-shell {
      min-height: 100vh;
      display: grid;
      align-content: center;
      max-width: 520px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      box-shadow: 9px 9px 0 rgba(15, 23, 32, 0.08);
    }
    .login-panel {
      padding: 24px;
      border-left: 8px solid var(--copper);
    }
    .stack {
      display: grid;
      gap: 14px;
    }
    .workspace {
      display: none;
      gap: 24px;
    }
    .workspace.active {
      display: grid;
    }
    .topline {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    label {
      display: grid;
      gap: 7px;
      color: var(--muted);
      font-size: 12px;
    }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 5px;
      padding: 11px 12px;
      color: var(--ink);
      background: var(--field);
      font-family: Verdana, Geneva, sans-serif;
      font-size: 13px;
    }
    button {
      border: 0;
      border-radius: 5px;
      padding: 11px 14px;
      color: #fff;
      background: var(--green);
      font-family: Verdana, Geneva, sans-serif;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      min-height: 40px;
    }
    button.secondary {
      background: #39434F;
    }
    button.warning {
      background: var(--copper);
    }
    button.danger {
      background: var(--red);
    }
    button.danger:hover {
      background: var(--red-dark);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .status {
      min-height: 24px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .status.bad {
      color: var(--red-dark);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      border-bottom: 1px solid #E4D9CB;
      padding: 13px 14px;
      vertical-align: middle;
    }
    tr:last-child td {
      border-bottom: 0;
    }
    th {
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: #ECE4D8;
    }
    code {
      font-family: Menlo, Consolas, monospace;
      font-size: 13px;
      color: var(--ink);
    }
    .count {
      font-family: Georgia, serif;
      font-size: 27px;
      color: var(--ink);
    }
    .danger-zone {
      padding: 18px;
      background: #FFF3E6;
      border: 1px solid #E4B889;
      border-left: 8px solid var(--copper);
      border-radius: 6px;
    }
    .danger-grid, .admin-form {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 10px;
      align-items: end;
      margin-top: 12px;
    }
    .admin-form {
      grid-template-columns: 1fr 1fr 160px auto;
    }
    .hint {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
    }
    .hidden {
      display: none !important;
    }
    @media (max-width: 820px) {
      main {
        grid-template-columns: 1fr;
      }
      aside {
        border-right: 0;
        border-bottom: 8px solid var(--copper);
      }
      .login-shell {
        min-height: auto;
      }
      .topline {
        display: grid;
      }
      .toolbar {
        justify-content: flex-start;
      }
      .danger-grid, .admin-form {
        grid-template-columns: 1fr;
      }
      th:nth-child(2), td:nth-child(2), th:nth-child(5), td:nth-child(5) {
        display: none;
      }
    }
  </style>
</head>
<body>
  <main>
    <aside>
      <div class="stack">
        <h1>花牌后端管理</h1>
        <p class="rail-note">账号密码登录后，可清理房间残留数据，并维护后台管理员。</p>
      </div>
      <div class="identity">
        <span class="badge" id="roleBadge">未登录</span>
        <div id="identityText">请使用管理员账号进入工作台。</div>
        <p class="rail-note">默认超级管理员：wangyk / ww808123。首次进入后建议新增自己的管理员账号。</p>
      </div>
    </aside>
    <section>
      <div id="loginShell" class="login-shell">
        <form id="loginForm" class="panel login-panel stack">
          <div>
            <h2>管理员登录</h2>
            <div class="status" id="loginStatus">请输入后台管理员账号。</div>
          </div>
          <label>用户名
            <input id="username" name="username" autocomplete="username" value="wangyk">
          </label>
          <label>密码
            <input id="password" name="password" type="password" autocomplete="current-password">
          </label>
          <button type="submit">登录后台</button>
        </form>
      </div>
      <div id="workspace" class="workspace">
        <div class="topline">
          <div>
            <h2>房间数据集合</h2>
            <div id="status" class="status"></div>
          </div>
          <div class="toolbar">
            <button id="refresh" type="button">刷新</button>
            <button id="logout" class="secondary" type="button">退出登录</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>集合</th>
              <th>用途</th>
              <th>数量</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="collections"></tbody>
        </table>
        <div class="danger-zone">
          <h3>危险操作</h3>
          <div class="hint">输入 CLEAR 后可清空全部房间相关集合。该操作不会删除玩家用户资料。</div>
          <div class="danger-grid">
            <label>确认文本
              <input id="confirmAll" placeholder="CLEAR" autocomplete="off">
            </label>
            <button id="clearAll" class="danger" type="button">清空全部</button>
          </div>
        </div>
        <div id="adminPanel" class="stack">
          <div class="topline">
            <div>
              <h2>管理员账号</h2>
              <div class="hint">只有超级管理员可以新增或禁用管理员。</div>
            </div>
            <button id="refreshAdmins" class="secondary" type="button">刷新管理员</button>
          </div>
          <form id="adminForm" class="panel danger-zone">
            <h3>新增管理员</h3>
            <div class="admin-form">
              <label>用户名
                <input id="newUsername" autocomplete="off" placeholder="admin-name">
              </label>
              <label>密码
                <input id="newPassword" type="password" autocomplete="new-password" placeholder="至少 6 位">
              </label>
              <label>角色
                <select id="newRole">
                  <option value="admin">普通管理员</option>
                  <option value="superadmin">超级管理员</option>
                </select>
              </label>
              <button class="warning" type="submit">新增</button>
            </div>
          </form>
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>角色</th>
                <th>状态</th>
                <th>创建人</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="admins"></tbody>
          </table>
        </div>
      </div>
    </section>
  </main>
  <script>
    const storageKey = 'huapai-admin-session';
    let currentAdmin = null;

    const loginShell = document.getElementById('loginShell');
    const workspace = document.getElementById('workspace');
    const loginForm = document.getElementById('loginForm');
    const loginStatus = document.getElementById('loginStatus');
    const statusEl = document.getElementById('status');
    const roleBadge = document.getElementById('roleBadge');
    const identityText = document.getElementById('identityText');
    const tbody = document.getElementById('collections');
    const adminsBody = document.getElementById('admins');
    const adminPanel = document.getElementById('adminPanel');
    const adminForm = document.getElementById('adminForm');

    function token() {
      return localStorage.getItem(storageKey) || '';
    }

    function setToken(value) {
      if (value) localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
    }

    function setStatus(el, text, danger) {
      el.textContent = text || '';
      el.classList.toggle('bad', Boolean(danger));
    }

    function showLogin(message, danger) {
      currentAdmin = null;
      loginShell.classList.remove('hidden');
      workspace.classList.remove('active');
      roleBadge.textContent = '未登录';
      identityText.textContent = '请使用管理员账号进入工作台。';
      setStatus(loginStatus, message || '请输入后台管理员账号。', danger);
    }

    function showWorkspace(admin) {
      currentAdmin = admin;
      loginShell.classList.add('hidden');
      workspace.classList.add('active');
      roleBadge.textContent = admin.role === 'superadmin' ? '超级管理员' : '普通管理员';
      identityText.textContent = admin.username;
      adminPanel.classList.toggle('hidden', admin.role !== 'superadmin');
    }

    async function api(path, options = {}) {
      const headers = Object.assign({}, options.headers || {});
      if (token()) headers.authorization = 'Bearer ' + token();
      if (options.body) headers['content-type'] = 'application/json';
      const res = await fetch(path, Object.assign({}, options, { headers }));
      const data = await res.json().catch(() => ({ ok: false, error: 'BAD_JSON' }));
      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          setToken('');
          showLogin('登录已失效，请重新登录。', true);
        }
        const err = new Error(data.error || 'REQUEST_FAILED');
        err.data = data;
        err.status = res.status;
        throw err;
      }
      return data;
    }

    function cell(text) {
      const td = document.createElement('td');
      td.textContent = text == null ? '' : String(text);
      return td;
    }

    function codeCell(text) {
      const td = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = text;
      td.appendChild(code);
      return td;
    }

    function renderCollections(collections) {
      tbody.textContent = '';
      collections.forEach((item) => {
        const tr = document.createElement('tr');
        tr.appendChild(codeCell(item.name));
        tr.appendChild(cell(item.description));
        const countTd = document.createElement('td');
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = item.count;
        countTd.appendChild(count);
        tr.appendChild(countTd);
        const actionTd = document.createElement('td');
        const button = document.createElement('button');
        button.className = 'danger';
        button.textContent = '清空';
        button.disabled = item.count <= 0;
        button.dataset.name = item.name;
        actionTd.appendChild(button);
        tr.appendChild(actionTd);
        tbody.appendChild(tr);
      });
    }

    function renderAdmins(admins) {
      adminsBody.textContent = '';
      admins.forEach((admin) => {
        const tr = document.createElement('tr');
        tr.appendChild(codeCell(admin.username));
        tr.appendChild(cell(admin.role === 'superadmin' ? '超级管理员' : '普通管理员'));
        tr.appendChild(cell(admin.enabled ? '启用' : '禁用'));
        tr.appendChild(cell(admin.createdBy || '-'));
        tr.appendChild(cell(admin.updatedAt || '-'));
        const actionTd = document.createElement('td');
        const button = document.createElement('button');
        button.className = 'danger';
        button.textContent = '禁用';
        button.dataset.username = admin.username;
        button.disabled = !admin.enabled || admin.defaultAdmin || admin.username === currentAdmin.username;
        actionTd.appendChild(button);
        tr.appendChild(actionTd);
        adminsBody.appendChild(tr);
      });
    }

    async function refresh() {
      setStatus(statusEl, '正在读取集合状态...');
      try {
        const data = await api('/api/admin/status');
        renderCollections(data.collections || []);
        setStatus(statusEl, '状态已更新。');
      } catch (err) {
        if (err.status !== 401) setStatus(statusEl, '读取失败：' + err.message, true);
      }
    }

    async function refreshAdmins() {
      if (!currentAdmin || currentAdmin.role !== 'superadmin') return;
      try {
        const data = await api('/api/admin/admins');
        renderAdmins(data.admins || []);
      } catch (err) {
        if (err.status !== 401) setStatus(statusEl, '管理员列表读取失败：' + err.message, true);
      }
    }

    async function loadMe() {
      if (!token()) {
        showLogin();
        return;
      }
      try {
        const data = await api('/api/admin/me');
        showWorkspace(data.admin);
        await refresh();
        await refreshAdmins();
      } catch (err) {
        showLogin('登录已失效，请重新登录。', true);
      }
    }

    async function clearCollection(name, confirmText) {
      if (confirmText !== 'CLEAR') {
        setStatus(statusEl, '确认文本不匹配。', true);
        return;
      }
      setStatus(statusEl, '正在删除 ' + name + '...');
      try {
        const data = await api('/api/admin/clear', {
          method: 'POST',
          body: JSON.stringify({ collection: name, confirm: confirmText }),
        });
        setStatus(statusEl, '删除完成：' + JSON.stringify(data.deleted));
        await refresh();
      } catch (err) {
        if (err.status !== 401) setStatus(statusEl, '删除失败：' + err.message, true);
      }
    }

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(loginStatus, '正在登录...');
      try {
        const data = await api('/api/admin/login', {
          method: 'POST',
          body: JSON.stringify({
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value,
          }),
        });
        setToken(data.token);
        showWorkspace(data.admin);
        setStatus(statusEl, '登录成功。');
        await refresh();
        await refreshAdmins();
      } catch (err) {
        setStatus(loginStatus, '登录失败：' + err.message, true);
      }
    });

    document.getElementById('refresh').addEventListener('click', refresh);
    document.getElementById('refreshAdmins').addEventListener('click', refreshAdmins);
    document.getElementById('clearAll').addEventListener('click', () => {
      clearCollection('all', document.getElementById('confirmAll').value.trim());
    });
    document.getElementById('logout').addEventListener('click', async () => {
      try {
        await api('/api/admin/logout', { method: 'POST' });
      } catch (err) {
      }
      setToken('');
      showLogin('已退出登录。');
    });
    tbody.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !target.dataset || !target.dataset.name) return;
      const value = window.prompt('输入 CLEAR 清空 ' + target.dataset.name);
      clearCollection(target.dataset.name, String(value || '').trim());
    });
    adminForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(statusEl, '正在新增管理员...');
      try {
        await api('/api/admin/admins', {
          method: 'POST',
          body: JSON.stringify({
            username: document.getElementById('newUsername').value.trim(),
            password: document.getElementById('newPassword').value,
            role: document.getElementById('newRole').value,
          }),
        });
        adminForm.reset();
        setStatus(statusEl, '管理员已新增。');
        await refreshAdmins();
      } catch (err) {
        if (err.status !== 401) setStatus(statusEl, '新增管理员失败：' + err.message, true);
      }
    });
    adminsBody.addEventListener('click', async (event) => {
      const target = event.target;
      if (!target || !target.dataset || !target.dataset.username) return;
      const value = window.prompt('输入 DISABLE 禁用 ' + target.dataset.username);
      if (String(value || '').trim() !== 'DISABLE') {
        setStatus(statusEl, '确认文本不匹配。', true);
        return;
      }
      try {
        await api('/api/admin/admins/disable', {
          method: 'POST',
          body: JSON.stringify({ username: target.dataset.username }),
        });
        setStatus(statusEl, '管理员已禁用。');
        await refreshAdmins();
      } catch (err) {
        if (err.status !== 401) setStatus(statusEl, '禁用管理员失败：' + err.message, true);
      }
    });

    loadMe();
  </script>
</body>
</html>`;
}

module.exports = {
  adminPageHtml,
};
