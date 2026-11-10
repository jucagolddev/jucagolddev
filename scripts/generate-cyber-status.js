/**
 * Generator de Telemetría Dinámica Cyberpunk en Node.js (v3.0 HUD Edition)
 * Corre en GitHub Actions y localmente de forma 100% gratuita y sin dependencias externas.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function fetchJson(url) {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'jucagolddev-telemetry-bot'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Genera una forma de onda de osciloscopio relativa al pod (startX = 12, baseY = 40, width = 185)
function generateWaveform() {
  let points = [];
  const startX = 12;
  const baseY = 40;
  const width = 186;
  const steps = 30;

  for (let i = 0; i <= steps; i++) {
    const x = startX + (i / steps) * width;
    let y = baseY;
    if (i > 7 && i < 23) {
      const phase = (i - 7) / 16;
      y += Math.sin(phase * Math.PI * 3.5) * 16 * (Math.random() * 0.35 + 0.85);
    } else {
      y += (Math.random() - 0.5) * 3;
    }
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(' ');
}

async function run() {
  console.log('[+] Obteniendo telemetría de GitHub...');
  const user = await fetchJson('https://api.github.com/users/jucagolddev') || {
    public_repos: 44,
    followers: 2
  };

  const repos = await fetchJson('https://api.github.com/users/jucagolddev/repos?per_page=100') || [];
  let stars = 0;
  let forks = 0;
  if (Array.isArray(repos)) {
    repos.forEach(r => {
      stars += r.stargazers_count || 0;
      forks += r.forks_count || 0;
    });
  }

  // Fecha y hora formateada en Madrid (CET)
  const now = new Date();
  const options = { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  const formattedDate = new Intl.DateTimeFormat('es-ES', options).format(now);

  const waveformPath = generateWaveform();

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 148" width="100%" height="148">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#04050a" />
      <stop offset="50%" stop-color="#090a18" />
      <stop offset="100%" stop-color="#0e1024" />
    </linearGradient>

    <!-- Glowing Cyber Border Gradient -->
    <linearGradient id="cardBorderGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.8" />
      <stop offset="35%" stop-color="#7928ca" stop-opacity="0.6" />
      <stop offset="70%" stop-color="#ff0055" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#fcee0a" stop-opacity="0.8" />
    </linearGradient>

    <!-- Pod Inner Gradient -->
    <linearGradient id="podBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#11142c" stop-opacity="0.85" />
      <stop offset="100%" stop-color="#060714" stop-opacity="0.95" />
    </linearGradient>

    <!-- Neon Glow Filter -->
    <filter id="neonGlowCard" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <!-- Caution Diagonal Stripes -->
    <pattern id="diagCaution" width="12" height="12" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="12" stroke="#fcee0a" stroke-width="3" stroke-opacity="0.8" />
      <line x1="6" y1="0" x2="6" y2="12" stroke="#05050b" stroke-width="3" stroke-opacity="0.8" />
    </pattern>

    <!-- Technical Grid Pattern -->
    <pattern id="cardGrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#00f0ff" stroke-width="0.5" stroke-opacity="0.07" />
    </pattern>
  </defs>

  <style>
    .mono-bold {
      font-family: 'Cascadia Code', 'Consolas', 'JetBrains Mono', 'Fira Code', monospace;
      font-weight: 700;
      letter-spacing: 1.5px;
    }
    .mono-regular {
      font-family: 'Cascadia Code', 'Consolas', 'JetBrains Mono', 'Fira Code', monospace;
      font-weight: 500;
      letter-spacing: 1px;
    }
    .val-accent {
      font-family: 'Century Gothic', 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif;
      font-weight: 900;
      font-size: 22px;
      letter-spacing: 2px;
    }
    .pulse-dot {
      animation: pulseTelemDot 1.8s infinite ease-in-out;
    }
    @keyframes pulseTelemDot {
      0% { opacity: 0.3; }
      50% { opacity: 1; }
      100% { opacity: 0.3; }
    }
  </style>

  <!-- Container Box with Chamfered Corners -->
  <polygon points="22,6 878,6 894,22 894,126 878,142 22,142 6,126 6,22" fill="url(#cardBg)" stroke="url(#cardBorderGrad)" stroke-width="1.3" />
  
  <!-- Subtle Grid Overlay -->
  <polygon points="22,6 878,6 894,22 894,126 878,142 22,142 6,126 6,22" fill="url(#cardGrid)" />

  <!-- Left Caution Stripe Accent -->
  <polygon points="6,22 6,50 14,42 14,22" fill="url(#diagCaution)" />

  <!-- Top HUD Header Bar -->
  <g transform="translate(24, 28)">
    <!-- Yellow Status Pill -->
    <polygon points="0,-12 186,-12 198,10 0,10" fill="#fcee0a" />
    <circle cx="14" cy="-1" r="3.5" fill="#05050b" />
    <text x="24" y="3" fill="#05050b" class="mono-bold" font-size="11">LIVE_TELEMETRY // V3.0</text>

    <!-- Center Status Indicator -->
    <text x="216" y="2" fill="#00f0ff" class="mono-bold" font-size="11">
      NETRUNNER_STATUS: <tspan fill="#ff0055">DEEP_FOCUS [ANGULAR SIGNALS]</tspan>
    </text>

    <!-- Right Live Ping -->
    <circle cx="838" cy="-1" r="4" fill="#00ff66" class="pulse-dot" />
    <text x="828" y="2" text-anchor="end" fill="#00ff66" class="mono-bold" font-size="10">PULSE: NOMINAL</text>
  </g>

  <!-- Metric Pod 1: Repos -->
  <g transform="translate(24, 60)">
    <rect x="0" y="0" width="140" height="66" rx="4" fill="url(#podBg)" stroke="#00f0ff" stroke-width="0.8" stroke-opacity="0.4" />
    <text x="12" y="20" fill="#94a3b8" class="mono-regular" font-size="9.5">REPOSITORIOS</text>
    <text x="12" y="48" fill="#00f0ff" class="val-accent">${user.public_repos || 44}</text>
    <text x="56" y="46" fill="#475569" class="mono-regular" font-size="9.5">// REPOS</text>
  </g>

  <!-- Metric Pod 2: Stars -->
  <g transform="translate(176, 60)">
    <rect x="0" y="0" width="140" height="66" rx="4" fill="url(#podBg)" stroke="#fcee0a" stroke-width="0.8" stroke-opacity="0.4" />
    <text x="12" y="20" fill="#94a3b8" class="mono-regular" font-size="9.5">ESTRELLAS GITHUB</text>
    <text x="12" y="48" fill="#fcee0a" class="val-accent">${stars}</text>
    <text x="46" y="46" fill="#475569" class="mono-regular" font-size="9.5">// STARS</text>
  </g>

  <!-- Metric Pod 3: Followers -->
  <g transform="translate(328, 60)">
    <rect x="0" y="0" width="140" height="66" rx="4" fill="url(#podBg)" stroke="#ff0055" stroke-width="0.8" stroke-opacity="0.4" />
    <text x="12" y="20" fill="#94a3b8" class="mono-regular" font-size="9.5">NETWORK PEERS</text>
    <text x="12" y="48" fill="#ff0055" class="val-accent">${user.followers || 2}</text>
    <text x="46" y="46" fill="#475569" class="mono-regular" font-size="9.5">// PEERS</text>
  </g>

  <!-- Metric Pod 4: Location & Runtime -->
  <g transform="translate(480, 60)">
    <rect x="0" y="0" width="168" height="66" rx="4" fill="url(#podBg)" stroke="#00f0ff" stroke-width="0.8" stroke-opacity="0.3" />
    <text x="12" y="19" fill="#94a3b8" class="mono-regular" font-size="9.5">RUNTIME &amp; LOCALIZACIÓN</text>
    <text x="12" y="38" fill="#e2e8f0" class="mono-bold" font-size="11">NODE.JS // SEVILLA.ES</text>
    <text x="12" y="54" fill="#64748b" class="mono-regular" font-size="9">PING: ${formattedDate} CET</text>
  </g>

  <!-- Realtime Oscilloscope Pod -->
  <g transform="translate(660, 60)">
    <rect x="0" y="0" width="210" height="66" rx="4" fill="url(#podBg)" stroke="#00f0ff" stroke-width="0.8" stroke-opacity="0.4" />
    <text x="12" y="18" fill="#475569" class="mono-regular" font-size="9">// OSCILLOSCOPE_STREAM</text>
    <path d="${waveformPath}" fill="none" stroke="#00f0ff" stroke-width="1.8" filter="url(#neonGlowCard)" />
  </g>

  <!-- Sci-Fi Corner Accents -->
  <g stroke="#ff0055" stroke-width="1.5" fill="none">
    <path d="M 10 38 L 10 18 L 30 18" />
    <path d="M 890 110 L 890 130 L 870 130" />
  </g>
</svg>`;

  const outputPath = path.join(__dirname, '..', 'assets', 'cyber-status.svg');
  fs.writeFileSync(outputPath, svgContent, 'utf8');
  console.log(`[✔] SVG generado con éxito en: ${outputPath}`);
}

run();
