"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VIEW_W = 960;
const VIEW_H = 600;

const WORLD_W = 2400;
const WORLD_H = 1800;

const PLAYER_W = 42;
const PLAYER_H = 64;
const PLAYER_SPEED = 3.4;

const BULLET_SPEED = 9;
const BULLET_R = 4;
const BULLET_LIFE_MS = 1200;
const SHOOT_COOLDOWN_MS = 180;

const ENEMY_SIZE = 40;
const ENEMY_SPEED = 1.4;
const ENEMY_MAX = 8;
const ENEMY_SPAWN_MS = 1600;

const BLOCK = 320;
const ROAD = 80;
const FJORD_Y = WORLD_H - 280;

const PLAYER_MAX_HP = 5;

const BANK_W = 220;
const BANK_H = 180;
const BANK_X = 1040;
const BANK_Y = 560;
const ROB_RANGE = 50;
const ROB_DURATION_FRAMES = 150;
const ROB_COOLDOWN_MS = 15000;
const ROB_REWARD = 500;
const ROB_POLICE_COUNT = 5;

type GameState = "menu" | "playing" | "gameover";
type Bullet = { x: number; y: number; vx: number; vy: number; born: number };
type Enemy = { x: number; y: number; hp: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

type Building = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  roof: string;
  bank?: boolean;
};

function buildCity(): Building[] {
  const buildings: Building[] = [];
  const palette = [
    ["#c9b27a", "#8f7a48"],
    ["#b87a5a", "#7a4a32"],
    ["#9aa7b5", "#5f6c7a"],
    ["#d8c1a0", "#9c8055"],
    ["#a69680", "#6b5d48"],
    ["#8a6f5c", "#55402e"],
  ];
  for (let bx = 0; bx < WORLD_W; bx += BLOCK) {
    for (let by = 0; by < FJORD_Y; by += BLOCK) {
      const startX = bx + ROAD;
      const startY = by + ROAD;
      const blockW = BLOCK - ROAD;
      const blockH = BLOCK - ROAD;
      if (startX >= WORLD_W - 20 || startY >= FJORD_Y - 20) continue;

      const cols = 2;
      const rows = 2;
      const pad = 16;
      const cellW = (blockW - pad * (cols + 1)) / cols;
      const cellH = (blockH - pad * (rows + 1)) / rows;
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if (Math.random() < 0.15) continue;
          const jitterW = cellW * (0.78 + Math.random() * 0.22);
          const jitterH = cellH * (0.78 + Math.random() * 0.22);
          const px = startX + pad + cx * (cellW + pad) + (cellW - jitterW) / 2;
          const py = startY + pad + cy * (cellH + pad) + (cellH - jitterH) / 2;
          if (px + jitterW > WORLD_W - 10 || py + jitterH > FJORD_Y - 10) continue;
          if (
            rectsCollide(
              px - 12,
              py - 12,
              jitterW + 24,
              jitterH + 24,
              BANK_X,
              BANK_Y,
              BANK_W,
              BANK_H,
            )
          ) {
            continue;
          }
          const pc = palette[Math.floor(Math.random() * palette.length)];
          buildings.push({
            x: px,
            y: py,
            w: jitterW,
            h: jitterH,
            color: pc[0],
            roof: pc[1],
          });
        }
      }
    }
  }
  buildings.push({
    x: BANK_X,
    y: BANK_Y,
    w: BANK_W,
    h: BANK_H,
    color: "#f1e4b8",
    roof: "#b8923f",
    bank: true,
  });
  return buildings;
}

function distPointToRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
) {
  const dx = Math.max(rx - px, 0, px - (rx + rw));
  const dy = Math.max(ry - py, 0, py - (ry + rh));
  return Math.hypot(dx, dy);
}

function rectsCollide(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgReadyRef = useRef(false);

  const playerRef = useRef({ x: 1000, y: 680, angle: 0 });
  const hpRef = useRef(PLAYER_MAX_HP);
  const bulletsRef = useRef<Bullet[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const buildingsRef = useRef<Building[]>([]);
  const scoreRef = useRef(0);
  const lastShotRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseRef = useRef({ x: VIEW_W / 2, y: VIEW_H / 2, down: false });
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<GameState>("menu");
  const flashRef = useRef(0);
  const robProgressRef = useRef(0);
  const robCooldownUntilRef = useRef(0);
  const robbedFlashRef = useRef(0);
  const robAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [hp, setHp] = useState(PLAYER_MAX_HP);
  const [showIntro, setShowIntro] = useState(true);
  const [musicMuted, setMusicMuted] = useState(false);
  const introVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    buildingsRef.current = buildCity();
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = "/italiensk-markus.png";
    img.onload = () => {
      imgReadyRef.current = true;
    };
    imgRef.current = img;

    const audio = new Audio("/bank-rob.mp3");
    audio.preload = "auto";
    audio.volume = 0.7;
    robAudioRef.current = audio;

    const music = new Audio("/gta-music.mp3");
    music.preload = "auto";
    music.loop = true;
    music.volume = 0.35;
    musicRef.current = music;

    return () => {
      music.pause();
      music.src = "";
    };
  }, []);

  const resetWorld = useCallback(() => {
    playerRef.current = { x: 1000, y: 680, angle: 0 };
    hpRef.current = PLAYER_MAX_HP;
    bulletsRef.current = [];
    enemiesRef.current = [];
    particlesRef.current = [];
    scoreRef.current = 0;
    lastShotRef.current = 0;
    lastSpawnRef.current = performance.now();
    flashRef.current = 0;
    robProgressRef.current = 0;
    robCooldownUntilRef.current = 0;
    robbedFlashRef.current = 0;
    const a = robAudioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setScore(0);
    setHp(PLAYER_MAX_HP);
  }, []);

  const startGame = useCallback(() => {
    resetWorld();
    setGameState("playing");
  }, [resetWorld]);

  const tryShoot = useCallback(() => {
    const now = performance.now();
    if (now - lastShotRef.current < SHOOT_COOLDOWN_MS) return;
    lastShotRef.current = now;
    const p = playerRef.current;
    const muzzleX = p.x + Math.cos(p.angle) * 28;
    const muzzleY = p.y + Math.sin(p.angle) * 28;
    bulletsRef.current.push({
      x: muzzleX,
      y: muzzleY,
      vx: Math.cos(p.angle) * BULLET_SPEED,
      vy: Math.sin(p.angle) * BULLET_SPEED,
      born: now,
    });
    for (let i = 0; i < 4; i++) {
      particlesRef.current.push({
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(p.angle) * (1 + Math.random() * 2) + (Math.random() - 0.5),
        vy: Math.sin(p.angle) * (1 + Math.random() * 2) + (Math.random() - 0.5),
        life: 18,
        color: Math.random() < 0.5 ? "#fde047" : "#fb923c",
      });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === "Space" || e.code === "Enter") {
        if (stateRef.current !== "playing") {
          startGame();
          e.preventDefault();
        }
      }
      if (
        ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const canvasCoords = (e: PointerEvent | MouseEvent) => {
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const sx = VIEW_W / rect.width;
      const sy = VIEW_H / rect.height;
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (stateRef.current !== "playing") {
        startGame();
        return;
      }
      const c = canvasCoords(e);
      mouseRef.current.x = c.x;
      mouseRef.current.y = c.y;
      mouseRef.current.down = true;
      tryShoot();
      canvas?.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const c = canvasCoords(e);
      mouseRef.current.x = c.x;
      mouseRef.current.y = c.y;
    };
    const onPointerUp = (e: PointerEvent) => {
      mouseRef.current.down = false;
      try {
        canvas?.releasePointerCapture(e.pointerId);
      } catch {}
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas?.addEventListener("pointerdown", onPointerDown);
    canvas?.addEventListener("pointermove", onPointerMove);
    canvas?.addEventListener("pointerup", onPointerUp);
    canvas?.addEventListener("pointercancel", onPointerUp);
    canvas?.addEventListener("contextmenu", onContextMenu);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas?.removeEventListener("pointerdown", onPointerDown);
      canvas?.removeEventListener("pointermove", onPointerMove);
      canvas?.removeEventListener("pointerup", onPointerUp);
      canvas?.removeEventListener("pointercancel", onPointerUp);
      canvas?.removeEventListener("contextmenu", onContextMenu);
    };
  }, [startGame, tryShoot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const collideWithBuildings = (x: number, y: number, r: number) => {
      for (const b of buildingsRef.current) {
        if (rectsCollide(x - r, y - r, r * 2, r * 2, b.x, b.y, b.w, b.h)) {
          return b;
        }
      }
      return null;
    };

    const loop = () => {
      const state = stateRef.current;
      const player = playerRef.current;
      const keys = keysRef.current;

      if (state === "playing") {
        let mx = 0;
        let my = 0;
        if (keys["KeyW"] || keys["ArrowUp"]) my -= 1;
        if (keys["KeyS"] || keys["ArrowDown"]) my += 1;
        if (keys["KeyA"] || keys["ArrowLeft"]) mx -= 1;
        if (keys["KeyD"] || keys["ArrowRight"]) mx += 1;
        if (mx !== 0 || my !== 0) {
          const len = Math.hypot(mx, my);
          mx /= len;
          my /= len;
          const nx = player.x + mx * PLAYER_SPEED;
          const ny = player.y + my * PLAYER_SPEED;
          const pr = 18;
          if (!collideWithBuildings(nx, player.y, pr)) player.x = nx;
          if (!collideWithBuildings(player.x, ny, pr)) player.y = ny;
          if (player.x < pr) player.x = pr;
          if (player.x > WORLD_W - pr) player.x = WORLD_W - pr;
          if (player.y < pr) player.y = pr;
          if (player.y > FJORD_Y - pr) player.y = FJORD_Y - pr;
        }

        const camX = Math.max(0, Math.min(WORLD_W - VIEW_W, player.x - VIEW_W / 2));
        const camY = Math.max(0, Math.min(WORLD_H - VIEW_H, player.y - VIEW_H / 2));
        const mouseWorldX = mouseRef.current.x + camX;
        const mouseWorldY = mouseRef.current.y + camY;
        player.angle = Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);

        if (mouseRef.current.down) tryShoot();

        const now = performance.now();
        const bullets = bulletsRef.current;
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.vx;
          b.y += b.vy;
          if (
            now - b.born > BULLET_LIFE_MS ||
            b.x < 0 ||
            b.x > WORLD_W ||
            b.y < 0 ||
            b.y > WORLD_H
          ) {
            bullets.splice(i, 1);
            continue;
          }
          const hit = collideWithBuildings(b.x, b.y, BULLET_R);
          if (hit) {
            for (let k = 0; k < 5; k++) {
              particlesRef.current.push({
                x: b.x,
                y: b.y,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                life: 14,
                color: "#d6d3d1",
              });
            }
            bullets.splice(i, 1);
          }
        }

        const enemies = enemiesRef.current;
        if (
          enemies.length < ENEMY_MAX &&
          now - lastSpawnRef.current > ENEMY_SPAWN_MS
        ) {
          lastSpawnRef.current = now;
          for (let tries = 0; tries < 10; tries++) {
            const edge = Math.floor(Math.random() * 4);
            let ex = 0;
            let ey = 0;
            if (edge === 0) {
              ex = Math.random() * WORLD_W;
              ey = 40;
            } else if (edge === 1) {
              ex = Math.random() * WORLD_W;
              ey = FJORD_Y - 40;
            } else if (edge === 2) {
              ex = 40;
              ey = Math.random() * FJORD_Y;
            } else {
              ex = WORLD_W - 40;
              ey = Math.random() * FJORD_Y;
            }
            if (!collideWithBuildings(ex, ey, ENEMY_SIZE / 2)) {
              enemies.push({ x: ex, y: ey, hp: 2 });
              break;
            }
          }
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          const dx = player.x - e.x;
          const dy = player.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          const nx = e.x + (dx / d) * ENEMY_SPEED;
          const ny = e.y + (dy / d) * ENEMY_SPEED;
          const er = ENEMY_SIZE / 2;
          if (!collideWithBuildings(nx, e.y, er)) e.x = nx;
          else e.x += (Math.random() - 0.5) * 2;
          if (!collideWithBuildings(e.x, ny, er)) e.y = ny;
          else e.y += (Math.random() - 0.5) * 2;

          for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (
              b.x > e.x - er &&
              b.x < e.x + er &&
              b.y > e.y - er &&
              b.y < e.y + er
            ) {
              bullets.splice(j, 1);
              e.hp -= 1;
              for (let k = 0; k < 8; k++) {
                particlesRef.current.push({
                  x: e.x,
                  y: e.y,
                  vx: (Math.random() - 0.5) * 4,
                  vy: (Math.random() - 0.5) * 4,
                  life: 22,
                  color: "#ef4444",
                });
              }
              if (e.hp <= 0) {
                enemies.splice(i, 1);
                scoreRef.current += 10;
                setScore(scoreRef.current);
              }
              break;
            }
          }

          if (i < enemies.length && enemies[i] === e) {
            const pdx = player.x - e.x;
            const pdy = player.y - e.y;
            if (Math.hypot(pdx, pdy) < 28) {
              hpRef.current -= 1;
              setHp(hpRef.current);
              flashRef.current = 12;
              const ang = Math.atan2(-pdy, -pdx);
              e.x += Math.cos(ang) * 18;
              e.y += Math.sin(ang) * 18;
              if (hpRef.current <= 0) {
                const finalScore = scoreRef.current;
                setHighScore((hs) => (finalScore > hs ? finalScore : hs));
                setGameState("gameover");
              }
            }
          }
        }

        const particles = particlesRef.current;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.92;
          p.vy *= 0.92;
          p.life -= 1;
          if (p.life <= 0) particles.splice(i, 1);
        }

        if (flashRef.current > 0) flashRef.current -= 1;
        if (robbedFlashRef.current > 0) robbedFlashRef.current -= 1;

        const bankDist = distPointToRect(
          player.x,
          player.y,
          BANK_X,
          BANK_Y,
          BANK_W,
          BANK_H,
        );
        const nearBank = bankDist < ROB_RANGE;
        const onCooldown = now < robCooldownUntilRef.current;
        if (nearBank && !onCooldown && keys["KeyE"]) {
          if (robProgressRef.current === 0) {
            const a = robAudioRef.current;
            if (a) {
              a.currentTime = 0;
              a.play().catch(() => {});
            }
          }
          robProgressRef.current += 1;
          if (Math.random() < 0.35) {
            particlesRef.current.push({
              x: BANK_X + BANK_W / 2 + (Math.random() - 0.5) * BANK_W * 0.6,
              y: BANK_Y + BANK_H - 10,
              vx: (Math.random() - 0.5) * 1.5,
              vy: -1 - Math.random() * 1.5,
              life: 30,
              color: "#fde047",
            });
          }
          if (robProgressRef.current >= ROB_DURATION_FRAMES) {
            robProgressRef.current = 0;
            robCooldownUntilRef.current = now + ROB_COOLDOWN_MS;
            robbedFlashRef.current = 90;
            scoreRef.current += ROB_REWARD;
            setScore(scoreRef.current);
            for (let k = 0; k < 24; k++) {
              particlesRef.current.push({
                x: BANK_X + BANK_W / 2,
                y: BANK_Y + BANK_H - 20,
                vx: (Math.random() - 0.5) * 6,
                vy: -2 - Math.random() * 4,
                life: 40,
                color: Math.random() < 0.6 ? "#fde047" : "#16a34a",
              });
            }
            for (let k = 0; k < ROB_POLICE_COUNT; k++) {
              for (let t = 0; t < 8; t++) {
                const ang = Math.random() * Math.PI * 2;
                const dist = 420 + Math.random() * 220;
                const ex = BANK_X + BANK_W / 2 + Math.cos(ang) * dist;
                const ey = BANK_Y + BANK_H / 2 + Math.sin(ang) * dist;
                if (
                  ex < 40 ||
                  ex > WORLD_W - 40 ||
                  ey < 40 ||
                  ey > FJORD_Y - 40
                ) {
                  continue;
                }
                if (!collideWithBuildings(ex, ey, ENEMY_SIZE / 2)) {
                  enemiesRef.current.push({ x: ex, y: ey, hp: 2 });
                  break;
                }
              }
            }
          }
        } else {
          if (!keys["KeyE"] || !nearBank) {
            robProgressRef.current = Math.max(0, robProgressRef.current - 2);
          }
        }
      }

      const camX = Math.max(0, Math.min(WORLD_W - VIEW_W, player.x - VIEW_W / 2));
      const camY = Math.max(0, Math.min(WORLD_H - VIEW_H, player.y - VIEW_H / 2));

      const bankDistForDraw = distPointToRect(
        player.x,
        player.y,
        BANK_X,
        BANK_Y,
        BANK_W,
        BANK_H,
      );
      const nearBankForDraw = bankDistForDraw < ROB_RANGE;
      const robCoolRemaining = Math.max(
        0,
        robCooldownUntilRef.current - performance.now(),
      );

      draw(
        ctx,
        camX,
        camY,
        player,
        bulletsRef.current,
        enemiesRef.current,
        particlesRef.current,
        buildingsRef.current,
        imgRef.current,
        imgReadyRef.current,
        scoreRef.current,
        hpRef.current,
        flashRef.current,
        state === "playing",
        robProgressRef.current / ROB_DURATION_FRAMES,
        robCoolRemaining,
        robbedFlashRef.current,
        nearBankForDraw && state === "playing",
      );

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [tryShoot]);

  const closeIntro = () => {
    const v = introVideoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    setShowIntro(false);
    const m = musicRef.current;
    if (m && !musicMuted) {
      m.play().catch(() => {});
    }
  };

  const toggleMusic = () => {
    const m = musicRef.current;
    if (!m) return;
    if (musicMuted) {
      m.play().catch(() => {});
      setMusicMuted(false);
    } else {
      m.pause();
      setMusicMuted(true);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 p-4">
      {showIntro && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeIntro();
          }}
        >
          <div className="relative w-full max-w-4xl mx-4 rounded-lg overflow-hidden border-4 border-yellow-400 shadow-2xl bg-black">
            <video
              ref={introVideoRef}
              src="/gta-intro.mp4"
              autoPlay
              playsInline
              controls
              onEnded={closeIntro}
              className="block w-full h-auto max-h-[80vh] bg-black"
            />
            <button
              onClick={closeIntro}
              aria-label="Lukk intro"
              className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/70 hover:bg-red-600 border-2 border-white text-white text-xl font-black flex items-center justify-center transition-colors"
            >
              ×
            </button>
            <button
              onClick={closeIntro}
              className="absolute bottom-4 right-4 px-5 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-black rounded-full border-2 border-black shadow-lg"
            >
              HOPP OVER
            </button>
          </div>
        </div>
      )}
      <div
        className="relative shadow-2xl rounded-lg overflow-hidden border-4 border-black"
        style={{ width: VIEW_W, height: VIEW_H, maxWidth: "100%" }}
      >
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          className="block touch-none cursor-crosshair select-none w-full h-auto"
        />

        {gameState === "playing" && (
          <div className="pointer-events-none absolute top-3 left-4 flex gap-2">
            {Array.from({ length: PLAYER_MAX_HP }).map((_, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded-sm border-2 border-black ${
                  i < hp ? "bg-red-500" : "bg-black/40"
                }`}
              />
            ))}
          </div>
        )}

        <button
          onClick={toggleMusic}
          aria-label={musicMuted ? "Slå på musikk" : "Slå av musikk"}
          className="absolute top-3 right-3 px-3 h-9 rounded-full bg-black/60 hover:bg-black/80 border-2 border-white/70 text-white text-xs font-bold tracking-wide flex items-center justify-center transition-colors"
        >
          {musicMuted ? "MUSIKK AV" : "MUSIKK PÅ"}
        </button>

        {gameState === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/60 backdrop-blur-[2px]">
            <h1 className="text-white text-6xl font-black tracking-tight drop-shadow-[0_4px_0_rgba(0,0,0,0.7)]">
              MARKUS: OSLO
            </h1>
            <p className="text-yellow-300 text-xl font-bold italic -mt-4">
              Italiensk-Markus løs i hovedstaden
            </p>
            <button
              onClick={startGame}
              className="px-14 py-4 bg-yellow-400 hover:bg-yellow-300 text-black text-3xl font-black rounded-full shadow-lg border-4 border-black transition-transform hover:scale-105 active:scale-95"
            >
              SPILL
            </button>
            <div className="text-white/90 text-sm font-medium text-center px-6 leading-relaxed">
              WASD / piltaster for å gå
              <br />
              Mus for å sikte — klikk eller hold for å skyte
              <br />
              Hold <span className="text-yellow-300 font-bold">E</span> nær banken for å rane (+{ROB_REWARD})
            </div>
          </div>
        )}

        {gameState === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70">
            <h2 className="text-white text-5xl font-black drop-shadow-[0_4px_0_rgba(0,0,0,0.7)]">
              GAME OVER
            </h2>
            <div className="text-white text-2xl font-bold">
              Score: <span className="text-yellow-300">{score}</span>
            </div>
            <div className="text-white/90 text-lg font-semibold">
              Beste: {highScore}
            </div>
            <button
              onClick={startGame}
              className="px-10 py-3 bg-yellow-400 hover:bg-yellow-300 text-black text-2xl font-black rounded-full shadow-lg border-4 border-black transition-transform hover:scale-105 active:scale-95"
            >
              Prøv igjen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  player: { x: number; y: number; angle: number },
  bullets: Bullet[],
  enemies: Enemy[],
  particles: Particle[],
  buildings: Building[],
  img: HTMLImageElement | null,
  imgReady: boolean,
  score: number,
  hp: number,
  flash: number,
  playing: boolean,
  robProgress: number,
  robCoolRemainingMs: number,
  robbedFlash: number,
  playerNearBank: boolean,
) {
  ctx.fillStyle = "#3d4a33";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const roadStep = BLOCK;
  ctx.fillStyle = "#2b2b2b";
  for (let wx = 0; wx < WORLD_W; wx += roadStep) {
    const sx = wx - camX;
    if (sx + ROAD < 0 || sx > VIEW_W) continue;
    ctx.fillRect(sx, 0, ROAD, VIEW_H);
  }
  for (let wy = 0; wy < FJORD_Y; wy += roadStep) {
    const sy = wy - camY;
    if (sy + ROAD < 0 || sy > VIEW_H) continue;
    ctx.fillRect(0, sy, VIEW_W, ROAD);
  }

  ctx.strokeStyle = "#f5d742";
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 14]);
  for (let wx = 0; wx < WORLD_W; wx += roadStep) {
    const sx = wx - camX + ROAD / 2;
    if (sx < -10 || sx > VIEW_W + 10) continue;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, VIEW_H);
    ctx.stroke();
  }
  for (let wy = 0; wy < FJORD_Y; wy += roadStep) {
    const sy = wy - camY + ROAD / 2;
    if (sy < -10 || sy > VIEW_H + 10) continue;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(VIEW_W, sy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const fjordScreenY = FJORD_Y - camY;
  if (fjordScreenY < VIEW_H) {
    const grad = ctx.createLinearGradient(0, fjordScreenY, 0, VIEW_H);
    grad.addColorStop(0, "#2563eb");
    grad.addColorStop(1, "#0b3d91");
    ctx.fillStyle = grad;
    ctx.fillRect(0, Math.max(0, fjordScreenY), VIEW_W, VIEW_H);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const wy = fjordScreenY + 30 + i * 40;
      if (wy < 0 || wy > VIEW_H) continue;
      ctx.beginPath();
      for (let wx = 0; wx < VIEW_W; wx += 20) {
        const off = Math.sin((wx + performance.now() * 0.02 + i * 30) * 0.05) * 3;
        if (wx === 0) ctx.moveTo(wx, wy + off);
        else ctx.lineTo(wx, wy + off);
      }
      ctx.stroke();
    }

    const opX = WORLD_W * 0.55 - camX;
    const opY = FJORD_Y - camY - 20;
    if (opX > -200 && opX < VIEW_W + 200) {
      ctx.fillStyle = "#f1f5f9";
      ctx.beginPath();
      ctx.moveTo(opX - 120, opY);
      ctx.lineTo(opX + 120, opY);
      ctx.lineTo(opX + 60, opY - 70);
      ctx.lineTo(opX - 60, opY - 70);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#334155";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("OPERAEN", opX, opY - 20);
    }
  }

  for (const b of buildings) {
    const sx = b.x - camX;
    const sy = b.y - camY;
    if (sx + b.w < 0 || sy + b.h < 0 || sx > VIEW_W || sy > VIEW_H) continue;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(sx + 4, sy + 4, b.w, b.h);

    if (b.bank) {
      drawBank(ctx, sx, sy, b.w, b.h, robCoolRemainingMs);
      continue;
    }

    ctx.fillStyle = b.color;
    ctx.fillRect(sx, sy, b.w, b.h);

    ctx.fillStyle = b.roof;
    ctx.fillRect(sx, sy, b.w, 10);

    ctx.fillStyle = "rgba(255,255,220,0.55)";
    const windowW = 10;
    const windowH = 12;
    const gap = 8;
    for (let wy = sy + 18; wy < sy + b.h - 12; wy += windowH + gap) {
      for (let wx = sx + 10; wx < sx + b.w - 10; wx += windowW + gap) {
        ctx.fillRect(wx, wy, windowW, windowH);
      }
    }

    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx, sy, b.w, b.h);
  }

  for (const p of particles) {
    const sx = p.x - camX;
    const sy = p.y - camY;
    ctx.globalAlpha = Math.min(1, p.life / 22);
    ctx.fillStyle = p.color;
    ctx.fillRect(sx - 2, sy - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#fde047";
  for (const b of bullets) {
    const sx = b.x - camX;
    const sy = b.y - camY;
    ctx.beginPath();
    ctx.arc(sx, sy, BULLET_R, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const e of enemies) {
    const sx = e.x - camX;
    const sy = e.y - camY;
    if (sx < -60 || sy < -60 || sx > VIEW_W + 60 || sy > VIEW_H + 60) continue;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + ENEMY_SIZE / 2, ENEMY_SIZE / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#991b1b";
    ctx.fillRect(sx - ENEMY_SIZE / 2, sy - ENEMY_SIZE / 2, ENEMY_SIZE, ENEMY_SIZE);
    ctx.fillStyle = "#f87171";
    ctx.fillRect(sx - ENEMY_SIZE / 2, sy - ENEMY_SIZE / 2, ENEMY_SIZE, 10);
    ctx.fillStyle = "#fecaca";
    ctx.fillRect(sx - 10, sy - 4, 5, 5);
    ctx.fillRect(sx + 5, sy - 4, 5, 5);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - ENEMY_SIZE / 2, sy - ENEMY_SIZE / 2, ENEMY_SIZE, ENEMY_SIZE);
  }

  {
    const sx = player.x - camX;
    const sy = player.y - camY;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + PLAYER_H / 2 - 4, PLAYER_W * 0.45, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(player.angle);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(8, -4, 32, 8);
    ctx.fillStyle = "#374151";
    ctx.fillRect(36, -3, 6, 6);
    ctx.restore();

    if (imgReady && img) {
      const facingLeft = Math.abs(player.angle) > Math.PI / 2;
      ctx.save();
      ctx.translate(sx, sy);
      if (facingLeft) ctx.scale(-1, 1);
      ctx.drawImage(img, -PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H);
      ctx.restore();
    } else {
      ctx.fillStyle = "#16a34a";
      ctx.fillRect(sx - PLAYER_W / 2, sy - PLAYER_H / 2, PLAYER_W, PLAYER_H);
    }
  }

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 0, 0, ${flash / 24})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  {
    const bankScreenX = BANK_X - camX;
    const bankScreenY = BANK_Y - camY;
    const barW = 160;
    const barH = 12;
    const barX = bankScreenX + BANK_W / 2 - barW / 2;
    const barY = bankScreenY - 28;
    const onCooldown = robCoolRemainingMs > 0;

    if (playerNearBank && onCooldown) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(barX - 6, barY - 4, barW + 12, 26);
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `LUKKET  ${Math.ceil(robCoolRemainingMs / 1000)}s`,
        barX + barW / 2,
        barY + 9,
      );
      ctx.restore();
    } else if (playerNearBank) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(barX - 6, barY - 22, barW + 12, barH + 30);
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("HOLD [E] FOR Å RANE", barX + barW / 2, barY - 10);
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(barX, barY, barW * Math.min(1, Math.max(0, robProgress)), barH);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.restore();
    }
  }

  if (robbedFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, robbedFlash / 30);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 56px system-ui, sans-serif";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#fde047";
    const text = `RANET!  +${ROB_REWARD}`;
    ctx.strokeText(text, VIEW_W / 2, VIEW_H / 2 - 90);
    ctx.fillText(text, VIEW_W / 2, VIEW_H / 2 - 90);
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.lineWidth = 4;
    const sub = "Politiet kommer!";
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#f87171";
    ctx.strokeText(sub, VIEW_W / 2, VIEW_H / 2 - 50);
    ctx.fillText(sub, VIEW_W / 2, VIEW_H / 2 - 50);
    ctx.restore();
  }

  if (playing) {
    ctx.save();
    ctx.font = "900 34px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillStyle = "#ffffff";
    const text = `${score}`;
    ctx.strokeText(text, VIEW_W - 16, 12);
    ctx.fillText(text, VIEW_W - 16, 12);
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeText("OSLO", VIEW_W - 16, 52);
    ctx.fillText("OSLO", VIEW_W - 16, 52);
    ctx.restore();
  }
}

function drawBank(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  w: number,
  h: number,
  cooldownMs: number,
) {
  const closed = cooldownMs > 0;

  ctx.fillStyle = closed ? "#d8c98a" : "#f1e4b8";
  ctx.fillRect(sx, sy, w, h);

  ctx.fillStyle = "#8a6b2c";
  ctx.fillRect(sx, sy + 22, w, 8);

  ctx.fillStyle = "#f5e6a6";
  ctx.beginPath();
  ctx.moveTo(sx, sy + 22);
  ctx.lineTo(sx + w, sy + 22);
  ctx.lineTo(sx + w / 2, sy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#fbfaf3";
  const colCount = 4;
  const colAreaX = sx + 14;
  const colAreaW = w - 28;
  const colSpacing = colAreaW / colCount;
  const colY = sy + 36;
  const colH = h - 70;
  for (let i = 0; i < colCount; i++) {
    const cx = colAreaX + colSpacing * i + colSpacing / 2 - 6;
    ctx.fillRect(cx, colY, 12, colH);
  }
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  for (let i = 0; i < colCount; i++) {
    const cx = colAreaX + colSpacing * i + colSpacing / 2 - 6;
    ctx.fillRect(cx + 9, colY, 3, colH);
  }

  ctx.fillStyle = "#ddd0a2";
  ctx.fillRect(sx + 10, sy + h - 26, w - 20, 8);

  const doorW = 42;
  const doorH = 46;
  const doorX = sx + w / 2 - doorW / 2;
  const doorY = sy + h - doorH - 4;
  ctx.fillStyle = closed ? "#1f2937" : "#4b3220";
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = "#e8c351";
  ctx.fillRect(doorX + doorW - 8, doorY + doorH / 2 - 2, 4, 4);

  ctx.save();
  ctx.fillStyle = "#b8923f";
  ctx.font = "900 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", sx + w / 2, sy + 14);

  ctx.fillStyle = "#3e2e12";
  ctx.font = "900 22px system-ui, sans-serif";
  ctx.fillText("BANK", sx + w / 2, sy + h / 2 - 4);
  ctx.restore();

  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, w, h);

  if (closed) {
    ctx.save();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sx + 8, sy + h - 50);
    ctx.lineTo(sx + w - 8, sy + 20);
    ctx.stroke();
    ctx.restore();
  }
}
