"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WIDTH = 960;
const HEIGHT = 640;
const GRAVITY = 0.5;
const FLAP = -8;
const SCROLL = 5.6;
const PIPE_GAP = 300;
const PIPE_WIDTH = 64;
const PIPE_SPACING = 220;
const PIPE_BOB_AMPLITUDE = 50;
const PIPE_BOB_FREQUENCY = 0.8;
const SPEEDUP_EVERY = 5;
const SPEEDUP_FACTOR = 1.1;
const GROUND_H = 60;
const PLAYER_W = 48;
const PLAYER_H = 60;
const PLAYER_X = 100;
const CANNON_EVERY = 5;
const CANNON_W = 40;
const CANNON_H = 22;
const CANNON_BARREL_LEN = 22;
const CANNON_COOLDOWN = 90;
const BULLET_SPEED = 5.5;
const BULLET_RADIUS = 7;
const HIGHSCORE_KEY = "floppy-markus-2-highscore";

type Cannon = { cooldown: number };
type Bullet = { x: number; y: number; vx: number; vy: number };
type Pipe = {
  x: number;
  baseY: number;
  phase: number;
  gapY: number;
  scored: boolean;
  cannon: Cannon | null;
};
type GameState = "menu" | "playing" | "gameover";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgReadyRef = useRef(false);
  const jumpSoundRef = useRef<HTMLAudioElement | null>(null);

  const playerRef = useRef({ y: HEIGHT / 2, vy: 0 });
  const pipesRef = useRef<Pipe[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const pipeCountRef = useRef(0);
  const scoreRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<GameState>("menu");
  const bobTimeRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);

  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const stored = Number(window.localStorage.getItem(HIGHSCORE_KEY) ?? 0);
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  });

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  const resetWorld = useCallback(() => {
    playerRef.current = { y: HEIGHT / 2, vy: FLAP };
    pipeCountRef.current = 0;
    bulletsRef.current = [];
    pipesRef.current = [
      makePipe(WIDTH + 100, ++pipeCountRef.current),
      makePipe(WIDTH + 100 + PIPE_SPACING, ++pipeCountRef.current),
      makePipe(WIDTH + 100 + PIPE_SPACING * 2, ++pipeCountRef.current),
    ];
    scoreRef.current = 0;
    bobTimeRef.current = 0;
    lastFrameRef.current = null;
    setScore(0);
  }, []);

  const startGame = useCallback(() => {
    resetWorld();
    setGameState("playing");
  }, [resetWorld]);

  const flap = useCallback(() => {
    playerRef.current.vy = FLAP;
    const audio = jumpSoundRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = "/mario.png";
    img.onload = () => {
      imgReadyRef.current = true;
    };
    imgRef.current = img;

    const audio = new Audio("/markus-jump.mp3");
    audio.preload = "auto";
    audio.volume = 0.5;
    jumpSoundRef.current = audio;
  }, []);

  useEffect(() => {
    const handleAction = () => {
      const s = stateRef.current;
      if (s === "menu") startGame();
      else if (s === "playing") flap();
      else if (s === "gameover") startGame();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") {
        e.preventDefault();
        handleAction();
      }
    };
    const onPointer = () => handleAction();

    window.addEventListener("keydown", onKey);
    const canvas = canvasRef.current;
    canvas?.addEventListener("pointerdown", onPointer);

    return () => {
      window.removeEventListener("keydown", onKey);
      canvas?.removeEventListener("pointerdown", onPointer);
    };
  }, [startGame, flap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      const state = stateRef.current;
      const player = playerRef.current;
      const pipes = pipesRef.current;

      if (state === "playing") {
        player.vy += GRAVITY;
        player.y += player.vy;

        const frameNow = performance.now();
        const dt =
          lastFrameRef.current === null
            ? 0
            : (frameNow - lastFrameRef.current) / 1000;
        lastFrameRef.current = frameNow;

        const bobFreq =
          PIPE_BOB_FREQUENCY *
          Math.pow(SPEEDUP_FACTOR, Math.floor(scoreRef.current / SPEEDUP_EVERY));
        bobTimeRef.current += dt * bobFreq;

        for (const p of pipes) {
          p.x -= SCROLL;
          p.gapY =
            p.baseY + Math.sin(bobTimeRef.current + p.phase) * PIPE_BOB_AMPLITUDE;
          if (!p.scored && p.x + PIPE_WIDTH < PLAYER_X) {
            p.scored = true;
            scoreRef.current += 1;
            setScore(scoreRef.current);
          }
        }
        while (pipes.length && pipes[0].x + PIPE_WIDTH < 0) pipes.shift();
        const last = pipes[pipes.length - 1];
        if (!last || last.x < WIDTH - PIPE_SPACING) {
          pipes.push(
            makePipe((last?.x ?? WIDTH) + PIPE_SPACING, ++pipeCountRef.current),
          );
        }

        const bullets = bulletsRef.current;
        for (const p of pipes) {
          if (!p.cannon || p.x > WIDTH) continue;
          p.cannon.cooldown -= 1;
          if (p.cannon.cooldown <= 0) {
            const gapBot = p.gapY + PIPE_GAP / 2;
            const cx = p.x + PIPE_WIDTH / 2;
            const cy = gapBot + CANNON_H / 2;
            const tx = PLAYER_X + PLAYER_W / 2;
            const ty = player.y + PLAYER_H / 2;
            const dx = tx - cx;
            const dy = ty - cy;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            bullets.push({
              x: cx + ux * CANNON_BARREL_LEN,
              y: cy + uy * CANNON_BARREL_LEN,
              vx: ux * BULLET_SPEED,
              vy: uy * BULLET_SPEED,
            });
            p.cannon.cooldown = CANNON_COOLDOWN;
          }
        }

        let hitByBullet = false;
        for (const b of bullets) {
          b.x += b.vx;
          b.y += b.vy;
          if (bulletHitsPlayer(b, player.y)) hitByBullet = true;
        }
        bulletsRef.current = bullets.filter(
          (b) => b.x > -20 && b.x < WIDTH + 20 && b.y > -20 && b.y < HEIGHT + 20,
        );

        if (hitByBullet || collides(player.y, pipes)) {
          const finalScore = scoreRef.current;
          setHighScore((hs) => {
            if (finalScore > hs) {
              try {
                localStorage.setItem(HIGHSCORE_KEY, String(finalScore));
              } catch {}
              return finalScore;
            }
            return hs;
          });
          setGameState("gameover");
        }
      } else if (state === "menu") {
        player.y = HEIGHT / 2 + Math.sin(performance.now() / 300) * 12;
        player.vy = 0;
      }

      draw(
        ctx,
        player,
        pipes,
        bulletsRef.current,
        imgRef.current,
        imgReadyRef.current,
        scoreRef.current,
        state === "playing",
      );

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-linear-to-b from-sky-400 to-sky-600 p-4">
      <div
        className="relative shadow-2xl rounded-lg overflow-hidden"
        style={{ width: WIDTH, height: HEIGHT }}
      >
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="block touch-none cursor-pointer select-none"
        />

        {gameState === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-black/30 backdrop-blur-[1px]">
            <h1 className="text-white text-5xl font-black tracking-tight drop-shadow-[0_4px_0_rgba(0,0,0,0.6)]">
              Floppy Markus 2
            </h1>
            <button
              onClick={startGame}
              className="px-12 py-4 bg-yellow-400 hover:bg-yellow-300 text-black text-3xl font-black rounded-full shadow-lg border-4 border-black transition-transform hover:scale-105 active:scale-95"
            >
              PLAY
            </button>
            <p className="text-white/90 text-sm font-medium">
              Press Space, click, or tap to flap
            </p>
          </div>
        )}

        {gameState === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/50">
            <h2 className="text-white text-5xl font-black drop-shadow-[0_4px_0_rgba(0,0,0,0.6)]">
              Game Over
            </h2>
            <div className="text-white text-3xl font-bold">
              Score: <span className="text-yellow-300">{score}</span>
            </div>
            <div className="text-white/90 text-lg font-semibold">
              Best: {highScore}
            </div>
            <button
              onClick={startGame}
              className="px-10 py-3 bg-yellow-400 hover:bg-yellow-300 text-black text-2xl font-black rounded-full shadow-lg border-4 border-black transition-transform hover:scale-105 active:scale-95"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function makePipe(x: number, count: number): Pipe {
  const margin = 60 + PIPE_BOB_AMPLITUDE;
  const min = margin + PIPE_GAP / 2;
  const max = HEIGHT - GROUND_H - margin - PIPE_GAP / 2;
  const baseY = Math.random() * (max - min) + min;
  const phase = Math.random() * Math.PI * 2;
  const hasCannon = count > 0 && count % CANNON_EVERY === 0;
  const cannon: Cannon | null = hasCannon
    ? { cooldown: CANNON_COOLDOWN * 0.6 }
    : null;
  return { x, baseY, phase, gapY: baseY, scored: false, cannon };
}

function collides(playerY: number, pipes: Pipe[]) {
  if (playerY < 0) return true;
  if (playerY + PLAYER_H > HEIGHT - GROUND_H) return true;
  for (const p of pipes) {
    if (PLAYER_X + PLAYER_W < p.x || PLAYER_X > p.x + PIPE_WIDTH) continue;
    const gapTop = p.gapY - PIPE_GAP / 2;
    const gapBot = p.gapY + PIPE_GAP / 2;
    if (playerY < gapTop || playerY + PLAYER_H > gapBot) return true;
  }
  return false;
}

function bulletHitsPlayer(b: Bullet, playerY: number) {
  const cx = Math.max(PLAYER_X, Math.min(b.x, PLAYER_X + PLAYER_W));
  const cy = Math.max(playerY, Math.min(b.y, playerY + PLAYER_H));
  const dx = b.x - cx;
  const dy = b.y - cy;
  return dx * dx + dy * dy < BULLET_RADIUS * BULLET_RADIUS;
}

function draw(
  ctx: CanvasRenderingContext2D,
  player: { y: number; vy: number },
  pipes: Pipe[],
  bullets: Bullet[],
  img: HTMLImageElement | null,
  imgReady: boolean,
  score: number,
  showScore: boolean,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#7dd3fc");
  sky.addColorStop(1, "#38bdf8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 3; i++) {
    const cx = ((i * 170 + (performance.now() / 90) % 510) % (WIDTH + 80)) - 40;
    const cy = 70 + (i % 2) * 50;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.arc(cx + 18, cy + 4, 16, 0, Math.PI * 2);
    ctx.arc(cx - 18, cy + 4, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of pipes) {
    const gapTop = p.gapY - PIPE_GAP / 2;
    const gapBot = p.gapY + PIPE_GAP / 2;
    drawPipe(ctx, p.x, 0, PIPE_WIDTH, gapTop, true);
    drawPipe(ctx, p.x, gapBot, PIPE_WIDTH, HEIGHT - GROUND_H - gapBot, false);
    if (p.cannon) drawCannon(ctx, p, player.y);
  }

  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#111827";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ef4444";
    ctx.stroke();
  }

  ctx.fillStyle = "#a16207";
  ctx.fillRect(0, HEIGHT - GROUND_H, WIDTH, GROUND_H);
  ctx.fillStyle = "#65a30d";
  ctx.fillRect(0, HEIGHT - GROUND_H, WIDTH, 10);

  const tilt = Math.max(-0.4, Math.min(1.0, player.vy / 12));
  ctx.save();
  ctx.translate(PLAYER_X + PLAYER_W / 2, player.y + PLAYER_H / 2);
  ctx.rotate(tilt);
  if (imgReady && img) {
    ctx.drawImage(img, -PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H);
  } else {
    ctx.fillStyle = "#fde047";
    ctx.fillRect(-PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H);
  }
  ctx.restore();

  if (showScore) {
    ctx.save();
    ctx.font = "900 56px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillStyle = "#ffffff";
    const text = String(score);
    ctx.strokeText(text, WIDTH / 2, 24);
    ctx.fillText(text, WIDTH / 2, 24);
    ctx.restore();
  }
}

function drawPipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  flip: boolean,
) {
  if (h <= 0) return;
  ctx.fillStyle = "#16a34a";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#15803d";
  ctx.fillRect(x + w - 6, y, 6, h);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(x + 4, y, 6, h);

  const lipH = 22;
  const lipX = x - 4;
  const lipW = w + 8;
  const lipY = flip ? y + h - lipH : y;
  ctx.fillStyle = "#15803d";
  ctx.fillRect(lipX, lipY, lipW, lipH);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(lipX + 4, lipY + 4, lipW - 8, lipH - 8);
}

function drawCannon(
  ctx: CanvasRenderingContext2D,
  p: Pipe,
  playerY: number,
) {
  const gapBot = p.gapY + PIPE_GAP / 2;
  const cx = p.x + PIPE_WIDTH / 2;
  const cy = gapBot + CANNON_H / 2;

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(cx - CANNON_W / 2, gapBot, CANNON_W, CANNON_H);
  ctx.fillStyle = "#374151";
  ctx.fillRect(cx - CANNON_W / 2, gapBot, CANNON_W, 4);

  const angle = Math.atan2(
    playerY + PLAYER_H / 2 - cy,
    PLAYER_X + PLAYER_W / 2 - cx,
  );
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, -6, CANNON_BARREL_LEN + 4, 12);
  ctx.fillStyle = "#4b5563";
  ctx.fillRect(CANNON_BARREL_LEN, -7, 4, 14);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#6b7280";
  ctx.fill();
}
