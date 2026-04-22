"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TILE = 32;
const VIEW_W = 960;
const VIEW_H = 576;
const WORLD_W = 120;
const WORLD_H = 48;
const GRAVITY = 0.55;
const MOVE_SPEED = 4;
const JUMP_V = -10.5;
const MAX_FALL = 14;
const PLAYER_W_TILES = 1;
const PLAYER_H_TILES = 2;
const REACH = 5;

const AIR = 0;
const GRASS = 1;
const DIRT = 2;
const STONE = 3;
const WOOD = 4;
const LEAVES = 5;
const SAND = 6;
const PLANK = 7;

type Tile = number;

const BLOCKS: {
  id: Tile;
  name: string;
  color: string;
  top?: string;
  accent?: string;
}[] = [
  { id: GRASS, name: "Gress", color: "#5fae3a", top: "#7cc255", accent: "#3f7a27" },
  { id: DIRT, name: "Jord", color: "#8b5a2b", accent: "#6b4320" },
  { id: STONE, name: "Stein", color: "#8a8a8a", accent: "#6b6b6b" },
  { id: WOOD, name: "Tre", color: "#7a4a1f", accent: "#5a3414" },
  { id: LEAVES, name: "Løv", color: "#3b8a2a", accent: "#2b6a1d" },
  { id: SAND, name: "Sand", color: "#e9d27a", accent: "#c7ae58" },
  { id: PLANK, name: "Plank", color: "#c38f4a", accent: "#8e6432" },
];

function makeWorld(): Tile[] {
  const w = new Array<Tile>(WORLD_W * WORLD_H).fill(AIR);

  const heights: number[] = [];
  for (let x = 0; x < WORLD_W; x++) {
    const h =
      Math.floor(
        WORLD_H * 0.55 +
          Math.sin(x * 0.18) * 3 +
          Math.sin(x * 0.07 + 1.3) * 2 +
          (Math.random() - 0.5) * 1.5,
      );
    heights.push(h);
  }

  for (let x = 0; x < WORLD_W; x++) {
    const surface = heights[x];
    for (let y = 0; y < WORLD_H; y++) {
      const i = y * WORLD_W + x;
      if (y < surface) {
        w[i] = AIR;
      } else if (y === surface) {
        w[i] = GRASS;
      } else if (y < surface + 4) {
        w[i] = DIRT;
      } else {
        w[i] = STONE;
      }
    }
  }

  for (let x = 3; x < WORLD_W - 3; x += 7 + Math.floor(Math.random() * 6)) {
    const surface = heights[x];
    const trunkH = 3 + Math.floor(Math.random() * 2);
    for (let t = 1; t <= trunkH; t++) {
      const y = surface - t;
      if (y >= 0) w[y * WORLD_W + x] = WOOD;
    }
    const top = surface - trunkH;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const lx = x + dx;
        const ly = top + dy;
        if (lx < 0 || lx >= WORLD_W || ly < 0 || ly >= WORLD_H) continue;
        if (Math.abs(dx) === 2 && dy !== 0) continue;
        const idx = ly * WORLD_W + lx;
        if (w[idx] === AIR) w[idx] = LEAVES;
      }
    }
    const crown = top - 1;
    if (crown >= 0) {
      if (w[crown * WORLD_W + x] === AIR) w[crown * WORLD_W + x] = LEAVES;
      if (x - 1 >= 0 && w[crown * WORLD_W + (x - 1)] === AIR)
        w[crown * WORLD_W + (x - 1)] = LEAVES;
      if (x + 1 < WORLD_W && w[crown * WORLD_W + (x + 1)] === AIR)
        w[crown * WORLD_W + (x + 1)] = LEAVES;
    }
  }

  return w;
}

function isSolid(t: Tile): boolean {
  return t !== AIR && t !== LEAVES;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgReadyRef = useRef(false);

  const worldRef = useRef<Tile[]>([]);
  const playerRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, onGround: false, facing: 1 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseRef = useRef<{ x: number; y: number; left: boolean; right: boolean }>({
    x: 0,
    y: 0,
    left: false,
    right: false,
  });
  const lastActionRef = useRef(0);
  const miningRef = useRef<{ tx: number; ty: number; progress: number } | null>(
    null,
  );
  const lastFrameRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [selected, setSelected] = useState<Tile>(GRASS);
  const selectedRef = useRef<Tile>(GRASS);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const resetWorld = useCallback(() => {
    const w = makeWorld();
    worldRef.current = w;
    const spawnX = Math.floor(WORLD_W / 2);
    let spawnY = 0;
    for (let y = 0; y < WORLD_H; y++) {
      if (isSolid(w[y * WORLD_W + spawnX])) {
        spawnY = y;
        break;
      }
    }
    playerRef.current = {
      x: spawnX * TILE,
      y: (spawnY - PLAYER_H_TILES) * TILE,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
    };
  }, []);

  useEffect(() => {
    resetWorld();
  }, [resetWorld]);

  useEffect(() => {
    const img = new Image();
    img.src = "/markus.png";
    img.onload = () => {
      imgReadyRef.current = true;
    };
    imgRef.current = img;
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === "Digit1") setSelected(GRASS);
      else if (e.code === "Digit2") setSelected(DIRT);
      else if (e.code === "Digit3") setSelected(STONE);
      else if (e.code === "Digit4") setSelected(WOOD);
      else if (e.code === "Digit5") setSelected(LEAVES);
      else if (e.code === "Digit6") setSelected(SAND);
      else if (e.code === "Digit7") setSelected(PLANK);
      else if (e.code === "KeyR") resetWorld();
      if (
        e.code === "Space" ||
        e.code === "ArrowUp" ||
        e.code === "ArrowDown" ||
        e.code === "ArrowLeft" ||
        e.code === "ArrowRight"
      ) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [resetWorld]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toCanvas = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) * VIEW_W) / rect.width,
        y: ((e.clientY - rect.top) * VIEW_H) / rect.height,
      };
    };

    const onContext = (e: Event) => e.preventDefault();
    const onDown = (e: PointerEvent) => {
      const p = toCanvas(e);
      mouseRef.current.x = p.x;
      mouseRef.current.y = p.y;
      if (e.button === 0) mouseRef.current.left = true;
      if (e.button === 2) mouseRef.current.right = true;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      const p = toCanvas(e);
      mouseRef.current.x = p.x;
      mouseRef.current.y = p.y;
    };
    const onUp = (e: PointerEvent) => {
      if (e.button === 0) mouseRef.current.left = false;
      if (e.button === 2) mouseRef.current.right = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    };

    canvas.addEventListener("contextmenu", onContext);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const getTile = (tx: number, ty: number): Tile => {
      if (tx < 0 || tx >= WORLD_W || ty < 0 || ty >= WORLD_H) return STONE;
      return worldRef.current[ty * WORLD_W + tx];
    };
    const setTile = (tx: number, ty: number, v: Tile) => {
      if (tx < 0 || tx >= WORLD_W || ty < 0 || ty >= WORLD_H) return;
      worldRef.current[ty * WORLD_W + tx] = v;
    };

    const rectHitsSolid = (x: number, y: number, w: number, h: number): boolean => {
      const x0 = Math.floor(x / TILE);
      const y0 = Math.floor(y / TILE);
      const x1 = Math.floor((x + w - 1) / TILE);
      const y1 = Math.floor((y + h - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (isSolid(getTile(tx, ty))) return true;
        }
      }
      return false;
    };

    const loop = () => {
      const now = performance.now();
      const dt = lastFrameRef.current ? now - lastFrameRef.current : 16;
      lastFrameRef.current = now;

      const p = playerRef.current;
      const keys = keysRef.current;

      let ax = 0;
      if (keys["ArrowLeft"] || keys["KeyA"]) ax -= 1;
      if (keys["ArrowRight"] || keys["KeyD"]) ax += 1;
      p.vx = ax * MOVE_SPEED;
      if (ax !== 0) p.facing = ax;

      if ((keys["Space"] || keys["ArrowUp"] || keys["KeyW"]) && p.onGround) {
        p.vy = JUMP_V;
        p.onGround = false;
      }

      p.vy += GRAVITY;
      if (p.vy > MAX_FALL) p.vy = MAX_FALL;

      const pw = PLAYER_W_TILES * TILE - 2;
      const ph = PLAYER_H_TILES * TILE - 2;

      let nx = p.x + p.vx;
      if (rectHitsSolid(nx, p.y, pw, ph)) {
        if (p.vx > 0) nx = Math.floor((nx + pw) / TILE) * TILE - pw - 0.01;
        else if (p.vx < 0) nx = Math.floor(nx / TILE) * TILE + TILE + 0.01;
        p.vx = 0;
      }
      p.x = nx;

      let ny = p.y + p.vy;
      p.onGround = false;
      if (rectHitsSolid(p.x, ny, pw, ph)) {
        if (p.vy > 0) {
          ny = Math.floor((ny + ph) / TILE) * TILE - ph - 0.01;
          p.onGround = true;
        } else if (p.vy < 0) {
          ny = Math.floor(ny / TILE) * TILE + TILE + 0.01;
        }
        p.vy = 0;
      }
      p.y = ny;

      if (p.y > WORLD_H * TILE + 200) {
        resetWorld();
      }

      const cam = cameraRef.current;
      const targetCX = p.x + pw / 2 - VIEW_W / 2;
      const targetCY = p.y + ph / 2 - VIEW_H / 2;
      cam.x += (targetCX - cam.x) * 0.15;
      cam.y += (targetCY - cam.y) * 0.15;
      cam.x = Math.max(0, Math.min(WORLD_W * TILE - VIEW_W, cam.x));
      cam.y = Math.max(0, Math.min(WORLD_H * TILE - VIEW_H, cam.y));

      const m = mouseRef.current;
      const worldMX = m.x + cam.x;
      const worldMY = m.y + cam.y;
      const tx = Math.floor(worldMX / TILE);
      const ty = Math.floor(worldMY / TILE);
      const pcx = p.x + pw / 2;
      const pcy = p.y + ph / 2;
      const dx = (tx + 0.5) * TILE - pcx;
      const dy = (ty + 0.5) * TILE - pcy;
      const dist = Math.sqrt(dx * dx + dy * dy) / TILE;

      if (m.left && dist <= REACH && getTile(tx, ty) !== AIR) {
        const mining = miningRef.current;
        if (mining && mining.tx === tx && mining.ty === ty) {
          mining.progress += dt;
          if (mining.progress >= 1000) {
            setTile(tx, ty, AIR);
            miningRef.current = null;
          }
        } else {
          miningRef.current = { tx, ty, progress: 0 };
        }
      } else {
        miningRef.current = null;
      }

      if (
        m.right &&
        dist <= REACH &&
        now - lastActionRef.current > 180
      ) {
        const t = getTile(tx, ty);
        if (t === AIR) {
          const playerLeft = p.x;
          const playerRight = p.x + pw;
          const playerTop = p.y;
          const playerBottom = p.y + ph;
          const blockLeft = tx * TILE;
          const blockRight = (tx + 1) * TILE;
          const blockTop = ty * TILE;
          const blockBottom = (ty + 1) * TILE;
          const overlaps =
            playerRight > blockLeft &&
            playerLeft < blockRight &&
            playerBottom > blockTop &&
            playerTop < blockBottom;
          if (!overlaps) {
            setTile(tx, ty, selectedRef.current);
            lastActionRef.current = now;
          }
        }
      }

      draw(
        ctx,
        worldRef.current,
        cam,
        p,
        imgRef.current,
        imgReadyRef.current,
        tx,
        ty,
        dist <= REACH,
        miningRef.current,
      );

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [resetWorld]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-linear-to-b from-sky-400 via-sky-500 to-sky-700 p-4 gap-3">
      <div
        className="relative shadow-2xl rounded-lg overflow-hidden border-4 border-black/30"
        style={{ width: VIEW_W, height: VIEW_H, maxWidth: "100%" }}
      >
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          className="block touch-none cursor-crosshair select-none w-full h-auto"
        />
        <div className="absolute top-3 left-3 text-white/95 text-sm font-semibold drop-shadow-[0_2px_0_rgba(0,0,0,0.7)] leading-snug">
          A/D eller ← → for å gå · W/Space for å hoppe
          <br />
          Venstreklikk = grav · Høyreklikk = bygg · 1–7 velger blokk · R = ny verden
        </div>
      </div>
      <div className="flex gap-2 bg-black/40 px-3 py-2 rounded-xl border-2 border-black/60">
        {BLOCKS.map((b, i) => {
          const active = selected === b.id;
          return (
            <button
              key={b.id}
              onClick={() => setSelected(b.id)}
              className={`relative w-14 h-14 rounded-md border-2 flex items-end justify-center text-[11px] font-bold transition-transform ${
                active
                  ? "border-yellow-300 scale-110 shadow-[0_0_0_3px_rgba(253,224,71,0.5)]"
                  : "border-black/70 hover:scale-105"
              }`}
              style={{ background: b.color }}
              title={`${i + 1}: ${b.name}`}
            >
              <span className="bg-black/50 text-white px-1 rounded-sm mb-1">
                {i + 1}
              </span>
              <span className="absolute -top-2 -left-1 bg-white/90 text-black text-[10px] px-1 rounded-sm font-black">
                {b.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function drawCracks(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  pct: number,
) {
  if (pct <= 0) return;
  ctx.save();
  ctx.strokeStyle = `rgba(0,0,0,${0.3 + pct * 0.5})`;
  ctx.lineWidth = 1 + pct * 1.5;
  ctx.beginPath();
  if (pct > 0.05) {
    ctx.moveTo(sx + 4, sy + 4);
    ctx.lineTo(sx + 14, sy + 12);
    ctx.lineTo(sx + 10, sy + 22);
  }
  if (pct > 0.3) {
    ctx.moveTo(sx + 14, sy + 12);
    ctx.lineTo(sx + 26, sy + 8);
    ctx.moveTo(sx + 14, sy + 12);
    ctx.lineTo(sx + 22, sy + 24);
  }
  if (pct > 0.6) {
    ctx.moveTo(sx + 10, sy + 22);
    ctx.lineTo(sx + 2, sy + 28);
    ctx.moveTo(sx + 22, sy + 24);
    ctx.lineTo(sx + 28, sy + 30);
    ctx.moveTo(sx + 4, sy + 4);
    ctx.lineTo(sx + 0, sy + 14);
  }
  if (pct > 0.85) {
    ctx.moveTo(sx + 26, sy + 8);
    ctx.lineTo(sx + 30, sy + 2);
    ctx.moveTo(sx + 0, sy + 14);
    ctx.lineTo(sx + 6, sy + 16);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  t: Tile,
  sx: number,
  sy: number,
) {
  if (t === AIR) return;
  if (t === GRASS) {
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = "#5fae3a";
    ctx.fillRect(sx, sy, TILE, 10);
    ctx.fillStyle = "#7cc255";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(sx + i * 8 + 1, sy + 2, 3, 5);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
    return;
  }
  if (t === DIRT) {
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = "#6b4320";
    ctx.fillRect(sx + 4, sy + 6, 5, 4);
    ctx.fillRect(sx + 18, sy + 14, 6, 5);
    ctx.fillRect(sx + 10, sy + 22, 4, 3);
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
    return;
  }
  if (t === STONE) {
    ctx.fillStyle = "#8a8a8a";
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = "#6b6b6b";
    ctx.fillRect(sx + 2, sy + 4, 7, 5);
    ctx.fillRect(sx + 12, sy + 12, 8, 6);
    ctx.fillRect(sx + 22, sy + 22, 6, 5);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
    return;
  }
  if (t === WOOD) {
    ctx.fillStyle = "#7a4a1f";
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = "#5a3414";
    ctx.fillRect(sx + 4, sy, 3, TILE);
    ctx.fillRect(sx + 14, sy, 2, TILE);
    ctx.fillRect(sx + 24, sy, 3, TILE);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
    return;
  }
  if (t === LEAVES) {
    ctx.fillStyle = "#3b8a2a";
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = "#2b6a1d";
    for (let i = 0; i < 6; i++) {
      const dx = (i * 11) % TILE;
      const dy = (i * 7 + 3) % TILE;
      ctx.fillRect(sx + dx, sy + dy, 4, 4);
    }
    ctx.fillStyle = "#56ad3e";
    ctx.fillRect(sx + 3, sy + 3, 3, 3);
    ctx.fillRect(sx + 20, sy + 18, 3, 3);
    return;
  }
  if (t === SAND) {
    ctx.fillStyle = "#e9d27a";
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = "#c7ae58";
    for (let i = 0; i < 8; i++) {
      const dx = (i * 13) % TILE;
      const dy = (i * 9 + 4) % TILE;
      ctx.fillRect(sx + dx, sy + dy, 2, 2);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
    return;
  }
  if (t === PLANK) {
    ctx.fillStyle = "#c38f4a";
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = "#8e6432";
    ctx.fillRect(sx, sy + 10, TILE, 2);
    ctx.fillRect(sx, sy + 22, TILE, 2);
    ctx.fillRect(sx + 10, sy, 2, 10);
    ctx.fillRect(sx + 22, sy + 12, 2, 10);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
    return;
  }
}

function draw(
  ctx: CanvasRenderingContext2D,
  world: Tile[],
  cam: { x: number; y: number },
  player: { x: number; y: number; facing: number },
  img: HTMLImageElement | null,
  imgReady: boolean,
  hoverTx: number,
  hoverTy: number,
  inReach: boolean,
  mining: { tx: number; ty: number; progress: number } | null,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, "#7cc8ff");
  sky.addColorStop(1, "#c6e7ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  const cloudOffset = (cam.x * 0.3) % 300;
  for (let i = -1; i < 5; i++) {
    const cx = i * 300 - cloudOffset + 80;
    const cy = 60 + ((i * 37) % 40);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 40, cy - 8, 40, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 35, cy + 2, 35, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tx0 = Math.max(0, Math.floor(cam.x / TILE));
  const ty0 = Math.max(0, Math.floor(cam.y / TILE));
  const tx1 = Math.min(WORLD_W - 1, Math.ceil((cam.x + VIEW_W) / TILE));
  const ty1 = Math.min(WORLD_H - 1, Math.ceil((cam.y + VIEW_H) / TILE));

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = world[ty * WORLD_W + tx];
      if (t === AIR) continue;
      const sx = tx * TILE - cam.x;
      const sy = ty * TILE - cam.y;
      drawTile(ctx, t, sx, sy);
    }
  }

  if (inReach && hoverTx >= 0 && hoverTy >= 0 && hoverTx < WORLD_W && hoverTy < WORLD_H) {
    const sx = hoverTx * TILE - cam.x;
    const sy = hoverTy * TILE - cam.y;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
  }

  if (mining) {
    const sx = mining.tx * TILE - cam.x;
    const sy = mining.ty * TILE - cam.y;
    const pct = Math.min(1, mining.progress / 1000);
    drawCracks(ctx, sx, sy, pct);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(sx + 2, sy + TILE - 6, TILE - 4, 4);
    ctx.fillStyle = "#fde047";
    ctx.fillRect(sx + 2, sy + TILE - 6, (TILE - 4) * pct, 4);
  }

  const px = player.x - cam.x;
  const py = player.y - cam.y;
  const pw = PLAYER_W_TILES * TILE;
  const ph = PLAYER_H_TILES * TILE;

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(px + pw / 2, py + ph + 2, pw * 0.45, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (imgReady && img) {
    ctx.save();
    if (player.facing < 0) {
      ctx.translate(px + pw, py);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, pw, ph);
    } else {
      ctx.drawImage(img, px, py, pw, ph);
    }
    ctx.restore();
  } else {
    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(px, py, pw, ph);
  }
}
