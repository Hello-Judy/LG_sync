/**
 * content.js
 * 自动注入到 leetcode.com/problems/* 页面
 * 职责：监听提交结果，抓取题目信息和代码，发送给 background.js
 */

(function () {
  'use strict';

  // ── 第一部分：拦截网络请求，捕获提交结果 ──────────────────────────
  //
  // LeetCode 提交代码时，浏览器会发送一个 fetch 请求到它的服务器
  // 我们把 window.fetch 替换成自己的版本
  // 这样每次 LeetCode 发请求，我们都能"偷看"结果

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    // 先让原始请求正常执行
    const response = await originalFetch.apply(this, args);

    // 获取请求的 URL
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '');

    // 判断是否是"查询提交结果"的请求
    // LeetCode 提交后会轮询这个接口检查结果
    if (url.includes('/submissions/detail/') && url.includes('/check/')) {
      const clone = response.clone(); // 复制一份，不影响原始响应
      clone.json().then((data) => {
        // state === 'SUCCESS' 表示判题完成（不一定通过）
        if (data.state === 'SUCCESS') {
          handleSubmissionResult(data);
        }
      }).catch(() => {});
    }

    return response; // 返回原始响应，LeetCode 正常运行
  };


  // ── 第二部分：处理提交结果 ──────────────────────────────────────────

  function handleSubmissionResult(result) {
    // 只同步"通过"的提交，其他状态（超时、错误答案）忽略
    if (result.status_msg !== 'Accepted') {
      console.log('[LG Sync] 提交未通过，跳过同步:', result.status_msg);
      return;
    }

    console.log('[LG Sync] 检测到 Accepted！开始抓取数据...');

    // 收集所有需要的数据
    const payload = {
      // 题目基本信息
      ...scrapeProblemMeta(),
      // 提交的代码
      ...scrapeCodeAndLanguage(),
      // 成绩数据（从提交结果里拿）
      runtime:           result.status_runtime    ?? 'N/A',
      runtimePercentile: result.runtime_percentile ?? null,
      memory:            result.status_memory      ?? 'N/A',
      memoryPercentile:  result.memory_percentile  ?? null,
      // 提交时间
      submittedAt: new Date().toISOString(),
    };

    console.log('[LG Sync] 抓取到的数据:', payload);

    // 发送给 background.js 去处理 GitHub 同步
    chrome.runtime.sendMessage({ type: 'SUBMISSION_ACCEPTED', payload });

    // 在页面右下角显示提示
    showToast(`⚡ 同步中：#${payload.id} ${payload.title}`);
  }


  // ── 第三部分：抓取题目信息 ──────────────────────────────────────────

  function scrapeProblemMeta() {
    // 从 URL 获取题目 slug
    // 例如 leetcode.com/problems/two-sum/ → slug = 'two-sum'
    const slugMatch = window.location.pathname.match(/\/problems\/([^/]+)/);
    const slug = slugMatch?.[1] ?? 'unknown';

    // 从页面标题获取题目名和编号
    // 页面 title 格式通常是 "1. Two Sum - LeetCode"
    const pageTitle  = document.title ?? '';
    const titleMatch = pageTitle.match(/^(\d+)\.\s*(.+?)\s*[-|]/);
    const id    = (titleMatch?.[1] ?? '0').padStart(4, '0');
    const title = titleMatch?.[2] ?? slug;

    // 获取难度
    // LeetCode 页面上有对应的颜色标签
    const diffEl =
      document.querySelector('[class*="text-difficulty-easy"]') ??
      document.querySelector('[class*="text-difficulty-medium"]') ??
      document.querySelector('[class*="text-difficulty-hard"]') ??
      document.querySelector('[diff]');
    const difficulty = diffEl?.textContent?.trim() ?? 'Unknown';

    // 获取算法标签（动态规划、双指针等）
    const tagEls = document.querySelectorAll('a[href*="/tag/"]');
    const tags = [...new Set(
      Array.from(tagEls).map(el => el.textContent.trim()).filter(Boolean)
    )];

    // 获取公司标签（Google、Meta 等）
    const companyEls = document.querySelectorAll('a[href*="/company/"]');
    const companies = [...new Set(
      Array.from(companyEls).map(el => el.textContent.trim()).filter(Boolean)
    )];

    return { id, slug, title, difficulty, tags, companies, url: window.location.href };
  }


  // ── 第四部分：抓取代码和编程语言 ───────────────────────────────────

  function scrapeProblemMeta() {
  const slugMatch = window.location.pathname
    .match(/\/problems\/([^/]+)/);
  const slug = slugMatch?.[1] ?? 'unknown';

  const pageTitle  = document.title ?? '';

  // leetcode.cn 标题格式是 "题目名称 - 力扣"
  // leetcode.com 标题格式是 "1. Two Sum - LeetCode"
  // 同时兼容两种格式
  const titleMatchEN = pageTitle.match(/^(\d+)\.\s*(.+?)\s*[-|]/);
  const titleMatchCN = pageTitle.match(/^(.+?)\s*[-|]/);

  const id    = (titleMatchEN?.[1] ?? '0').padStart(4, '0');
  const title = titleMatchEN?.[2] ?? titleMatchCN?.[1] ?? slug;

  // 难度标签（.cn 和 .com 选择器相同）
  const diffEl =
    document.querySelector('[class*="text-difficulty-easy"]')   ??
    document.querySelector('[class*="text-difficulty-medium"]') ??
    document.querySelector('[class*="text-difficulty-hard"]')   ??
    document.querySelector('[diff]');
  const difficulty = diffEl?.textContent?.trim() ?? 'Unknown';

  // 标签
  const tagEls = document.querySelectorAll('a[href*="/tag/"]');
  const tags = [...new Set(
    Array.from(tagEls)
      .map(el => el.textContent.trim())
      .filter(Boolean)
  )];

  // 公司
  const companyEls = document.querySelectorAll('a[href*="/company/"]');
  const companies = [...new Set(
    Array.from(companyEls)
      .map(el => el.textContent.trim())
      .filter(Boolean)
  )];

  return { id, slug, title, difficulty, tags, companies, url: window.location.href };
}

  // ── 第五部分：右下角提示 ────────────────────────────────────────────

  function showToast(message) {
    // 如果已有提示，先移除
    document.getElementById('lg-sync-toast')?.remove();

    const toast = document.createElement('div');
    toast.id = 'lg-sync-toast';
    toast.textContent = message;

    Object.assign(toast.style, {
      position:   'fixed',
      bottom:     '24px',
      right:      '24px',
      zIndex:     '99999',
      background: '#1a1a2e',
      color:      '#e6edf3',
      padding:    '12px 18px',
      borderRadius: '8px',
      fontSize:   '13px',
      fontFamily: 'monospace',
      border:     '1px solid #30363d',
      boxShadow:  '0 4px 20px rgba(0,0,0,0.5)',
      opacity:    '0',
      transition: 'opacity 0.3s ease',
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    // 4秒后自动消失
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  console.log('[LG Sync] content.js 已加载，监听提交中...');

})();