import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  layer: number;
  isBrand: boolean;
  phase: number;
  alpha: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;      // frames remaining
  maxLife: number;    // total frames for fade calc
  size: number;
  trail: { x: number; y: number }[];
}

const STAR_COUNT = 140;
const BRAND_RATIO = 0.10;
const TWINKLE_SPEED = 0.0015;
const DRIFT_SPEED = [0.019, 0.0375, 0.0625];
const SHOOTING_STAR_INTERVAL = 90000; // ms — base interval, randomized ±30s in spawner

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const shootingRef = useRef<ShootingStar[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    // Skip on mobile/tablet
    if (window.innerWidth < 1024) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;

    function createStar(): Star {
      const layer = Math.random() < 0.5 ? 0 : Math.random() < 0.6 ? 1 : 2;
      const angle = Math.random() * Math.PI * 2;
      const speed = DRIFT_SPEED[layer] * (0.5 + Math.random() * 0.5);
      return {
        x: Math.random() * (w + 100) - 50,
        y: Math.random() * (h + 100) - 50,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.4,
        size: layer === 0 ? 0.4 + Math.random() * 0.6
            : layer === 1 ? 0.6 + Math.random() * 1.0
            : 1.0 + Math.random() * 1.4,
        layer,
        isBrand: Math.random() < BRAND_RATIO,
        phase: Math.random() * Math.PI * 2,
        alpha: layer === 0 ? 0.15 + Math.random() * 0.2
             : layer === 1 ? 0.3 + Math.random() * 0.3
             : 0.5 + Math.random() * 0.4,
      };
    }

    function spawnShootingStar() {
      // Pick a random start along the top or right edge
      const fromTop = Math.random() < 0.6;
      const x = fromTop ? Math.random() * w * 0.8 : w + 10;
      const y = fromTop ? -10 : Math.random() * h * 0.4;
      // Streak diagonally down-left to down-right
      const angle = fromTop
        ? (Math.PI * 0.15) + Math.random() * (Math.PI * 0.25)  // 27° to 72° from horizontal
        : (Math.PI * 0.55) + Math.random() * (Math.PI * 0.25); // 99° to 144°
      const speed = 1.2 + Math.random() * 0.8; // 1.2-2.0 px/frame
      // Calculate life so it crosses ~85-95% of the screen diagonal
      const diagonal = Math.sqrt(w * w + h * h);
      const targetDist = diagonal * (0.85 + Math.random() * 0.1);
      const life = Math.floor(targetDist / speed);
      shootingRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2.0 + Math.random() * 1.0,
        trail: [],
      });
    }

    // Randomized recurring spawn — 60-120s between each
    let shootingTimeout: ReturnType<typeof setTimeout>;
    function scheduleNext() {
      const delay = SHOOTING_STAR_INTERVAL + (Math.random() - 0.5) * 60000; // 60s-120s
      shootingTimeout = setTimeout(() => {
        spawnShootingStar();
        scheduleNext();
      }, delay);
    }
    scheduleNext();

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Re-distribute any stars that are out of bounds after resize
      for (const s of starsRef.current) {
        if (s.x > w + 60 || s.y > h + 60) {
          s.x = Math.random() * w;
          s.y = Math.random() * h;
        }
      }
    }
    resize();
    // Create stars AFTER resize so w/h reflect actual canvas dimensions
    starsRef.current = Array.from({ length: STAR_COUNT }, createStar);
    window.addEventListener('resize', resize);

    let paused = false;
    function handleVisibility() {
      if (document.hidden) {
        paused = true;
        cancelAnimationFrame(animRef.current);
      } else {
        paused = false;
        // Clear shooting stars that accumulated while tab was hidden
        shootingRef.current = [];
        // Only start a new loop (the old one was cancelled above)
        animRef.current = requestAnimationFrame(animate);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    function animate() {
      if (paused) return;

      const time = timeRef.current++;

      const grad = ctx!.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#050505');
      grad.addColorStop(0.5, '#070708');
      grad.addColorStop(1, '#080809');
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, w, h);

      ctx!.shadowColor = 'transparent';
      ctx!.shadowBlur = 0;

      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        s.x += s.vx;
        s.y += s.vy;

        if (s.x < -60) s.x = w + 50;
        else if (s.x > w + 60) s.x = -50;
        if (s.y < -60) s.y = h + 50;
        else if (s.y > h + 60) s.y = -50;

        const twinkle = 0.65 + 0.35 * Math.sin(time * TWINKLE_SPEED + s.phase);
        const a = s.alpha * twinkle;

        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.size, 0, Math.PI * 2);

        if (s.isBrand) {
          ctx!.fillStyle = `rgba(255, 223, 140, ${a})`;
          if (s.layer >= 1) {
            ctx!.shadowColor = 'rgba(255, 223, 140, 0.5)';
            ctx!.shadowBlur = s.size * 4;
          }
        } else {
          ctx!.fillStyle = `rgba(255, 255, 255, ${a})`;
          if (s.layer === 2 && s.size > 1.5) {
            ctx!.shadowColor = 'rgba(255, 255, 255, 0.3)';
            ctx!.shadowBlur = s.size * 2;
          }
        }

        ctx!.fill();

        if (ctx!.shadowBlur > 0) {
          ctx!.shadowColor = 'transparent';
          ctx!.shadowBlur = 0;
        }
      }

      // ── Shooting stars (line streaks) ─────────────────────
      const shooters = shootingRef.current;
      for (let i = shooters.length - 1; i >= 0; i--) {
        const ss = shooters[i];

        // Move
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life--;

        // Fade in fast, sustain, fade out at end
        const alpha = ss.life < 10 ? ss.life / 10 : Math.min((ss.maxLife - ss.life) / 5, 1);

        // Tail position — streak extends behind the head
        const tailLen = 120 + ss.size * 30; // long streak
        const speed = Math.sqrt(ss.vx * ss.vx + ss.vy * ss.vy);
        const dx = ss.vx / speed; // normalized direction
        const dy = ss.vy / speed;
        const tailX = ss.x - dx * tailLen;
        const tailY = ss.y - dy * tailLen;

        // Gradient from tail (transparent) to head (subtle)
        const grad = ctx!.createLinearGradient(tailX, tailY, ss.x, ss.y);
        grad.addColorStop(0, `rgba(255, 255, 255, 0)`);
        grad.addColorStop(0.7, `rgba(255, 255, 255, ${alpha * 0.12})`);
        grad.addColorStop(1, `rgba(255, 255, 255, ${alpha * 0.35})`);

        // Draw the streak line
        ctx!.beginPath();
        ctx!.moveTo(tailX, tailY);
        ctx!.lineTo(ss.x, ss.y);
        ctx!.strokeStyle = grad;
        ctx!.lineWidth = ss.size * 0.5;
        ctx!.lineCap = 'round';
        ctx!.stroke();

        // Head dot — subtle, no heavy glow
        ctx!.beginPath();
        ctx!.arc(ss.x, ss.y, ss.size * 0.4, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255, 255, 255, ${alpha * 0.45})`;
        ctx!.shadowColor = `rgba(255, 255, 255, ${alpha * 0.2})`;
        ctx!.shadowBlur = 3;
        ctx!.fill();
        ctx!.shadowColor = 'transparent';
        ctx!.shadowBlur = 0;

        // Remove dead shooting stars
        if (ss.life <= 0 || ss.x < -100 || ss.x > w + 100 || ss.y > h + 100) {
          shooters.splice(i, 1);
        }
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      clearTimeout(shootingTimeout);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="starfield-canvas hidden lg:block"
        aria-hidden="true"
      />
      <div className="starfield-vignette hidden lg:block" aria-hidden="true" />
    </>
  );
}
