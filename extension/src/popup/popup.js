'use strict';

// ── 标签页切换 ────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab')
      .forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content')
      .forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});


// ── 读取已保存的设置，填入表单 ────────────────────────────────────────
chrome.storage.sync.get(['token', 'repo', 'branch', 'websiteUrl'], (cfg) => {
  if (cfg.token)      document.getElementById('token').value   = cfg.token;
  if (cfg.repo)       document.getElementById('repo').value    = cfg.repo;
  if (cfg.websiteUrl) document.getElementById('website').value = cfg.websiteUrl;

  // 状态圆点：绿色=已配置，红色=未配置
  const dot = document.getElementById('statusDot');
  if (cfg.token && cfg.repo) {
    dot.classList.add('connected');
    dot.title = '已连接';
  }

  // 看板链接
  if (cfg.websiteUrl) {
    document.getElementById('dashboardLink').href = cfg.websiteUrl;
  }
});


// ── 读取刷题统计数据 ──────────────────────────────────────────────────
chrome.storage.local.get(['stats', 'recentSubmissions'], (data) => {
  // 更新统计数字
  const s = data.stats ?? { total: 0, easy: 0, medium: 0, hard: 0 };
  document.getElementById('total').textContent = s.total;
  document.getElementById('easy').textContent  = s.easy;
  document.getElementById('med').textContent   = s.medium;
  document.getElementById('hard').textContent  = s.hard;

  // 计算连续刷题天数
  const streak = calcStreak(data.recentSubmissions ?? []);
  document.getElementById('streak').textContent = `${streak} 天`;

  // 渲染最近提交列表
  if (data.recentSubmissions?.length) {
    renderRecent(data.recentSubmissions);
  }
});


// ── 保存设置 ──────────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', () => {
  const token      = document.getElementById('token').value.trim();
  const repo       = document.getElementById('repo').value.trim();
  const websiteUrl = document.getElementById('website').value.trim();
  const msg        = document.getElementById('saveMsg');

  if (!token || !repo) {
    msg.style.color   = '#f85149';
    msg.textContent   = '⚠️ Token 和仓库名不能为空';
    return;
  }

  chrome.storage.sync.set({ token, repo, websiteUrl }, () => {
    msg.style.color = '#3fb950';
    msg.textContent = '✓ 保存成功！';

    document.getElementById('statusDot').classList.add('connected');
    document.getElementById('statusDot').title = '已连接';

    if (websiteUrl) {
      document.getElementById('dashboardLink').href = websiteUrl;
    }

    setTimeout(() => { msg.textContent = ''; }, 2000);
  });
});


// ── 渲染最近提交列表 ──────────────────────────────────────────────────
function renderRecent(submissions) {
  const list = document.getElementById('recentList');
  list.innerHTML = '';

  submissions.slice(0, 8).forEach(s => {
    const diff = s.difficulty?.toLowerCase() ?? 'easy';
    const li   = document.createElement('li');
    li.className = 'recent-item';
    li.innerHTML = `
      <span class="prob-id">#${s.id}</span>
      <span class="prob-name">${s.title}</span>
      <span class="badge ${diff}">${s.difficulty}</span>
    `;
    list.appendChild(li);
  });
}


// ── 计算连续刷题天数 ──────────────────────────────────────────────────
function calcStreak(submissions) {
  if (!submissions.length) return 0;

  // 取出所有提交日期（去重）
  const dates = [...new Set(
    submissions.map(s => s.submittedAt?.slice(0, 10)).filter(Boolean)
  )].sort().reverse();

  let streak  = 0;
  let current = new Date();
  current.setHours(0, 0, 0, 0);

  for (const d of dates) {
    const day  = new Date(d);
    const diff = Math.round((current - day) / 86400000);

    if (diff <= 1) {
      streak++;
      current = day;
    } else {
      break;
    }
  }

  return streak;
}