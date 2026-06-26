function adminPageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>花牌后端管理</title>
  <style>
    :root {
      --ink: #111827;
      --paper: #f8fafc;
      --muted: #475569;
      --line: #cbd5e1;
      --danger: #d97706;
      --danger-dark: #92400e;
      --ok: #0f766e;
      --panel: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: Verdana, Geneva, sans-serif;
    }
    main {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(260px, 340px) 1fr;
    }
    aside {
      background: var(--ink);
      color: var(--paper);
      padding: 32px 28px;
      border-right: 6px solid var(--danger);
    }
    h1 {
      font-family: Georgia, serif;
      font-size: 32px;
      line-height: 1.12;
      margin: 0 0 20px;
      font-weight: 700;
    }
    .meta {
      color: #cbd5e1;
      line-height: 1.7;
      font-size: 13px;
      margin-bottom: 28px;
    }
    .token-row {
      display: grid;
      gap: 10px;
    }
    label {
      font-size: 12px;
      color: #e2e8f0;
      letter-spacing: 0.02em;
    }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 11px 12px;
      font-family: Menlo, Consolas, monospace;
      font-size: 13px;
      color: var(--ink);
      background: #fff;
    }
    button {
      border: 0;
      border-radius: 6px;
      padding: 11px 14px;
      font-family: Verdana, Geneva, sans-serif;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      background: var(--ok);
      color: #fff;
    }
    button.secondary {
      background: #334155;
    }
    button.danger {
      background: var(--danger);
    }
    button.danger:hover {
      background: var(--danger-dark);
    }
    button:disabled {
      opacity: 0.52;
      cursor: not-allowed;
    }
    section {
      padding: 30px clamp(22px, 4vw, 48px);
    }
    .topline {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 18px;
      margin-bottom: 22px;
    }
    h2 {
      font-family: Georgia, serif;
      font-size: 24px;
      margin: 0 0 8px;
    }
    .status {
      min-height: 22px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--line);
    }
    th, td {
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 16px;
      vertical-align: middle;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: #f1f5f9;
    }
    td code {
      font-family: Menlo, Consolas, monospace;
      font-size: 13px;
      color: #0f172a;
    }
    .count {
      font-family: Georgia, serif;
      font-size: 28px;
      color: var(--ink);
    }
    .danger-zone {
      margin-top: 26px;
      padding: 18px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-left: 6px solid var(--danger);
    }
    .danger-grid {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 10px;
      align-items: end;
      margin-top: 12px;
    }
    .hint {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
    }
    @media (max-width: 760px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 6px solid var(--danger); }
      .topline { display: block; }
      .danger-grid { grid-template-columns: 1fr; }
      th:nth-child(2), td:nth-child(2) { display: none; }
    }
  </style>
</head>
<body>
  <main>
    <aside>
      <h1>花牌后端管理</h1>
      <p class="meta">仅管理在线房间相关集合。删除会影响当前牌桌、公共状态和匹配队列。</p>
      <div class="token-row">
        <label for="token">ADMIN_TOKEN</label>
        <input id="token" type="password" autocomplete="off">
        <button id="saveToken" class="secondary">保存 token</button>
      </div>
    </aside>
    <section>
      <div class="topline">
        <div>
          <h2>房间数据集合</h2>
          <div id="status" class="status"></div>
        </div>
        <button id="refresh">刷新</button>
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
        <strong>危险操作</strong>
        <div class="hint">输入 CLEAR 后可清空全部房间相关集合。</div>
        <div class="danger-grid">
          <input id="confirmAll" placeholder="CLEAR" autocomplete="off">
          <button id="clearAll" class="danger">清空全部</button>
          <button id="forgetToken" class="secondary">清除 token</button>
        </div>
      </div>
    </section>
  </main>
  <script>
    const storageKey = 'huapai-admin-token';
    const params = new URLSearchParams(location.search);
    const tokenInput = document.getElementById('token');
    const statusEl = document.getElementById('status');
    const tbody = document.getElementById('collections');
    const queryToken = params.get('token') || '';
    if (queryToken) {
      localStorage.setItem(storageKey, queryToken);
      history.replaceState(null, '', location.pathname);
    }
    tokenInput.value = localStorage.getItem(storageKey) || '';

    function token() {
      return tokenInput.value.trim();
    }
    function setStatus(text, danger) {
      statusEl.textContent = text || '';
      statusEl.style.color = danger ? '#92400e' : '#475569';
    }
    async function api(path, options = {}) {
      const headers = Object.assign({ authorization: 'Bearer ' + token() }, options.headers || {});
      if (options.body) headers['content-type'] = 'application/json';
      const res = await fetch(path, Object.assign({}, options, { headers }));
      const data = await res.json().catch(() => ({ ok: false, error: 'BAD_JSON' }));
      if (!res.ok || !data.ok) {
        const err = new Error(data.error || 'REQUEST_FAILED');
        err.data = data;
        throw err;
      }
      return data;
    }
    function render(collections) {
      tbody.innerHTML = '';
      collections.forEach((item) => {
        const tr = document.createElement('tr');
        const disabled = item.count <= 0 ? 'disabled' : '';
        tr.innerHTML =
          '<td><code>' + item.name + '</code></td>' +
          '<td>' + item.description + '</td>' +
          '<td><span class="count">' + item.count + '</span></td>' +
          '<td><button class="danger" data-name="' + item.name + '" ' + disabled + '>清空</button></td>';
        tbody.appendChild(tr);
      });
    }
    async function refresh() {
      if (!token()) {
        setStatus('请先填写 ADMIN_TOKEN。', true);
        return;
      }
      setStatus('正在读取集合状态...');
      try {
        const data = await api('/api/admin/status');
        render(data.collections || []);
        setStatus('状态已更新。');
      } catch (err) {
        setStatus('读取失败：' + err.message, true);
      }
    }
    async function clearCollection(name, confirmText) {
      if (confirmText !== 'CLEAR') {
        setStatus('确认文本不匹配。', true);
        return;
      }
      setStatus('正在删除 ' + name + '...');
      try {
        const data = await api('/api/admin/clear', {
          method: 'POST',
          body: JSON.stringify({ collection: name, confirm: confirmText }),
        });
        setStatus('删除完成：' + JSON.stringify(data.deleted));
        await refresh();
      } catch (err) {
        setStatus('删除失败：' + err.message, true);
      }
    }
    document.getElementById('saveToken').addEventListener('click', () => {
      localStorage.setItem(storageKey, token());
      refresh();
    });
    document.getElementById('refresh').addEventListener('click', refresh);
    document.getElementById('clearAll').addEventListener('click', () => {
      clearCollection('all', document.getElementById('confirmAll').value.trim());
    });
    document.getElementById('forgetToken').addEventListener('click', () => {
      localStorage.removeItem(storageKey);
      tokenInput.value = '';
      setStatus('token 已清除。');
    });
    tbody.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !target.dataset || !target.dataset.name) return;
      const value = window.prompt('输入 CLEAR 清空 ' + target.dataset.name);
      clearCollection(target.dataset.name, String(value || '').trim());
    });
    refresh();
  </script>
</body>
</html>`;
}

module.exports = {
  adminPageHtml,
};
