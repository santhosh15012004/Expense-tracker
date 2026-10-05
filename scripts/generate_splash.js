const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FFMPEG_PATH = 'C:\\Users\\SPLPT\\AppData\\Local\\Programs\\Python\\Python314\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION_SEC = 6;
const TOTAL_FRAMES = FPS * DURATION_SEC; // 180 frames

const OUTPUT_VIDEO = path.resolve(__dirname, '../assets/splash_animation.mp4');
const ARTIFACT_VIDEO = 'C:\\Users\\SPLPT\\.gemini\\antigravity-ide\\brain\\8bde0700-46d1-4837-8ceb-ab699dc94756\\splash_animation.mp4';

// Check if user logo exists
const logoPath = path.resolve(__dirname, '../assets/app-logo.png');
let logoBase64 = '';
if (fs.existsSync(logoPath)) {
  logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
}

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #050811;
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    }
    canvas {
      display: block;
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
    }
  </style>
</head>
<body>
  <canvas id="stage" width="${WIDTH}" height="${HEIGHT}"></canvas>
  <img id="userLogo" src="${logoBase64}" style="display:none;" />

  <script>
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const logoImg = document.getElementById('userLogo');
    const W = ${WIDTH};
    const H = ${HEIGHT};
    const CX = W / 2;
    const CY = H / 2 - 40; // slightly above center to leave room for text

    // Pre-generate background particles
    const particles = [];
    for (let i = 0; i < 45; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 2.5 + 1.0,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: -Math.random() * 0.8 - 0.2,
        alpha: Math.random() * 0.6 + 0.2,
        pulseSpeed: Math.random() * 3 + 2,
        color: Math.random() > 0.4 ? 'rgba(16, 185, 129,' : 'rgba(56, 189, 248,'
      });
    }

    // Inflow data particles for Scene 3
    const inflowParticles = [];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const dist = 360 + Math.random() * 220;
      inflowParticles.push({
        origDist: dist,
        angle: angle,
        speed: 0.8 + Math.random() * 0.6,
        size: Math.random() * 4 + 3,
        type: i % 3 === 0 ? 'coin' : 'dot',
        color: i % 2 === 0 ? '#10B981' : '#F59E0B'
      });
    }

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function easeOutQuad(t) {
      return 1 - (1 - t) * (1 - t);
    }

    function easeOutBack(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    function easeOutExpo(t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function clamp(val, min, max) {
      return Math.min(Math.max(val, min), max);
    }

    // Main render function called per frame
    window.renderFrame = function(frameIndex) {
      const t = frameIndex / ${FPS}; // current time in seconds (0.0 to 6.0)

      // 1. CLEAR & BACKGROUND
      ctx.clearRect(0, 0, W, H);

      // Deep luxury fintech gradient
      const bgGrad = ctx.createRadialGradient(CX, CY, 50, CX, CY, 950);
      bgGrad.addColorStop(0, '#0E1A2F');
      bgGrad.addColorStop(0.4, '#080E1C');
      bgGrad.addColorStop(0.8, '#04070E');
      bgGrad.addColorStop(1, '#020307');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Subtle ambient mesh glow at center
      const ambientPulse = 0.85 + Math.sin(t * 3.5) * 0.15;
      const centerGlow = ctx.createRadialGradient(CX, CY, 0, CX, CY, 480);
      centerGlow.addColorStop(0, 'rgba(16, 185, 129, ' + (0.13 * ambientPulse) + ')');
      centerGlow.addColorStop(0.4, 'rgba(6, 182, 212, ' + (0.06 * ambientPulse) + ')');
      centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, W, H);

      // 2. BACKGROUND PARTICLES
      particles.forEach(p => {
        const py = (p.y + p.speedY * frameIndex * 1.5) % H;
        const currentY = py < 0 ? py + H : py;
        const px = (p.x + p.speedX * frameIndex * 1.5) % W;
        const currentX = px < 0 ? px + W : px;
        const pAlpha = p.alpha * (0.6 + Math.sin(t * p.pulseSpeed) * 0.4);

        ctx.beginPath();
        ctx.arc(currentX, currentY, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + pAlpha + ')';
        ctx.shadowColor = p.color + '0.8)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // ==========================================
      // SCENE 1 (0s to 2s): Glowing Financial Symbol
      // ==========================================
      if (t < 2.5) {
        const s1Progress = clamp(t / 2.0, 0, 1);
        let s1Fade = 1.0;
        if (t > 1.8) {
          s1Fade = 1.0 - clamp((t - 1.8) / 0.5, 0, 1);
        }

        // Concentric breathing rings
        for (let ring = 1; ring <= 3; ring++) {
          const ringProgress = (t * 0.7 + ring * 0.3) % 1.0;
          const ringRadius = 50 + ringProgress * 180;
          const ringAlpha = (1 - ringProgress) * 0.28 * s1Fade;
          
          ctx.beginPath();
          ctx.arc(CX, CY, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(16, 185, 129, ' + ringAlpha + ')';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Symbol entrance scale
        const symScale = easeOutBack(clamp(t / 1.2, 0, 1));
        const pulse = 1 + Math.sin(t * 6) * 0.04;

        ctx.save();
        ctx.translate(CX, CY);
        ctx.scale(symScale * pulse, symScale * pulse);
        ctx.globalAlpha = clamp(t * 1.5, 0, 1) * s1Fade;

        // Outer glow aura
        const auraGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 120);
        auraGrad.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
        auraGrad.addColorStop(0.5, 'rgba(52, 211, 153, 0.15)');
        auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 120, 0, Math.PI * 2);
        ctx.fill();

        // Glowing Rupee / Financial symbol core
        ctx.shadowColor = '#10B981';
        ctx.shadowBlur = 30;
        ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = '#FFFFFF';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw Stylized Rupee ₹
        ctx.beginPath();
        // Top bar 1
        ctx.moveTo(-45, -60);
        ctx.lineTo(45, -60);
        // Top bar 2
        ctx.moveTo(-45, -35);
        ctx.lineTo(40, -35);
        // Head curve
        ctx.moveTo(-25, -60);
        ctx.bezierCurveTo(45, -60, 45, 15, -15, 15);
        // Downward diagonal slash
        ctx.lineTo(45, 75);
        ctx.stroke();

        // Accent gold/emerald highlight line
        ctx.shadowColor = '#34D399';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-45, -60);
        ctx.lineTo(45, -60);
        ctx.moveTo(-25, -60);
        ctx.bezierCurveTo(45, -60, 45, 15, -15, 15);
        ctx.lineTo(45, 75);
        ctx.stroke();

        ctx.restore();
      }

      // ========================================================
      // SCENE 2 (2s to 4s): Glassmorphic Wallet + Trend Graph + 3D Coins
      // ========================================================
      if (t >= 1.7 && t < 4.5) {
        const s2Enter = easeInOutCubic(clamp((t - 1.7) / 0.8, 0, 1));
        let s2Exit = 1.0;
        if (t > 3.8) {
          s2Exit = 1.0 - clamp((t - 3.8) / 0.6, 0, 1);
        }
        const s2Alpha = s2Enter * s2Exit;

        ctx.save();
        ctx.translate(CX, CY);
        const s2Scale = 0.8 + s2Enter * 0.25;
        ctx.scale(s2Scale, s2Scale);
        ctx.globalAlpha = s2Alpha;

        // 1. Glassmorphism Wallet Body
        const wW = 280;
        const wH = 190;
        const wR = 24;
        const wX = -wW / 2;
        const wY = -wH / 2 + 10;

        // Soft back drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 15;

        // Glass gradient fill
        const glassGrad = ctx.createLinearGradient(wX, wY, wX + wW, wY + wH);
        glassGrad.addColorStop(0, 'rgba(30, 41, 59, 0.85)');
        glassGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.75)');
        glassGrad.addColorStop(1, 'rgba(16, 185, 129, 0.25)');
        ctx.fillStyle = glassGrad;

        // Draw rounded wallet rect
        ctx.beginPath();
        ctx.roundRect(wX, wY, wW, wH, wR);
        ctx.fill();

        // Glass translucent border
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(52, 211, 153, 0.5)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 2. Upward Trend Graph inside wallet
        const graphProgress = easeOutQuad(clamp((t - 2.2) / 1.0, 0, 1));
        const pts = [
          { x: wX + 35, y: wY + 130 },
          { x: wX + 90, y: wY + 115 },
          { x: wX + 150, y: wY + 80 },
          { x: wX + 210, y: wY + 95 },
          { x: wX + 250, y: wY + 45 }
        ];

        // Draw graph area fill
        if (graphProgress > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            const curP = pts[i];
            const prevP = pts[i - 1];
            const targetX = prevP.x + (curP.x - prevP.x) * graphProgress;
            const targetY = prevP.y + (curP.y - prevP.y) * graphProgress;
            ctx.lineTo(targetX, targetY);
            if (i / (pts.length - 1) >= graphProgress) break;
          }
          const lastX = pts[0].x + (pts[pts.length - 1].x - pts[0].x) * graphProgress;
          ctx.lineTo(lastX, wY + wH - 10);
          ctx.lineTo(pts[0].x, wY + wH - 10);
          ctx.closePath();

          const areaGrad = ctx.createLinearGradient(0, wY + 40, 0, wY + wH);
          areaGrad.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
          areaGrad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
          ctx.fillStyle = areaGrad;
          ctx.fill();

          // Glowing trend stroke line
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            const curP = pts[i];
            const prevP = pts[i - 1];
            const targetX = prevP.x + (curP.x - prevP.x) * graphProgress;
            const targetY = prevP.y + (curP.y - prevP.y) * graphProgress;
            ctx.lineTo(targetX, targetY);
            if (i / (pts.length - 1) >= graphProgress) break;
          }
          ctx.strokeStyle = '#10B981';
          ctx.shadowColor = '#34D399';
          ctx.shadowBlur = 20;
          ctx.lineWidth = 5;
          ctx.stroke();

          // Apex glowing point
          if (graphProgress >= 0.95) {
            const apex = pts[pts.length - 1];
            ctx.beginPath();
            ctx.arc(apex.x, apex.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#34D399';
            ctx.shadowBlur = 25;
            ctx.fill();

            // Arrow head
            ctx.beginPath();
            ctx.moveTo(apex.x - 3, apex.y - 12);
            ctx.lineTo(apex.x + 9, apex.y - 9);
            ctx.lineTo(apex.x + 6, apex.y + 3);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          ctx.restore();
        }

        // 3. Floating 3D Gold & Emerald Coins
        const coinFloat = Math.sin(t * 3.5) * 8;
        // Coin 1 (Top Left)
        ctx.save();
        ctx.translate(-130, -90 + coinFloat);
        ctx.rotate(0.25 + Math.sin(t * 2) * 0.1);
        ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
        ctx.shadowBlur = 25;
        // Outer rim
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        const coinGrad1 = ctx.createLinearGradient(-30, -30, 30, 30);
        coinGrad1.addColorStop(0, '#FCD34D');
        coinGrad1.addColorStop(0.5, '#F59E0B');
        coinGrad1.addColorStop(1, '#B45309');
        ctx.fillStyle = coinGrad1;
        ctx.fill();
        ctx.strokeStyle = '#FEF3C7';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Inner symbol
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('₹', 0, 2);
        ctx.restore();

        // Coin 2 (Bottom Right)
        ctx.save();
        ctx.translate(145, 75 - coinFloat);
        ctx.rotate(-0.2 + Math.cos(t * 2.5) * 0.1);
        ctx.shadowColor = 'rgba(16, 185, 129, 0.7)';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        const coinGrad2 = ctx.createLinearGradient(-25, -25, 25, 25);
        coinGrad2.addColorStop(0, '#6EE7B7');
        coinGrad2.addColorStop(0.5, '#10B981');
        coinGrad2.addColorStop(1, '#047857');
        ctx.fillStyle = coinGrad2;
        ctx.fill();
        ctx.strokeStyle = '#A7F3D0';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 2);
        ctx.restore();

        ctx.restore();
      }

      // =====================================================================
      // SCENE 3 & 4 (3.8s to 6.0s): Circular Data Orbits, Inflow & Final Logo
      // =====================================================================
      if (t >= 3.6) {
        const s3Enter = easeOutBack(clamp((t - 3.6) / 1.0, 0, 1));
        const s4Progress = clamp((t - 4.8) / 1.2, 0, 1);

        ctx.save();
        ctx.translate(CX, CY);

        // 1. Circular Financial Data Lines & Radar Orbit Rings
        const rotSpeed1 = t * 0.45;
        const rotSpeed2 = -t * 0.35;

        // Outer telemetry orbit ring
        ctx.save();
        ctx.rotate(rotSpeed1);
        ctx.beginPath();
        ctx.arc(0, 0, 250, 0, Math.PI * 1.6);
        ctx.strokeStyle = 'rgba(16, 185, 129, ' + (0.35 * s3Enter) + ')';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([16, 12]);
        ctx.shadowColor = '#10B981';
        ctx.shadowBlur = 10;
        ctx.stroke();

        // Small nodes along orbit
        for (let a = 0; a < 4; a++) {
          const ang = a * (Math.PI / 2);
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * 250, Math.sin(ang) * 250, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#34D399';
          ctx.fill();
        }
        ctx.restore();

        // Inner counter-rotating thin ring
        ctx.save();
        ctx.rotate(rotSpeed2);
        ctx.beginPath();
        ctx.arc(0, 0, 205, 0, Math.PI * 1.8);
        ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.3 * s3Enter) + ')';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.restore();

        // 2. Converging inflow expense indicators (representing money tracking)
        if (t < 5.3) {
          const flowProgress = clamp((t - 3.7) / 1.4, 0, 1);
          inflowParticles.forEach(ip => {
            const currentDist = ip.origDist * (1 - flowProgress * 0.85);
            const currentAng = ip.angle + flowProgress * 0.8;
            const ix = Math.cos(currentAng) * currentDist;
            const iy = Math.sin(currentAng) * currentDist;
            const trailAlpha = (1 - flowProgress * 0.3) * s3Enter * 0.8;

            ctx.beginPath();
            ctx.arc(ix, iy, ip.size, 0, Math.PI * 2);
            ctx.fillStyle = ip.color;
            ctx.shadowColor = ip.color;
            ctx.shadowBlur = 12;
            ctx.fill();

            // Stream trail
            ctx.beginPath();
            ctx.moveTo(ix, iy);
            ctx.lineTo(
              Math.cos(currentAng - 0.15) * (currentDist + 25),
              Math.sin(currentAng - 0.15) * (currentDist + 25)
            );
            ctx.strokeStyle = ip.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = trailAlpha * 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          });
        }

        // 3. Central Brand Logo Element
        // Circular white badge with user logo or high-end fintech emblem
        const logoScale = s3Enter * (1.0 + Math.sin(t * 1.5) * 0.02);
        ctx.save();
        ctx.scale(logoScale, logoScale);

        // Circular background glow
        const logoGlow = ctx.createRadialGradient(0, 0, 120, 0, 0, 220);
        logoGlow.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
        logoGlow.addColorStop(0.6, 'rgba(52, 211, 153, 0.1)');
        logoGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = logoGlow;
        ctx.beginPath();
        ctx.arc(0, 0, 220, 0, Math.PI * 2);
        ctx.fill();

        // White circular card / backdrop for crisp logo contrast
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 12;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, 145, 0, Math.PI * 2);
        ctx.fill();

        // Emerald outer rim
        ctx.shadowColor = '#10B981';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Draw User's actual app logo inside the circle
        if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, 140, 0, Math.PI * 2);
          ctx.clip();
          // Draw logo centered
          const imgSize = 270;
          ctx.drawImage(logoImg, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
          ctx.restore();
        } else {
          // Fallback vector drawing of rupee emblem
          ctx.fillStyle = '#D97706';
          ctx.font = 'bold 120px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('₹', 0, 0);
        }

        ctx.restore(); // end logo scale
        ctx.restore(); // end scene 3/4 center

        // ==========================================
        // SCENE 4: Typography ("EXPENSE TRACKER" + Tagline)
        // ==========================================
        if (t >= 4.5) {
          const textProgress = easeOutExpo(clamp((t - 4.5) / 1.0, 0, 1));
          const textYOffset = (1 - textProgress) * 35;
          const textAlpha = clamp((t - 4.5) / 0.8, 0, 1);

          ctx.save();
          ctx.globalAlpha = textAlpha;

          const textCenterY = CY + 250 + textYOffset;

          // Main Title: "EXPENSE TRACKER"
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '900 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = 'rgba(16, 185, 129, 0.7)';
          ctx.shadowBlur = 20;
          ctx.letterSpacing = '6px';
          ctx.fillText('EXPENSE TRACKER', CX, textCenterY);

          // Subtle decorative underline bar with center diamond
          const barWidth = 260 * textProgress;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(CX - barWidth / 2, textCenterY + 38);
          ctx.lineTo(CX - 15, textCenterY + 38);
          ctx.moveTo(CX + 15, textCenterY + 38);
          ctx.lineTo(CX + barWidth / 2, textCenterY + 38);
          ctx.stroke();

          // Emerald center pip
          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.arc(CX, textCenterY + 38, 4, 0, Math.PI * 2);
          ctx.shadowColor = '#10B981';
          ctx.shadowBlur = 10;
          ctx.fill();

          // Tagline: "Track. Save. Grow."
          if (t >= 5.0) {
            const tagAlpha = clamp((t - 5.0) / 0.6, 0, 1);
            ctx.globalAlpha = tagAlpha;
            ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = '#34D399'; // Emerald accent
            ctx.shadowColor = '#10B981';
            ctx.shadowBlur = 12;
            ctx.letterSpacing = '8px';
            ctx.fillText('Track. Save. Grow.', CX, textCenterY + 75);
          }

          ctx.restore();
        }
      }
    };
  </script>
</body>
</html>
`;

async function run() {
  console.log('Starting splash animation rendering...');
  console.log(`Resolution: ${WIDTH}x${HEIGHT}, FPS: ${FPS}, Duration: ${DURATION_SEC}s, Frames: ${TOTAL_FRAMES}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      `--window-size=${WIDTH},${HEIGHT}`
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  // Ensure image is fully loaded in DOM
  await page.evaluate(async () => {
    const img = document.getElementById('userLogo');
    if (img && !img.complete) {
      await new Promise(res => { img.onload = res; img.onerror = res; });
    }
  });

  console.log('Setting up ffmpeg pipe...');
  const ffmpegArgs = [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    '-r', `${FPS}`,
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '18',
    '-movflags', '+faststart',
    OUTPUT_VIDEO
  ];

  const ffmpeg = spawn(FFMPEG_PATH, ffmpegArgs);

  ffmpeg.stderr.on('data', data => {
    // console.log(`ffmpeg: ${data}`);
  });

  ffmpeg.on('error', err => {
    console.error('FFmpeg process error:', err);
  });

  console.log('Rendering frames...');
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    await page.evaluate(frameIndex => {
      window.renderFrame(frameIndex);
    }, f);

    // Get screenshot buffer as png
    const buffer = await page.screenshot({ type: 'png', omitBackground: false });
    ffmpeg.stdin.write(buffer);

    if (f % 30 === 0 || f === TOTAL_FRAMES - 1) {
      console.log(`Rendered frame ${f + 1}/${TOTAL_FRAMES} (${((f + 1) / TOTAL_FRAMES * 100).toFixed(1)}%) - ${(f / FPS).toFixed(1)}s`);
    }
  }

  ffmpeg.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpeg.on('close', code => {
      if (code === 0) {
        console.log('FFmpeg finished successfully!');
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });

  await browser.close();

  // Copy to brain artifacts folder
  try {
    fs.copyFileSync(OUTPUT_VIDEO, ARTIFACT_VIDEO);
    console.log(`Copied video to artifacts at: ${ARTIFACT_VIDEO}`);
  } catch (err) {
    console.warn('Could not copy to artifacts:', err.message);
  }

  console.log(`Done! Output saved to: ${OUTPUT_VIDEO}`);
}

run().catch(err => {
  console.error('Error generating animation:', err);
  process.exit(1);
});
