/**
 * Generator de Telemetría Dinámica Cyberpunk en Node.js
 * Corre en GitHub Actions de forma 100% gratuita y sin dependencias externas.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
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
    }).on('error', (err) => resolve(null));
  });
}

// Genera una forma de onda de osciloscopio aleatoria pero estética con JS
function generateWaveform() {
  let points = [];
  const startX = 660;
  const baseY = 80;
  const width = 200;
  const steps = 30;

  for (let i = 0; i <= steps; i++) {
    const x = startX + (i / steps) * width;
    let y = baseY;
    if (i > 8 && i < 22) {
      // Simula pulso cardíaco / señal de radar
      const phase = (i - 8) / 14;
      y += Math.sin(phase * Math.PI * 3) * 16 * (Math.random() * 0.4 + 0.8);
    } else {
      y += (Math.random() - 0.5) * 4;
    }
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(' ');
}

async function run() {
  console.log('[+] Obteniendo telemetría de GitHub...');
  const user = await fetchJson('https://api.github.com/users/jucagolddev') || {
    public_repos: 12,
    followers: 8
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

  // Fecha y hora actual formateada en Europa/Madrid (CET)
  const now = new Date();
  const options = { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  const formattedDate = new Intl.DateTimeFormat('es-ES', options).format(now);

  const waveformPath = generateWaveform();

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 140" width="100%" height="140">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#05050b" />
      <stop offset="50%" stop-color="#090a14" />
      <stop offset="100%" stop-color="#0e1020" />
    </linearGradient>

    <!-- Neon Glow Filter -->
    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
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

    <pattern id="cardGrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#00f0ff" stroke-width="0.5" stroke-opacity="0.08" />
    </pattern>
  </defs>

  <style>
    .mono-bold {
      font-family: 'Fira Code', 'Courier New', monospace;
      font-weight: 700;
      letter-spacing: 1.5px;
    }
    .mono-regular {
      font-family: 'Fira Code', 'Courier New', monospace;
      font-weight: 500;
      letter-spacing: 1px;
    }
    .val-accent {
      font-family: 'Orbitron', 'Rajdhani', 'Fira Code', monospace;
      font-weight: 900;
      font-size: 20px;
      letter-spacing: 2px;
    }
    .pulse-dot {
      animation: pulseDot 2s infinite ease-in-out;
    }
    @keyframes pulseDot {
      0% { opacity: 0.3; r: 3; }
      50% { opacity: 1; r: 4.5; }
      100% { opacity: 0.3; r: 3; }
    }
  </style>

  <!-- Container Box with Chamfered Corners -->
  <polygon points="20,4 880,4 896,20 896,120 880,136 20,136 4,120 4,20" fill="url(#cardBg)" stroke="#00f0ff" stroke-width="1.2" stroke-opacity="0.4" />
  
  <!-- Subtle Grid -->
  <polygon points="20,4 880,4 896,20 896,120 880,136 20,136 4,120 4,20" fill="url(#cardGrid)" />

  <!-- Left Caution Stripe Accent -->
  <polygon points="4,20 4,45 12,37 12,20" fill="url(#diagCaution)" />

  <!-- Top HUD Header Bar -->
  <g transform="translate(24, 26)">
    <!-- Yellow Status Pill -->
    <polygon points="0,-12 180,-12 192,10 0,10" fill="#fcee0a" />
    <circle cx="14" cy="-1" r="3.5" fill="#05050b" />
    <text x="24" y="3" fill="#05050b" class="mono-bold" font-size="11">LIVE_TELEMETRY // V2.4</text>

    <!-- Center Status Indicator -->
    <text x="210" y="2" fill="#00f0ff" class="mono-bold" font-size="11">
      NETRUNNER_STATUS: <tspan fill="#ff0055">DEEP_FOCUS [ANGULAR &amp; SIGNALS]</tspan>
    </text>

    <!-- Right Live Ping -->
    <circle cx="848" cy="-1" r="4" fill="#00ff66" class="pulse-dot" />
    <text x="838" y="2" text-anchor="end" fill="#00ff66" class="mono-bold" font-size="10">PULSE: ACTIVE</text>
  </g>

  <!-- Bottom Data Grid / Live Stats Metrics -->
  <g transform="translate(30, 80)">
    <!-- Metric 1: Public Repos -->
    <g transform="translate(0, 0)">
      <text x="0" y="0" fill="#94a3b8" class="mono-regular" font-size="10">REPOSITORIOS</text>
      <text x="0" y="25" fill="#00f0ff" class="val-accent">${user.public_repos || 0}</text>
      <text x="50" y="25" fill="#475569" class="mono-regular" font-size="10">// REPOS</text>
    </g>

    <!-- Metric 2: Stars -->
    <g transform="translate(160, 0)">
      <text x="0" y="0" fill="#94a3b8" class="mono-regular" font-size="10">ESTRELLAS GITHUB</text>
      <text x="0" y="25" fill="#fcee0a" class="val-accent">${stars}</text>
      <text x="35" y="25" fill="#475569" class="mono-regular" font-size="10">// STARS</text>
    </g>

    <!-- Metric 3: Followers -->
    <g transform="translate(320, 0)">
      <text x="0" y="0" fill="#94a3b8" class="mono-regular" font-size="10">NETWORK FOLLOWERS</text>
      <text x="0" y="25" fill="#ff0055" class="val-accent">${user.followers || 0}</text>
      <text x="35" y="25" fill="#475569" class="mono-regular" font-size="10">// PEERS</text>
    </g>

    <!-- Metric 4: Runtime / Base -->
    <g transform="translate(480, 0)">
      <text x="0" y="0" fill="#94a3b8" class="mono-regular" font-size="10">RUNTIME &amp; LOCATION</text>
      <text x="0" y="16" fill="#cbd5e1" class="mono-bold" font-size="11">NODE.JS // SEVILLA.ES</text>
      <text x="0" y="32" fill="#64748b" class="mono-regular" font-size="9">PING: ${formattedDate} CET</text>
    </g>
  </g>

  <!-- Realtime Oscilloscope Waveform (Generated dynamically via JS) -->
  <g>
    <!-- Scope label -->
    <text x="660" y="55" fill="#475569" class="mono-regular" font-size="9">// OSCILLOSCOPE_STREAM</text>
    <!-- Scope line -->
    <path d="${waveformPath}" fill="none" stroke="#00f0ff" stroke-width="1.8" filter="url(#neonGlow)" />
  </g>

  <!-- Flanking Tech Corner Accents -->
  <g stroke="#ff0055" stroke-width="1.5" fill="none">
    <path d="M 8 35 L 8 16 L 27 16" />
    <path d="M 892 105 L 892 124 L 873 124" />
  </g>
</svg>`;

  const outputPath = path.join(__dirname, '..', 'assets', 'cyber-status.svg');
  fs.writeFileSync(outputPath, svgContent, 'utf8');
  console.log(`[✔] SVG generado con éxito en: ${outputPath}`);
}

run();

