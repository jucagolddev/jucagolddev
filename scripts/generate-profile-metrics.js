/**
 * Real-time GitHub Engineering Telemetry SVG Generator (Dual-Theme)
 * Uses GitHub GraphQL v4 when GITHUB_TOKEN is available (GitHub Actions),
 * with an authentic REST + local Actions artifact fallback for tokenless runs.
 * Zero external npm dependencies (Node.js 20+).
 */

const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GITHUB_USERNAME || 'jucagolddev';
const TOKEN = process.env.GITHUB_TOKEN || '';

const LANGUAGE_COLORS = {
  TypeScript: '#3178C6',
  JavaScript: '#F1E05A',
  SCSS: '#C6538C',
  CSS: '#563D7C',
  HTML: '#E34C26',
  Java: '#B07219',
  PHP: '#4F5D95',
  'C#': '#178600',
  Python: '#3572A5',
  PLpgSQL: '#336790',
  Shell: '#89E051',
  Other: '#8B949E',
};

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(Number(n) || 0));
}

function formatCetDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute} CET`;
}

async function fetchJson(url, options = {}) {
  const headers = {
    'User-Agent': `${USERNAME}-profile-telemetry`,
    Accept: 'application/vnd.github+json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function collectViaGraphQL() {
  if (!TOKEN) return null;

  const query = `
    query($login: String!) {
      user(login: $login) {
        followers { totalCount }
        allPublicRepos: repositories(ownerAffiliations: OWNER, privacy: PUBLIC) {
          totalCount
        }
        originalRepos: repositories(
          first: 100
          ownerAffiliations: OWNER
          isFork: false
          privacy: PUBLIC
          orderBy: { field: PUSHED_AT, direction: DESC }
        ) {
          totalCount
          nodes {
            name
            stargazerCount
            forkCount
            languages(first: 8, orderBy: { field: SIZE, direction: DESC }) {
              edges {
                size
                node { name color }
              }
            }
          }
        }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetchJson('https://api.github.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });

  const user = res?.data?.user;
  if (!user) return null;

  const nodes = user.originalRepos?.nodes || [];
  let totalStars = 0;
  let totalForks = 0;
  const langBytes = new Map();

  for (const repo of nodes) {
    totalStars += repo.stargazerCount || 0;
    totalForks += repo.forkCount || 0;
    for (const edge of repo.languages?.edges || []) {
      const name = edge?.node?.name;
      const size = edge?.size || 0;
      if (!name || size <= 0) continue;
      if (!LANGUAGE_COLORS[name] && edge.node.color) {
        LANGUAGE_COLORS[name] = edge.node.color;
      }
      langBytes.set(name, (langBytes.get(name) || 0) + size);
    }
  }

  const cal = user.contributionsCollection?.contributionCalendar;
  const allWeeks = cal?.weeks || [];
  const last12 = allWeeks.slice(-12);
  let activeDays12w = 0;
  const weeklyVelocity = last12.map((week) => {
    let sum = 0;
    for (const day of week.contributionDays || []) {
      const c = day.contributionCount || 0;
      sum += c;
      if (c > 0) activeDays12w += 1;
    }
    return sum;
  });

  while (weeklyVelocity.length < 12) weeklyVelocity.unshift(0);
  const peakWeek = Math.max(...weeklyVelocity, 0);

  return {
    source: 'GraphQL v4',
    totalContributions: cal?.totalContributions ?? 0,
    commitsCount: user.contributionsCollection?.totalCommitContributions ?? 0,
    prsCount: user.contributionsCollection?.totalPullRequestContributions ?? 0,
    originalRepoCount: user.originalRepos?.totalCount ?? nodes.length,
    totalPublicRepoCount: user.allPublicRepos?.totalCount ?? nodes.length,
    totalStars,
    totalForks,
    followers: user.followers?.totalCount ?? 0,
    weeklyVelocity,
    peakWeek,
    activeDays12w,
    hasActiveDaysMetric: true,
    languages: aggregateLanguages(langBytes),
  };
}

function read3dContributionCount() {
  const candidates = [
    path.join(__dirname, '..', 'profile-3d-contrib', 'profile-night-view.svg'),
    path.join(__dirname, '..', 'profile-3d-contrib', 'profile-night-rainbow.svg'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const svg = fs.readFileSync(file, 'utf8');
    const match = svg.match(/>(\d+)<\/text>\s*<text[^>]*>contributions<\/text>/);
    if (match) return Number(match[1]);
  }
  return 0;
}

async function collectViaRestFallback() {
  const [user, repos, events] = await Promise.all([
    fetchJson(`https://api.github.com/users/${USERNAME}`),
    fetchJson(`https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=pushed`),
    fetchJson(`https://api.github.com/users/${USERNAME}/events/public?per_page=100`),
  ]);

  const repoList = Array.isArray(repos) ? repos : [];
  const originalRepos = repoList.filter((r) => !r.fork);

  let totalStars = 0;
  let totalForks = 0;
  for (const r of originalRepos) {
    totalStars += r.stargazers_count || 0;
    totalForks += r.forks_count || 0;
  }

  // Real language bytes from top 12 largest non-fork repos
  const langBytes = new Map();
  const topBySize = [...originalRepos].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 12);
  let langRequestsOk = 0;

  const langResponses = await Promise.all(
    topBySize.map((r) => fetchJson(`https://api.github.com/repos/${USERNAME}/${r.name}/languages`))
  );

  for (const mapObj of langResponses) {
    if (mapObj && typeof mapObj === 'object' && !mapObj.message) {
      langRequestsOk += 1;
      for (const [lang, bytes] of Object.entries(mapObj)) {
        if (typeof bytes === 'number' && bytes > 0) {
          langBytes.set(lang, (langBytes.get(lang) || 0) + bytes);
        }
      }
    }
  }

  // Fallback to repo.size grouped by primary repo.language if language API rate-limited
  if (langRequestsOk === 0) {
    for (const r of originalRepos) {
      if (r.language && r.size > 0) {
        langBytes.set(r.language, (langBytes.get(r.language) || 0) + r.size * 1024);
      }
    }
  }

  // Build real 12-week velocity bins from public events + repository push timestamps
  const nowMs = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weeklyVelocity = new Array(12).fill(0);
  const activeDaysSet = new Set();

  if (Array.isArray(events)) {
    for (const ev of events) {
      if (!ev?.created_at) continue;
      const evMs = Date.parse(ev.created_at);
      const ageWeeks = Math.floor((nowMs - evMs) / weekMs);
      if (ageWeeks >= 0 && ageWeeks < 12) {
        const idx = 11 - ageWeeks;
        const weight = ev.type === 'PushEvent' ? Math.max(1, ev.payload?.size || 1) : 1;
        weeklyVelocity[idx] += weight;
        activeDaysSet.add(ev.created_at.slice(0, 10));
      }
    }
  }

  for (const r of originalRepos) {
    if (!r?.pushed_at) continue;
    const pMs = Date.parse(r.pushed_at);
    const ageWeeks = Math.floor((nowMs - pMs) / weekMs);
    if (ageWeeks >= 0 && ageWeeks < 12) {
      const idx = 11 - ageWeeks;
      if (weeklyVelocity[idx] === 0) weeklyVelocity[idx] += 1;
      activeDaysSet.add(r.pushed_at.slice(0, 10));
    }
  }

  const peakWeek = Math.max(...weeklyVelocity, 0);

  return {
    source: 'REST + Actions sync',
    totalContributions: read3dContributionCount(),
    commitsCount: null,
    prsCount: null,
    originalRepoCount: originalRepos.length,
    totalPublicRepoCount: user?.public_repos ?? repoList.length,
    totalStars,
    totalForks,
    followers: user?.followers ?? 0,
    weeklyVelocity,
    peakWeek,
    activeDays12w: activeDaysSet.size,
    hasActiveDaysMetric: false,
    languages: aggregateLanguages(langBytes),
  };
}

function aggregateLanguages(langBytes) {
  const entries = [...langBytes.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  if (total <= 0) {
    return [{ name: 'TypeScript', pct: 100, color: LANGUAGE_COLORS.TypeScript }];
  }

  const top = entries.slice(0, 5);
  const restBytes = entries.slice(5).reduce((acc, [, v]) => acc + v, 0);
  const result = top.map(([name, bytes]) => ({
    name,
    pct: (bytes / total) * 100,
    color: LANGUAGE_COLORS[name] || LANGUAGE_COLORS.Other,
  }));

  const restPct = (restBytes / total) * 100;
  if (restPct > 0.5) {
    result.push({ name: 'Other', pct: restPct, color: LANGUAGE_COLORS.Other });
  }

  return result;
}

function renderTelemetrySvg(metrics, themeMode) {
  const isDark = themeMode === 'dark';
  const c = isDark
    ? {
        bgStart: '#0F141E',
        bgEnd: '#141B29',
        cardFill: '#111824',
        border: '#263042',
        divider: '#222C3C',
        textPrimary: '#F0F6FC',
        textSecondary: '#94A3B8',
        textMuted: '#8B949E',
        accent: '#38BDF8',
        accentSecondary: '#818CF8',
        gold: '#F59E0B',
        live: '#22C55E',
        track: '#1E293B',
        gridLine: '#263042',
      }
    : {
        bgStart: '#FAFBFC',
        bgEnd: '#F1F5F9',
        cardFill: '#FFFFFF',
        border: '#D0D7DE',
        divider: '#E2E8F0',
        textPrimary: '#0F172A',
        textSecondary: '#475569',
        textMuted: '#64748B',
        accent: '#0284C7',
        accentSecondary: '#4F46E5',
        gold: '#D97706',
        live: '#16A34A',
        track: '#E2E8F0',
        gridLine: '#CBD5E1',
      };

  const formattedDate = formatCetDate();
  const langs = metrics.languages;
  const totalPct = langs.reduce((sum, l) => sum + l.pct, 0) || 100;

  // Language segmented bar (width = 392)
  const barWidth = 392;
  let currentX = 0;
  const barSegments = langs
    .map((lang, idx) => {
      const segW = idx === langs.length - 1 ? barWidth - currentX : (lang.pct / totalPct) * barWidth;
      const rect = `<rect x="${currentX.toFixed(2)}" y="0" width="${Math.max(segW, 1.5).toFixed(2)}" height="8" fill="${escapeXml(lang.color)}" />`;
      currentX += segW;
      return rect;
    })
    .join('\n          ');

  // Language legend: 2 rows x 3 columns (x = 16, 152, 288)
  const colXs = [16, 152, 288];
  const legendItems = langs
    .slice(0, 6)
    .map((lang, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const lx = colXs[col];
      const ly = row === 0 ? 52 : 70;
      const label = lang.name.length > 11 ? `${lang.name.slice(0, 10)}.` : lang.name;
      return `<g transform="translate(${lx}, ${ly})">
        <circle cx="4" cy="-3.5" r="3.5" fill="${escapeXml(lang.color)}" />
        <text x="13" y="0" fill="${c.textPrimary}" class="sans" font-size="10.5" font-weight="600">${escapeXml(label)}</text>
        <text x="116" y="0" text-anchor="end" fill="${c.textMuted}" class="mono" font-size="10">${lang.pct.toFixed(1)}%</text>
      </g>`;
    })
    .join('\n      ');

  // 12-week velocity area + polyline chart (inner plot: x=16..408, y=34..66)
  const series = metrics.weeklyVelocity;
  const maxVal = Math.max(...series, 1);
  const plotLeft = 16;
  const plotRight = 408;
  const plotTop = 35;
  const plotBottom = 66;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  const coords = series.map((val, i) => {
    const px = plotLeft + (i / 11) * plotW;
    const py = plotBottom - (val / maxVal) * plotH;
    return { x: Number(px.toFixed(1)), y: Number(py.toFixed(1)), val };
  });

  const linePath = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${plotRight} ${plotBottom} L ${plotLeft} ${plotBottom} Z`;

  let peakIdx = 0;
  for (let i = 1; i < coords.length; i++) {
    if (coords[i].val >= coords[peakIdx].val) peakIdx = i;
  }
  const peakPoint = coords[peakIdx];

  const dotsSvg = coords
    .map((p, i) => {
      if (i === peakIdx) {
        return `<circle cx="${p.x}" cy="${p.y}" r="6.5" fill="${c.accent}" opacity="0.22" />
        <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${c.accent}" stroke="${c.cardFill}" stroke-width="1.5" />`;
      }
      return `<circle cx="${p.x}" cy="${p.y}" r="2" fill="${c.accentSecondary}" opacity="0.75" />`;
    })
    .join('\n        ');

  const total12w = metrics.weeklyVelocity.reduce((acc, v) => acc + v, 0);
  const kpi4Sub = `${formatNumber(total12w)} contribs (last 12w)`;

  let kpi1Sub = 'Public commits & reviews';
  if (metrics.commitsCount !== null && metrics.prsCount !== null) {
    kpi1Sub =
      metrics.prsCount > 0
        ? `${formatNumber(metrics.commitsCount)} commits · ${formatNumber(metrics.prsCount)} PRs`
        : `${formatNumber(metrics.commitsCount)} public commits (12m)`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 252" width="900" height="252">
  <defs>
    <linearGradient id="telemBg_${themeMode}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c.bgStart}" />
      <stop offset="100%" stop-color="${c.bgEnd}" />
    </linearGradient>

    <linearGradient id="areaGrad_${themeMode}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.28" />
      <stop offset="100%" stop-color="${c.accent}" stop-opacity="0.01" />
    </linearGradient>

    <clipPath id="langBarClip_${themeMode}">
      <rect x="0" y="0" width="${barWidth}" height="8" rx="4" />
    </clipPath>
  </defs>

  <style>
    .sans {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Helvetica, Arial, sans-serif;
    }
    .mono {
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, ui-monospace, monospace;
    }
    .pulse {
      animation: pulseLive_${themeMode} 2.4s ease-in-out infinite;
    }
    @keyframes pulseLive_${themeMode} {
      0%, 100% { opacity: 0.45; }
      50% { opacity: 1; }
    }
  </style>

  <!-- Outer Frame -->
  <rect x="1" y="1" width="898" height="250" rx="14" fill="url(#telemBg_${themeMode})" stroke="${c.border}" stroke-width="1" />

  <!-- Top Telemetry Header Bar -->
  <circle cx="30" cy="27" r="3.5" fill="${c.live}" class="pulse" />
  <text x="42" y="31" fill="${c.textPrimary}" class="mono" font-size="11" font-weight="700" letter-spacing="0.8">LIVE ENGINEERING TELEMETRY <tspan fill="${c.textMuted}" font-weight="500" letter-spacing="0">· @${escapeXml(USERNAME)}</tspan></text>
  <text x="876" y="31" text-anchor="end" fill="${c.textMuted}" class="mono" font-size="10.5">Synced ${escapeXml(formattedDate)} · GitHub Actions</text>

  <line x1="24" y1="45" x2="876" y2="45" stroke="${c.divider}" stroke-width="1" />

  <!-- LEFT COLUMN: 2x2 KPI GRID (x=24..432, each card 198x82, gap 12) -->
  <!-- KPI 1: Contributions (12m) -->
  <g transform="translate(24, 60)">
    <rect x="0" y="0" width="198" height="82" rx="10" fill="${c.cardFill}" stroke="${c.border}" stroke-width="1" />
    <g transform="translate(14, 15)" fill="${c.accent}">
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z" transform="scale(0.82)" />
    </g>
    <text x="32" y="25" fill="${c.textSecondary}" class="sans" font-size="11" font-weight="600">Contributions (12m)</text>
    <text x="14" y="55" fill="${c.textPrimary}" class="sans" font-size="23" font-weight="800">${escapeXml(formatNumber(metrics.totalContributions))}</text>
    <text x="14" y="71" fill="${c.textMuted}" class="mono" font-size="10">${escapeXml(kpi1Sub)}</text>
  </g>

  <!-- KPI 2: Original Repos -->
  <g transform="translate(234, 60)">
    <rect x="0" y="0" width="198" height="82" rx="10" fill="${c.cardFill}" stroke="${c.border}" stroke-width="1" />
    <g transform="translate(14, 15)" fill="${c.accentSecondary}">
      <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z" transform="scale(0.82)" />
    </g>
    <text x="32" y="25" fill="${c.textSecondary}" class="sans" font-size="11" font-weight="600">Original Repos</text>
    <text x="14" y="55" fill="${c.textPrimary}" class="sans" font-size="23" font-weight="800">${escapeXml(formatNumber(metrics.originalRepoCount))}</text>
    <text x="14" y="71" fill="${c.textMuted}" class="mono" font-size="10">of ${escapeXml(formatNumber(metrics.totalPublicRepoCount))} public repos</text>
  </g>

  <!-- KPI 3: Community -->
  <g transform="translate(24, 154)">
    <rect x="0" y="0" width="198" height="82" rx="10" fill="${c.cardFill}" stroke="${c.border}" stroke-width="1" />
    <g transform="translate(14, 15)" fill="${c.gold}">
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" transform="scale(0.82)" />
    </g>
    <text x="32" y="25" fill="${c.textSecondary}" class="sans" font-size="11" font-weight="600">Community</text>
    <text x="14" y="55" fill="${c.textPrimary}" class="sans" font-size="21" font-weight="800">${escapeXml(formatNumber(metrics.totalStars))} ★ · ${escapeXml(formatNumber(metrics.totalForks))} forks</text>
    <text x="14" y="71" fill="${c.textMuted}" class="mono" font-size="10">${escapeXml(formatNumber(metrics.followers))} followers</text>
  </g>

  <!-- KPI 4: 12-Week Velocity -->
  <g transform="translate(234, 154)">
    <rect x="0" y="0" width="198" height="82" rx="10" fill="${c.cardFill}" stroke="${c.border}" stroke-width="1" />
    <g transform="translate(14, 15)" fill="${c.live}">
      <path d="M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-7.34 7.142a1.249 1.249 0 0 1-.871.354h-.302a1.25 1.25 0 0 1-1.157-1.723L5.633 10.5H3.462c-1.57 0-2.346-1.909-1.22-3.004Z" transform="scale(0.82)" />
    </g>
    <text x="32" y="25" fill="${c.textSecondary}" class="sans" font-size="11" font-weight="600">12-Week Velocity</text>
    <text x="14" y="55" fill="${c.textPrimary}" class="sans" font-size="21" font-weight="800">${escapeXml(formatNumber(metrics.peakWeek))} / wk peak</text>
    <text x="14" y="71" fill="${c.textMuted}" class="mono" font-size="10">${escapeXml(kpi4Sub)}</text>
  </g>

  <!-- RIGHT COLUMN: STACKED ANALYTICS PANELS (x=452..876, width 424) -->
  <!-- TOP PANEL: CODEBASE LANGUAGES -->
  <g transform="translate(452, 60)">
    <rect x="0" y="0" width="424" height="86" rx="10" fill="${c.cardFill}" stroke="${c.border}" stroke-width="1" />
    <text x="16" y="20" fill="${c.textSecondary}" class="mono" font-size="10.5" font-weight="700" letter-spacing="0.6">CODEBASE LANGUAGES (NON-FORK BYTES)</text>

    <!-- Segmented Language Bar -->
    <g transform="translate(16, 29)" clip-path="url(#langBarClip_${themeMode})">
      <rect x="0" y="0" width="${barWidth}" height="8" fill="${c.track}" />
      ${barSegments}
    </g>

    <!-- Legend (2 rows x 3 cols) -->
    ${legendItems}
  </g>

  <!-- BOTTOM PANEL: 12-WEEK CONTRIBUTION VELOCITY -->
  <g transform="translate(452, 158)">
    <rect x="0" y="0" width="424" height="78" rx="10" fill="${c.cardFill}" stroke="${c.border}" stroke-width="1" />
    <text x="16" y="19" fill="${c.textSecondary}" class="mono" font-size="10.5" font-weight="700" letter-spacing="0.6">12-WEEK CONTRIBUTION VELOCITY</text>
    <text x="408" y="19" text-anchor="end" fill="${c.textMuted}" class="mono" font-size="10">Peak: ${escapeXml(formatNumber(metrics.peakWeek))} · Last 12w</text>

    <!-- Subtle Horizontal Guide Lines -->
    <line x1="${plotLeft}" y1="35" x2="${plotRight}" y2="35" stroke="${c.gridLine}" stroke-width="0.7" stroke-dasharray="2,3" opacity="0.65" />
    <line x1="${plotLeft}" y1="50" x2="${plotRight}" y2="50" stroke="${c.gridLine}" stroke-width="0.7" stroke-dasharray="2,3" opacity="0.65" />
    <line x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="${c.gridLine}" stroke-width="0.8" opacity="0.8" />

    <!-- Area + Polyline -->
    <path d="${areaPath}" fill="url(#areaGrad_${themeMode})" />
    <path d="${linePath}" fill="none" stroke="${c.accent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />

    <!-- Data Nodes -->
    ${dotsSvg}
  </g>
</svg>
`;
}

async function main() {
  console.log(`[telemetry] Collecting metrics for @${USERNAME}...`);
  let metrics = await collectViaGraphQL();

  if (!metrics) {
    console.log('[telemetry] Using REST + Actions artifact fallback...');
    metrics = await collectViaRestFallback();
  }

  console.log(`[telemetry] Source: ${metrics.source} | Contribs: ${metrics.totalContributions} | Repos: ${metrics.originalRepoCount}/${metrics.totalPublicRepoCount} | Stars: ${metrics.totalStars}`);

  const assetsDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  fs.writeFileSync(path.join(assetsDir, 'telemetry-dark.svg'), renderTelemetrySvg(metrics, 'dark'), 'utf8');
  fs.writeFileSync(path.join(assetsDir, 'telemetry-light.svg'), renderTelemetrySvg(metrics, 'light'), 'utf8');

  console.log('[telemetry] Generated assets/telemetry-dark.svg and assets/telemetry-light.svg');
}

main().catch((err) => {
  console.error('[telemetry] Fatal error:', err);
  process.exit(1);
});
