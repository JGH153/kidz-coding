"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WIDTH = 480;
const HEIGHT = 720;
const HORIZON_Y = HEIGHT * 0.35;
const PLAYER_Y = HEIGHT * 0.78;
const PLAYER_W = 96;
const PLAYER_H = 150;
const ROAD_FAR = 80;
const ROAD_NEAR = 520;
const BASE_SPEED = 0.00294;
const SPEED_RAMP = 0.000000525;
const SPAWN_GAP_Z = 0.32;
const HIT_Z_MIN = 0.86;
const HIT_Z_MAX = 1.02;
const JUMP_RISE = 12;
const JUMP_HOLD = 60;
const JUMP_FALL = 12;
const JUMP_DURATION = JUMP_RISE + JUMP_HOLD + JUMP_FALL;
const JUMP_HEIGHT = 150;
const OBSTACLE_BASE = 110;

type Lane = 0 | 1 | 2;
type Obstacle = { lane: Lane; z: number };
type GameState = "menu" | "playing" | "gameover";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgReadyRef = useRef(false);

  const laneRef = useRef<Lane>(1);
  const jumpFrameRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const distanceRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<GameState>("menu");

  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  const resetWorld = useCallback(() => {
    laneRef.current = 1;
    jumpFrameRef.current = 0;
    obstaclesRef.current = [
      { lane: pickLane(), z: 0 },
      { lane: pickLane(), z: -SPAWN_GAP_Z },
      { lane: pickLane(), z: -SPAWN_GAP_Z * 2 },
    ];
    distanceRef.current = 0;
    setScore(0);
  }, []);

  const startGame = useCallback(() => {
    resetWorld();
    setGameState("playing");
  }, [resetWorld]);

  const moveLane = useCallback((dir: -1 | 1) => {
    const next = Math.max(0, Math.min(2, laneRef.current + dir)) as Lane;
    laneRef.current = next;
  }, []);

  const jump = useCallback(() => {
    if (jumpFrameRef.current === 0) jumpFrameRef.current = 1;
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = "/markus-back.png";
    img.onload = () => {
      imgReadyRef.current = true;
    };
    imgRef.current = img;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (e.code === "ArrowLeft") {
        if (s === "playing") moveLane(-1);
        e.preventDefault();
      } else if (e.code === "ArrowRight") {
        if (s === "playing") moveLane(1);
        e.preventDefault();
      } else if (e.code === "Space" || e.code === "ArrowUp") {
        if (s === "playing") jump();
        else startGame();
        e.preventDefault();
      } else if (e.code === "Enter") {
        if (s !== "playing") startGame();
        e.preventDefault();
      }
    };

    let touchX = 0;
    let touchY = 0;
    let touchT = 0;
    const onPointerDown = (e: PointerEvent) => {
      touchX = e.clientX;
      touchY = e.clientY;
      touchT = performance.now();
    };
    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - touchX;
      const dy = e.clientY - touchY;
      const dt = performance.now() - touchT;
      const s = stateRef.current;
      if (s !== "playing") {
        startGame();
        return;
      }
      if (dt < 400 && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
        moveLane(dx > 0 ? 1 : -1);
      } else if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        jump();
      } else if (dy < -30 && Math.abs(dy) > Math.abs(dx)) {
        jump();
      }
    };

    window.addEventListener("keydown", onKey);
    canvas?.addEventListener("pointerdown", onPointerDown);
    canvas?.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("keydown", onKey);
      canvas?.removeEventListener("pointerdown", onPointerDown);
      canvas?.removeEventListener("pointerup", onPointerUp);
    };
  }, [startGame, moveLane, jump]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      const state = stateRef.current;
      const obstacles = obstaclesRef.current;

      if (state === "playing") {
        const speed = BASE_SPEED + distanceRef.current * SPEED_RAMP;

        for (const o of obstacles) o.z += speed;
        while (obstacles.length && obstacles[0].z > 1.15) obstacles.shift();
        const last = obstacles[obstacles.length - 1];
        if (!last || last.z > -SPAWN_GAP_Z + 0.001) {
          obstacles.push({
            lane: pickLane(last?.lane),
            z: (last?.z ?? 0) - SPAWN_GAP_Z,
          });
        }

        if (jumpFrameRef.current > 0) {
          jumpFrameRef.current += 1;
          if (jumpFrameRef.current > JUMP_DURATION) jumpFrameRef.current = 0;
        }

        distanceRef.current += speed * 100;

        const isJumping = jumpFrameRef.current > 0;
        if (!isJumping) {
          for (const o of obstacles) {
            if (
              o.lane === laneRef.current &&
              o.z >= HIT_Z_MIN &&
              o.z <= HIT_Z_MAX
            ) {
              const finalDist = Math.floor(distanceRef.current);
              setScore(finalDist);
              setHighScore((hs) => (finalDist > hs ? finalDist : hs));
              setGameState("gameover");
              break;
            }
          }
        }
      }

      const jumpOffset =
        jumpFrameRef.current > 0
          ? jumpHeightAt(jumpFrameRef.current)
          : state === "menu"
            ? Math.sin(performance.now() / 240) * 6
            : 0;

      draw(
        ctx,
        obstacles,
        laneRef.current,
        jumpOffset,
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
    <div className="flex flex-1 flex-col items-center justify-center bg-linear-to-b from-indigo-900 via-purple-800 to-orange-500 p-4">
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-black/40 backdrop-blur-[1px]">
            <h1 className="text-white text-5xl font-black tracking-tight drop-shadow-[0_4px_0_rgba(0,0,0,0.6)]">
              MarkusRunner
            </h1>
            <button
              onClick={startGame}
              className="px-12 py-4 bg-yellow-400 hover:bg-yellow-300 text-black text-3xl font-black rounded-full shadow-lg border-4 border-black transition-transform hover:scale-105 active:scale-95"
            >
              PLAY
            </button>
            <div className="text-white/90 text-sm font-medium text-center px-6 leading-relaxed">
              ← / → or swipe to switch lanes
              <br />
              Space, ↑ or tap to jump
            </div>
          </div>
        )}

        {gameState === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/55">
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

function jumpHeightAt(frame: number) {
  if (frame <= JUMP_RISE) {
    return Math.sin((frame / JUMP_RISE) * (Math.PI / 2)) * JUMP_HEIGHT;
  }
  if (frame <= JUMP_RISE + JUMP_HOLD) {
    return JUMP_HEIGHT;
  }
  const fallFrame = frame - JUMP_RISE - JUMP_HOLD;
  return Math.cos((fallFrame / JUMP_FALL) * (Math.PI / 2)) * JUMP_HEIGHT;
}

function pickLane(prev?: Lane): Lane {
  if (prev === undefined) return Math.floor(Math.random() * 3) as Lane;
  const choices = ([0, 1, 2] as Lane[]).filter((l) => l !== prev);
  return choices[Math.floor(Math.random() * choices.length)];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function laneScreenX(lane: Lane, z: number) {
  const roadW = lerp(ROAD_FAR, ROAD_NEAR, z);
  const laneOffset = (lane - 1) * (roadW / 3);
  return WIDTH / 2 + laneOffset;
}

function screenYAtZ(z: number) {
  return lerp(HORIZON_Y, PLAYER_Y, z);
}

function draw(
  ctx: CanvasRenderingContext2D,
  obstacles: Obstacle[],
  playerLane: Lane,
  jumpOffset: number,
  img: HTMLImageElement | null,
  imgReady: boolean,
  score: number,
  showScore: boolean,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  sky.addColorStop(0, "#1e1b4b");
  sky.addColorStop(0.6, "#7c3aed");
  sky.addColorStop(1, "#fb923c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HORIZON_Y);

  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HORIZON_Y - 10, 38, 0, Math.PI * 2);
  ctx.fill();

  const groundGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, HEIGHT);
  groundGrad.addColorStop(0, "#1f2937");
  groundGrad.addColorStop(1, "#374151");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, HORIZON_Y, WIDTH, HEIGHT - HORIZON_Y);

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - ROAD_FAR / 2, HORIZON_Y);
  ctx.lineTo(WIDTH / 2 + ROAD_FAR / 2, HORIZON_Y);
  ctx.lineTo(WIDTH / 2 + ROAD_NEAR / 2, HEIGHT);
  ctx.lineTo(WIDTH / 2 - ROAD_NEAR / 2, HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - ROAD_FAR / 2, HORIZON_Y);
  ctx.lineTo(WIDTH / 2 - ROAD_NEAR / 2, HEIGHT);
  ctx.moveTo(WIDTH / 2 + ROAD_FAR / 2, HORIZON_Y);
  ctx.lineTo(WIDTH / 2 + ROAD_NEAR / 2, HEIGHT);
  ctx.stroke();

  const stripeScroll = (performance.now() / 1000) % 1;
  ctx.strokeStyle = "#fde047";
  ctx.lineWidth = 4;
  for (let i = 0; i < 8; i++) {
    const z1 = ((i + stripeScroll) / 8) % 1;
    const z2 = z1 + 0.06;
    if (z2 > 1) continue;
    for (const lf of [-1, 1] as const) {
      const x1 = WIDTH / 2 + (lf * lerp(ROAD_FAR, ROAD_NEAR, z1)) / 6;
      const y1 = screenYAtZ(z1);
      const x2 = WIDTH / 2 + (lf * lerp(ROAD_FAR, ROAD_NEAR, z2)) / 6;
      const y2 = screenYAtZ(z2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  const sorted = [...obstacles].sort((a, b) => a.z - b.z);
  for (const o of sorted) {
    if (o.z <= 0) continue;
    drawObstacle(ctx, o);
  }

  drawPlayer(ctx, img, imgReady, playerLane, jumpOffset);

  if (showScore) {
    ctx.save();
    ctx.font = "900 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillStyle = "#ffffff";
    const text = String(score);
    ctx.strokeText(text, WIDTH / 2, 16);
    ctx.fillText(text, WIDTH / 2, 16);
    ctx.restore();
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle) {
  const z = Math.max(0.001, o.z);
  const x = laneScreenX(o.lane, z);
  const y = screenYAtZ(z);
  const size = OBSTACLE_BASE * z;
  const half = size / 2;
  const top = y - size;

  ctx.fillStyle = "#dc2626";
  ctx.fillRect(x - half, top, size, size);
  ctx.fillStyle = "#991b1b";
  ctx.fillRect(x - half, top, size, size * 0.18);
  ctx.fillStyle = "#fca5a5";
  ctx.fillRect(x - half + size * 0.15, top + size * 0.3, size * 0.7, size * 0.1);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - half, top, size, size);
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  imgReady: boolean,
  lane: Lane,
  jumpOffset: number,
) {
  const x = laneScreenX(lane, 1);
  const y = PLAYER_Y - jumpOffset;

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  const shadowW = PLAYER_W * 0.7;
  const shadowH = 14 * Math.max(0.4, 1 - jumpOffset / JUMP_HEIGHT);
  ctx.beginPath();
  ctx.ellipse(x, PLAYER_Y + 4, shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  if (imgReady && img) {
    ctx.drawImage(img, x - PLAYER_W / 2, y - PLAYER_H, PLAYER_W, PLAYER_H);
  } else {
    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(x - PLAYER_W / 2, y - PLAYER_H, PLAYER_W, PLAYER_H);
  }
}
