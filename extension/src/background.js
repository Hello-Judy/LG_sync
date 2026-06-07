/**
 * background.js
 * 插件后台进程（Service Worker）
 * 职责：接收 content.js 的数据，通过 GitHub API 同步到仓库
 */

'use strict';


// ── 第一部分：监听来自 content.js 的消息 ──────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SUBMISSION_ACCEPTED') {
    // 开始同步流程
    syncToGitHub(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error('[LG Sync] 同步失败:', err);
        sendResponse({ ok: false, error: err.message });
      });
    return true; // 告诉 Chrome 我们会异步回复
  }
});


// ── 第二部分：主同步流程 ───────────────────────────────────────────────

async function syncToGitHub(submission) {
  // 读取用户配置的 Token 和仓库名
  const config = await getConfig();

  if (!config.token || !config.repo) {
    showNotification('⚠️ LG Sync', '请先在插件设置里填写 GitHub Token 和仓库名');
    return;
  }

  // 创建 GitHub 客户端
  const github = new GitHubClient(config.token, config.repo, config.branch ?? 'main');

  // 这道题的文件夹路径，例如：problems/0001-two-sum
  const folder = `problems/${submission.id}-${submission.slug}`;

  try {
    // 步骤① 上传解题代码
    await github.upsertFile(
      `${folder}/solution.${submission.fileExtension}`,
      submission.code,
      `✅ #${submission.id} ${submission.title} - ${submission.language}`
    );

    // 步骤② 生成并上传题目 README
    await github.upsertFile(
      `${folder}/README.md`,
      buildProblemReadme(submission),
      `📝 #${submission.id} ${submission.title} - 更新说明`
    );

    // 步骤③ 更新历史提交记录
    await updateHistory(github, folder, submission);

    // 步骤④ 更新全局统计数据
    await updateProgress(github, submission);

    // 完成！发送系统通知
    showNotification(
      '✅ 同步成功',
      `#${submission.id} ${submission.title} · ${submission.runtime}`
    );

    // 同时把最近提交存到本地（供 popup 显示）
    await saveRecentLocally(submission);

  } catch (err) {
    console.error('[LG Sync]', err);
    showNotification('❌ 同步失败', err.message);
    throw err;
  }
}


// ── 第三部分：更新这道题的历史记录 ───────────────────────────────────

async function updateHistory(github, folder, submission) {
  const path = `${folder}/history.json`;
  let history = [];

  // 先读取已有的历史记录
  try {
    const existing = await github.getFile(path);
    if (existing) {
      history = JSON.parse(atob(existing.content));
    }
  } catch (_) {
    // 文件不存在就从空数组开始
  }

  // 把新的提交插到最前面
  history.unshift({
    submittedAt:       submission.submittedAt,
    language:          submission.language,
    runtime:           submission.runtime,
    runtimePercentile: submission.runtimePercentile,
    memory:            submission.memory,
    memoryPercentile:  submission.memoryPercentile,
  });

  await github.upsertFile(
    path,
    JSON.stringify(history, null, 2),
    `📊 #${submission.id} 更新提交历史`
  );
}


// ── 第四部分：更新全局统计数据 ────────────────────────────────────────

async function updateProgress(github, submission) {
  const path = 'progress.json';

  // 读取现有数据
  let progress = {
    problems: {},
    stats: { total: 0, easy: 0, medium: 0, hard: 0 },
    lastUpdated: '',
  };

  try {
    const existing = await github.getFile(path);
    if (existing) {
      progress = JSON.parse(atob(existing.content));
    }
  } catch (_) {}

  // 判断是否是第一次解这道题
  const isNew = !progress.problems[submission.id];

  // 更新这道题的记录
  progress.problems[submission.id] = {
    id:         submission.id,
    slug:       submission.slug,
    title:      submission.title,
    difficulty: submission.difficulty,
    tags:       submission.tags,
    companies:  submission.companies,
    language:   submission.language,
    solvedAt:   submission.submittedAt,
    bestRuntime: submission.runtime,
    url:        submission.url,
  };

  // 如果是新题，更新统计数字
  if (isNew) {
    progress.stats.total += 1;
    const diff = submission.difficulty.toLowerCase();
    if (diff === 'easy')        progress.stats.easy   += 1;
    else if (diff === 'medium') progress.stats.medium += 1;
    else if (diff === 'hard')   progress.stats.hard   += 1;
  }

  progress.lastUpdated = new Date().toISOString();

  await github.upsertFile(
    path,
    JSON.stringify(progress, null, 2),
    `📈 更新刷题统计 (共 ${progress.stats.total} 题)`
  );
}


// ── 第五部分：生成题目 README ─────────────────────────────────────────

function buildProblemReadme(s) {
  const emoji = { easy: '🟢', medium: '🟡', hard: '🔴' };
  const diff  = s.difficulty?.toLowerCase() ?? 'unknown';

  return `# ${s.id}. ${s.title}

${emoji[diff] ?? '⚪'} **${s.difficulty}** · [在 LeetCode 查看](${s.url})

## 标签
${s.tags.length ? s.tags.map(t => `\`${t}\``).join(' ') : '_暂无_'}

## 出现公司
${s.companies.length ? s.companies.map(c => `\`${c}\``).join(' ') : '_暂无_'}

## 解题思路

> 在这里写下你的思路（插件自动创建，请手动补充）

- **时间复杂度**：O(?)
- **空间复杂度**：O(?)

## 最佳提交

| 项目 | 数据 |
|------|------|
| 语言 | ${s.language} |
| 运行时间 | ${s.runtime}${s.runtimePercentile ? ` (超过 ${s.runtimePercentile.toFixed(1)}%)` : ''} |
| 内存占用 | ${s.memory}${s.memoryPercentile ? ` (超过 ${s.memoryPercentile.toFixed(1)}%)` : ''} |
| 提交时间 | ${s.submittedAt.slice(0, 10)} |
`;
}


// ── 第六部分：GitHub API 客户端 ───────────────────────────────────────

class GitHubClient {
  constructor(token, repo, branch = 'main') {
    this.token  = token;
    this.repo   = repo;
    this.branch = branch;
    this.base   = 'https://api.github.com';
  }

  // 通用请求方法
  async request(method, path, body) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        'Authorization':        `Bearer ${this.token}`,
        'Content-Type':         'application/json',
        'Accept':               'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // 404 表示文件不存在，不算错误
    if (res.status === 404) return null;

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`GitHub API 错误 ${res.status}: ${err.message ?? res.statusText}`);
    }

    return res.json();
  }

  // 读取文件
  async getFile(path) {
    return this.request('GET', `/repos/${this.repo}/contents/${path}?ref=${this.branch}`);
  }

  // 创建或更新文件（自动判断是新建还是修改）
  async upsertFile(path, content, message) {
    const existing = await this.getFile(path);

    // 将内容转为 base64（GitHub API 要求）
    const encoded = btoa(unescape(encodeURIComponent(content)));

    return this.request('PUT', `/repos/${this.repo}/contents/${path}`, {
      message,
      content: encoded,
      branch:  this.branch,
      // 如果文件已存在，必须提供 sha 才能更新
      ...(existing ? { sha: existing.sha } : {}),
    });
  }
}


// ── 工具函数 ──────────────────────────────────────────────────────────

// 读取用户配置
function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['token', 'repo', 'branch'], resolve);
  });
}

// 发送系统通知
function showNotification(title, message) {
  chrome.notifications.create({
    type:    'basic',
    iconUrl: '../icons/icon48.png',
    title,
    message,
  });
}

// 保存最近提交到本地（供 popup 展示）
async function saveRecentLocally(submission) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['recentSubmissions', 'stats'], (data) => {
      // 更新最近记录
      const recent = data.recentSubmissions ?? [];
      recent.unshift(submission);
      const trimmed = recent.slice(0, 20); // 最多保留20条

      // 更新本地统计
      const stats = data.stats ?? { total: 0, easy: 0, medium: 0, hard: 0 };
      const alreadySaved = recent.slice(1).some(r => r.id === submission.id);
      if (!alreadySaved) {
        stats.total += 1;
        const diff = submission.difficulty?.toLowerCase();
        if (diff === 'easy')        stats.easy   += 1;
        else if (diff === 'medium') stats.medium += 1;
        else if (diff === 'hard')   stats.hard   += 1;
      }

      chrome.storage.local.set(
        { recentSubmissions: trimmed, stats },
        resolve
      );
    });
  });
}