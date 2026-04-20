"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WIDTH = 720;
const HEIGHT = 640;
const GRAVITY = 0.042;
const FLAP = -2.52;
const SCROLL = 2.5;
const PIPE_GAP = 328;
const PIPE_GAP_SHRINK = 0.95;
const PIPE_WIDTH = 70;
const PIPE_SPACING = 260;
const GROUND_H = 60;
const PLAYER_W = 72;
const PLAYER_H = 56;
const PLAYER_X = 110;
const PIPE_GAP_MIN = PLAYER_H + 40;
const MAX_GAPY_DELTA = HEIGHT / 5;

type Pipe = { x: number; gapY: number; gap: number; scored: boolean };
type GameState = "menu" | "playing" | "gameover";
type HitMask = {
  minY: Int16Array;
  maxY: Int16Array;
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgReadyRef = useRef(false);
  const jumpSoundRef = useRef<HTMLAudioElement | null>(null);
  const maskRef = useRef<HitMask | null>(null);

  const playerRef = useRef({ y: HEIGHT / 2, vy: 0 });
  const pipesRef = useRef<Pipe[]>([]);
  const distanceRef = useRef(0);
  const passedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<GameState>("menu");

  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  const resetWorld = useCallback(() => {
    playerRef.current = { y: HEIGHT / 2, vy: FLAP };
    const g1 = randomGapY(PIPE_GAP);
    const g2 = randomGapY(PIPE_GAP, g1);
    const g3 = randomGapY(PIPE_GAP, g2);
    pipesRef.current = [
      { x: WIDTH + 100, gapY: g1, gap: PIPE_GAP, scored: false },
      { x: WIDTH + 100 + PIPE_SPACING, gapY: g2, gap: PIPE_GAP, scored: false },
      { x: WIDTH + 100 + PIPE_SPACING * 2, gapY: g3, gap: PIPE_GAP, scored: false },
    ];
    distanceRef.current = 0;
    passedRef.current = 0;
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
    img.src = "/markus.png";
    img.onload = () => {
      imgReadyRef.current = true;
      maskRef.current = buildMask(img);
    };
    imgRef.current = img;

    const audio = new Audio("/markus-jump.mp3");
    audio.preload = "auto";
    audio.volume = 0.6;
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

        for (const p of pipes) {
          p.x -= SCROLL;
          if (!p.scored && p.x + PIPE_WIDTH < PLAYER_X) {
            p.scored = true;
            passedRef.current += 1;
          }
        }
        while (pipes.length && pipes[0].x + PIPE_WIDTH < 0) pipes.shift();
        const last = pipes[pipes.length - 1];
        if (!last || last.x < WIDTH - PIPE_SPACING) {
          const nextGap = Math.max(
            PIPE_GAP_MIN,
            PIPE_GAP * Math.pow(PIPE_GAP_SHRINK, passedRef.current),
          );
          pipes.push({
            x: (last?.x ?? WIDTH) + PIPE_SPACING,
            gapY: randomGapY(nextGap, last?.gapY),
            gap: nextGap,
            scored: false,
          });
        }

        distanceRef.current += SCROLL;

        if (collides(player.y, pipes, maskRef.current)) {
          const finalDist = Math.floor(distanceRef.current);
          setScore(finalDist);
          setHighScore((hs) => (finalDist > hs ? finalDist : hs));
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
        imgRef.current,
        imgReadyRef.current,
        Math.floor(distanceRef.current),
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
            <h1 className="text-white text-6xl font-black tracking-tight drop-shadow-[0_4px_0_rgba(0,0,0,0.6)]">
              FloppyMarkus
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
            <div className="text-white text-2xl font-bold">
              Distance: <span className="text-yellow-300">{score}</span>
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

function randomGapY(gap: number, prevGapY?: number) {
  const margin = 60;
  const min = margin + gap / 2;
  const max = HEIGHT - GROUND_H - margin - gap / 2;
  let lo = min;
  let hi = max;
  if (prevGapY !== undefined) {
    lo = Math.max(min, prevGapY - MAX_GAPY_DELTA);
    hi = Math.min(max, prevGapY + MAX_GAPY_DELTA);
  }
  return Math.random() * (hi - lo) + lo;
}

function collides(playerY: number, pipes: Pipe[], mask: HitMask | null) {
  if (!mask) {
    if (playerY < 0) return true;
    if (playerY + PLAYER_H > HEIGHT - GROUND_H) return true;
    for (const p of pipes) {
      if (PLAYER_X + PLAYER_W < p.x || PLAYER_X > p.x + PIPE_WIDTH) continue;
      const gapTop = p.gapY - p.gap / 2;
      const gapBot = p.gapY + p.gap / 2;
      if (playerY < gapTop || playerY + PLAYER_H > gapBot) return true;
    }
    return false;
  }

  const floorY = HEIGHT - GROUND_H;
  for (let x = 0; x < PLAYER_W; x++) {
    const minY = mask.minY[x];
    if (minY < 0) continue;
    const maxY = mask.maxY[x];
    const screenX = PLAYER_X + x;
    const topY = playerY + minY;
    const botY = playerY + maxY;

    if (topY < 0) return true;
    if (botY >= floorY) return true;

    for (const p of pipes) {
      if (screenX < p.x || screenX >= p.x + PIPE_WIDTH) continue;
      const gapTop = p.gapY - p.gap / 2;
      const gapBot = p.gapY + p.gap / 2;
      if (topY < gapTop || botY >= gapBot) return true;
    }
  }
  return false;
}

function buildMask(img: HTMLImageElement): HitMask {
  const off = document.createElement("canvas");
  off.width = PLAYER_W;
  off.height = PLAYER_H;
  const oc = off.getContext("2d")!;
  oc.translate(PLAYER_W / 2, PLAYER_H / 2);
  oc.rotate(Math.PI / 2);
  oc.drawImage(img, -PLAYER_H / 2, -PLAYER_W / 2, PLAYER_H, PLAYER_W);
  const data = oc.getImageData(0, 0, PLAYER_W, PLAYER_H).data;

  const minY = new Int16Array(PLAYER_W).fill(-1);
  const maxY = new Int16Array(PLAYER_W).fill(-1);
  const ALPHA_THRESHOLD = 32;

  for (let y = 0; y < PLAYER_H; y++) {
    for (let x = 0; x < PLAYER_W; x++) {
      const a = data[(y * PLAYER_W + x) * 4 + 3];
      if (a >= ALPHA_THRESHOLD) {
        if (minY[x] === -1) minY[x] = y;
        maxY[x] = y;
      }
    }
  }

  return { minY, maxY };
}

function draw(
  ctx: CanvasRenderingContext2D,
  player: { y: number; vy: number },
  pipes: Pipe[],
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
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 140 + (performance.now() / 80) % 560) % (WIDTH + 80)) - 40;
    const cy = 80 + (i % 2) * 60;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.arc(cx + 20, cy + 4, 18, 0, Math.PI * 2);
    ctx.arc(cx - 20, cy + 4, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of pipes) {
    const gapTop = p.gapY - p.gap / 2;
    const gapBot = p.gapY + p.gap / 2;
    drawPipe(ctx, p.x, 0, PIPE_WIDTH, gapTop, true);
    drawPipe(
      ctx,
      p.x,
      gapBot,
      PIPE_WIDTH,
      HEIGHT - GROUND_H - gapBot,
      false,
    );
  }

  ctx.fillStyle = "#a16207";
  ctx.fillRect(0, HEIGHT - GROUND_H, WIDTH, GROUND_H);
  ctx.fillStyle = "#65a30d";
  ctx.fillRect(0, HEIGHT - GROUND_H, WIDTH, 10);

  const tilt = Math.max(-0.4, Math.min(1.0, player.vy / 12));
  ctx.save();
  ctx.translate(PLAYER_X + PLAYER_W / 2, player.y + PLAYER_H / 2);
  ctx.rotate(Math.PI / 2 + tilt);
  if (imgReady && img) {
    ctx.drawImage(img, -PLAYER_H / 2, -PLAYER_W / 2, PLAYER_H, PLAYER_W);
  } else {
    ctx.fillStyle = "#fde047";
    ctx.fillRect(-PLAYER_H / 2, -PLAYER_W / 2, PLAYER_H, PLAYER_W);
  }
  ctx.restore();

  if (showScore) {
    ctx.save();
    ctx.font = "900 48px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillStyle = "#ffffff";
    const text = String(score);
    ctx.strokeText(text, WIDTH / 2, 20);
    ctx.fillText(text, WIDTH / 2, 20);
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

  const lipH = 24;
  const lipX = x - 4;
  const lipW = w + 8;
  const lipY = flip ? y + h - lipH : y;
  ctx.fillStyle = "#15803d";
  ctx.fillRect(lipX, lipY, lipW, lipH);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(lipX + 4, lipY + 4, lipW - 8, lipH - 8);
}
