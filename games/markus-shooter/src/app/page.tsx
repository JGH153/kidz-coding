"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WIDTH = 960;
const HEIGHT = 540;
const PLAYER_X = 90;
const PLAYER_W = 90;
const PLAYER_H = 140;
const PLAYER_SPEED = 6;
const BULLET_W = 18;
const BULLET_H = 6;
const BULLET_SPEED = 11;
const BULLET_COOLDOWN_MS = 200;
const ENEMY_SIZE = 46;
const ENEMY_BASE_SPEED = 3.2;
const ENEMY_SPEED_PER_SCORE = 0.04;
const ENEMY_SPEED_MAX = 8;
const ENEMY_SPAWN_BASE_MS = 900;
const ENEMY_SPAWN_MIN_MS = 320;
const STAR_COUNT = 60;
const CLOUD_COUNT = 6;

type GameState = "menu" | "playing" | "gameover";
type Bullet = { x: number; y: number };
type Enemy = { x: number; y: number };
type Star = { x: number; y: number; r: number; s: number };
type Cloud = { x: number; y: number; w: number; h: number; s: number };

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgReadyRef = useRef(false);

  const playerYRef = useRef(HEIGHT / 2);
  const bulletsRef = useRef<Bullet[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const scoreRef = useRef(0);
  const lastShotRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const upRef = useRef(false);
  const downRef = useRef(false);
  const shootHeldRef = useRef(false);
  const pointerYRef = useRef<number | null>(null);
  const starsRef = useRef<Star[]>([]);
  const cloudsRef = useRef<Cloud[]>([]);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<GameState>("menu");

  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    starsRef.current = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT * 0.75,
      r: Math.random() * 1.6 + 0.4,
      s: Math.random() * 0.4 + 0.15,
    }));
    cloudsRef.current = Array.from({ length: CLOUD_COUNT }, () => ({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT * 0.55 + 20,
      w: Math.random() * 120 + 80,
      h: Math.random() * 20 + 16,
      s: Math.random() * 0.5 + 0.4,
    }));
  }, []);

  const resetWorld = useCallback(() => {
    playerYRef.current = HEIGHT / 2;
    bulletsRef.current = [];
    enemiesRef.current = [];
    scoreRef.current = 0;
    lastShotRef.current = 0;
    lastSpawnRef.current = performance.now();
    setScore(0);
  }, []);

  const startGame = useCallback(() => {
    resetWorld();
    setGameState("playing");
  }, [resetWorld]);

  const tryShoot = useCallback(() => {
    const now = performance.now();
    if (now - lastShotRef.current < BULLET_COOLDOWN_MS) return;
    lastShotRef.current = now;
    bulletsRef.current.push({
      x: PLAYER_X + PLAYER_W / 2,
      y: playerYRef.current,
    });
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = "/markus.png";
    img.onload = () => {
      imgReadyRef.current = true;
    };
    imgRef.current = img;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (e.code === "ArrowUp" || e.code === "KeyW") {
        upRef.current = true;
        e.preventDefault();
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        downRef.current = true;
        e.preventDefault();
      } else if (e.code === "Space") {
        if (s === "playing") {
          shootHeldRef.current = true;
          tryShoot();
        } else {
          startGame();
        }
        e.preventDefault();
      } else if (e.code === "Enter") {
        if (s !== "playing") startGame();
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") upRef.current = false;
      else if (e.code === "ArrowDown" || e.code === "KeyS")
        downRef.current = false;
      else if (e.code === "Space") shootHeldRef.current = false;
    };

    const canvasYFromEvent = (e: PointerEvent) => {
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const ratio = HEIGHT / rect.height;
      return (e.clientY - rect.top) * ratio;
    };

    const onPointerDown = (e: PointerEvent) => {
      const s = stateRef.current;
      if (s !== "playing") {
        startGame();
        return;
      }
      pointerYRef.current = canvasYFromEvent(e);
      shootHeldRef.current = true;
      tryShoot();
      canvas?.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (pointerYRef.current === null) return;
      pointerYRef.current = canvasYFromEvent(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      pointerYRef.current = null;
      shootHeldRef.current = false;
      try {
        canvas?.releasePointerCapture(e.pointerId);
      } catch {}
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas?.addEventListener("pointerdown", onPointerDown);
    canvas?.addEventListener("pointermove", onPointerMove);
    canvas?.addEventListener("pointerup", onPointerUp);
    canvas?.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas?.removeEventListener("pointerdown", onPointerDown);
      canvas?.removeEventListener("pointermove", onPointerMove);
      canvas?.removeEventListener("pointerup", onPointerUp);
      canvas?.removeEventListener("pointercancel", onPointerUp);
    };
  }, [startGame, tryShoot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      const state = stateRef.current;
      const stars = starsRef.current;
      const clouds = cloudsRef.current;
      const bullets = bulletsRef.current;
      const enemies = enemiesRef.current;

      for (const s of stars) {
        s.x -= s.s;
        if (s.x < 0) {
          s.x = WIDTH;
          s.y = Math.random() * HEIGHT * 0.75;
        }
      }
      for (const c of clouds) {
        c.x -= c.s;
        if (c.x + c.w < 0) {
          c.x = WIDTH + Math.random() * 120;
          c.y = Math.random() * HEIGHT * 0.55 + 20;
        }
      }

      if (state === "playing") {
        if (upRef.current) playerYRef.current -= PLAYER_SPEED;
        if (downRef.current) playerYRef.current += PLAYER_SPEED;
        if (pointerYRef.current !== null) {
          const target = pointerYRef.current;
          const dy = target - playerYRef.current;
          const maxStep = PLAYER_SPEED * 1.3;
          playerYRef.current +=
            Math.abs(dy) < maxStep ? dy : Math.sign(dy) * maxStep;
        }
        const minY = PLAYER_H / 2;
        const maxY = HEIGHT - PLAYER_H / 2;
        if (playerYRef.current < minY) playerYRef.current = minY;
        if (playerYRef.current > maxY) playerYRef.current = maxY;

        if (shootHeldRef.current) tryShoot();

        for (const b of bullets) b.x += BULLET_SPEED;
        while (bullets.length && bullets[0].x > WIDTH) bullets.shift();

        const enemySpeed = Math.min(
          ENEMY_SPEED_MAX,
          ENEMY_BASE_SPEED + scoreRef.current * ENEMY_SPEED_PER_SCORE,
        );
        for (const e of enemies) e.x -= enemySpeed;
        for (let i = enemies.length - 1; i >= 0; i--) {
          if (enemies[i].x + ENEMY_SIZE < 0) enemies.splice(i, 1);
        }

        const now = performance.now();
        const spawnInterval = Math.max(
          ENEMY_SPAWN_MIN_MS,
          ENEMY_SPAWN_BASE_MS - scoreRef.current * 12,
        );
        if (now - lastSpawnRef.current > spawnInterval) {
          lastSpawnRef.current = now;
          enemies.push({
            x: WIDTH + ENEMY_SIZE,
            y:
              Math.random() * (HEIGHT - ENEMY_SIZE - 40) +
              20 +
              ENEMY_SIZE / 2,
          });
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          let hit = false;
          for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (
              b.x + BULLET_W / 2 > e.x &&
              b.x - BULLET_W / 2 < e.x + ENEMY_SIZE &&
              b.y + BULLET_H / 2 > e.y - ENEMY_SIZE / 2 &&
              b.y - BULLET_H / 2 < e.y + ENEMY_SIZE / 2
            ) {
              bullets.splice(j, 1);
              hit = true;
              break;
            }
          }
          if (hit) {
            enemies.splice(i, 1);
            scoreRef.current += 1;
            setScore(scoreRef.current);
          }
        }

        const px = PLAYER_X;
        const py = playerYRef.current - PLAYER_H / 2;
        const pw = PLAYER_W * 0.55;
        const ph = PLAYER_H * 0.85;
        const pcx = px + PLAYER_W / 2 - pw / 2;
        const pcy = py + (PLAYER_H - ph) / 2;
        for (const e of enemies) {
          if (
            pcx + pw > e.x &&
            pcx < e.x + ENEMY_SIZE &&
            pcy + ph > e.y - ENEMY_SIZE / 2 &&
            pcy < e.y + ENEMY_SIZE / 2
          ) {
            const finalScore = scoreRef.current;
            setScore(finalScore);
            setHighScore((hs) => (finalScore > hs ? finalScore : hs));
            setGameState("gameover");
            break;
          }
        }
      }

      draw(
        ctx,
        playerYRef.current,
        bulletsRef.current,
        enemiesRef.current,
        starsRef.current,
        cloudsRef.current,
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
  }, [tryShoot]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-linear-to-b from-slate-950 via-indigo-950 to-purple-900 p-4">
      <div
        className="relative shadow-2xl rounded-lg overflow-hidden"
        style={{ width: WIDTH, height: HEIGHT, maxWidth: "100%" }}
      >
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="block touch-none cursor-crosshair select-none w-full h-auto"
        />

        {gameState === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-black/40 backdrop-blur-[1px]">
            <h1 className="text-white text-5xl font-black tracking-tight drop-shadow-[0_4px_0_rgba(0,0,0,0.6)]">
              MarkusShooter
            </h1>
            <button
              onClick={startGame}
              className="px-12 py-4 bg-yellow-400 hover:bg-yellow-300 text-black text-3xl font-black rounded-full shadow-lg border-4 border-black transition-transform hover:scale-105 active:scale-95"
            >
              PLAY
            </button>
            <div className="text-white/90 text-sm font-medium text-center px-6 leading-relaxed">
              ↑ / ↓ or W / S to move
              <br />
              Space to shoot — tap / hold on touch
            </div>
          </div>
        )}

        {gameState === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/55">
            <h2 className="text-white text-5xl font-black drop-shadow-[0_4px_0_rgba(0,0,0,0.6)]">
              Game Over
            </h2>
            <div className="text-white text-2xl font-bold">
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

function draw(
  ctx: CanvasRenderingContext2D,
  playerY: number,
  bullets: Bullet[],
  enemies: Enemy[],
  stars: Star[],
  clouds: Cloud[],
  img: HTMLImageElement | null,
  imgReady: boolean,
  score: number,
  showScore: boolean,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#020617");
  sky.addColorStop(0.6, "#1e1b4b");
  sky.addColorStop(1, "#4c1d95");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#ffffff";
  for (const s of stars) {
    ctx.globalAlpha = 0.5 + s.s;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const c of clouds) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const ground = ctx.createLinearGradient(0, HEIGHT - 60, 0, HEIGHT);
  ground.addColorStop(0, "rgba(0,0,0,0)");
  ground.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = ground;
  ctx.fillRect(0, HEIGHT - 60, WIDTH, 60);

  for (const e of enemies) drawEnemy(ctx, e);

  ctx.fillStyle = "#fde047";
  for (const b of bullets) {
    ctx.fillRect(b.x - BULLET_W / 2, b.y - BULLET_H / 2, BULLET_W, BULLET_H);
    ctx.fillStyle = "rgba(253, 224, 71, 0.4)";
    ctx.fillRect(
      b.x - BULLET_W / 2 - 6,
      b.y - BULLET_H / 2,
      6,
      BULLET_H,
    );
    ctx.fillStyle = "#fde047";
  }

  drawPlayer(ctx, img, imgReady, playerY);

  if (showScore) {
    ctx.save();
    ctx.font = "900 40px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillStyle = "#ffffff";
    const text = String(score);
    ctx.strokeText(text, WIDTH - 20, 16);
    ctx.fillText(text, WIDTH - 20, 16);
    ctx.restore();
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const x = e.x;
  const y = e.y - ENEMY_SIZE / 2;
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(x, y, ENEMY_SIZE, ENEMY_SIZE);
  ctx.fillStyle = "#991b1b";
  ctx.fillRect(x, y, ENEMY_SIZE, ENEMY_SIZE * 0.2);
  ctx.fillStyle = "#fecaca";
  ctx.fillRect(
    x + ENEMY_SIZE * 0.15,
    y + ENEMY_SIZE * 0.35,
    ENEMY_SIZE * 0.2,
    ENEMY_SIZE * 0.15,
  );
  ctx.fillRect(
    x + ENEMY_SIZE * 0.65,
    y + ENEMY_SIZE * 0.35,
    ENEMY_SIZE * 0.2,
    ENEMY_SIZE * 0.15,
  );
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, ENEMY_SIZE, ENEMY_SIZE);
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  imgReady: boolean,
  centerY: number,
) {
  const x = PLAYER_X;
  const y = centerY - PLAYER_H / 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(
    x + PLAYER_W / 2,
    centerY + PLAYER_H / 2 + 4,
    PLAYER_W * 0.35,
    6,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  if (imgReady && img) {
    ctx.save();
    ctx.translate(x + PLAYER_W, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, PLAYER_W, PLAYER_H);
    ctx.restore();
  } else {
    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(x, y, PLAYER_W, PLAYER_H);
  }
}
