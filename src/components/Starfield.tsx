import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  layer: number;     // 0=far, 1=mid, 2=near
  isBrand: boolean;
  phase: number;
  alpha: number;     // base brightness
}

const STAR_COUNT = 280;
const BRAND_RATIO = 0.10;
const TWINKLE_SPEED = 0.0015;
const MOUSE_PARALLAX = [8, 20, 40];
const DRIFT_SPEED = [0.04, 0.08, 0.14];

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 });
  const starsRef = useRef<Star[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
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

    starsRef.current = Array.from({ length: STAR_COUNT }, createStar);

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + 'px';
      canvas!.style.height = h + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function handleMouseMove(e: MouseEvent) {
      mouseRef.current.x = e.clientX / w;
      mouseRef.current.y = e.clientY / h;
    }
    window.addEventListener('mousemove', handleMouseMove);

    let paused = false;
    function handleVisibility() {
      paused = document.hidden;
      if (!paused) animRef.current = requestAnimationFrame(animate);
    }
    document.addEventListener('visibilitychange', handleVisibility);

    function animate() {
      if (paused) return;

      const time = timeRef.current++;
      const mouse = mouseRef.current;

      mouse.sx += (mouse.x - mouse.sx) * 0.03;
      mouse.sy += (mouse.y - mouse.sy) * 0.03;
      const mx = mouse.sx - 0.5;
      const my = mouse.sy - 0.5;

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

        const parallax = MOUSE_PARALLAX[s.layer];
        const sx = s.x + mx * parallax;
        const sy = s.y + my * parallax;

        const twinkle = 0.65 + 0.35 * Math.sin(time * TWINKLE_SPEED + s.phase);
        const a = s.alpha * twinkle;

        ctx!.beginPath();
        ctx!.arc(sx, sy, s.size, 0, Math.PI * 2);

        if (s.isBrand) {
          ctx!.fillStyle = `rgba(0, 209, 255, ${a})`;
          if (s.layer >= 1) {
            ctx!.shadowColor = 'rgba(0, 209, 255, 0.6)';
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

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="starfield-canvas"
        aria-hidden="true"
      />
      <div className="starfield-vignette" aria-hidden="true" />
    </>
  );
}
