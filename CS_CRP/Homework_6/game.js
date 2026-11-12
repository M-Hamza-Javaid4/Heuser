"use strict";

(function () {
  // --- 1. Colour Palette (Plan_2) ---
  const PALETTE = {
    yaleBlue: "#1b4965",
    freshSky: "#00a7e1",
    mintLeaf: "#00c49a",
    royalGold: "#f8e16c",
    blazingFlame: "#ff3f00",
    black: "#000000"
  };

  // --- Constants & Configuration ---
  const BASKET_WIDTH = 120;
  const BASKET_HEIGHT = 20;
  const BASKET_COLOR = PALETTE.freshSky;
  const BASKET_Y_OFFSET = 50;

  const BALL_RADIUS = 15; // 30x30 bounding box, 6x6 pixel grid with 5px pixel size
  const GOOD_BALL_COLORS = [
    PALETTE.freshSky,
    PALETTE.mintLeaf,
    PALETTE.royalGold,
    PALETTE.blazingFlame
  ];
  const BAD_BALL_COLOR = PALETTE.black;

  const BALL_BASE_SPEED = 2;
  const BALL_MAX_SPEED = 10;

  const INITIAL_SPAWN_INTERVAL = 60;
  const MIN_SPAWN_INTERVAL = 10;
  const BAD_BALL_CHANCE_BASE = 0.15;
  const BAD_BALL_CHANCE_MAX = 0.45;

  const SCORE_PER_GOOD_CATCH = 10;
  const DIFFICULTY_STEP = 50;

  const STORAGE_KEY = "ballCatcherSaveData";
  const DEFAULT_SAVE_DATA = {
    highScore: 0,
    totalGamesPlayed: 0,
    totalPointsScored: 0,
    isMuted: false,
    lastScore: null,
    pausedSession: null
  };

  const MENU_BALL_COUNT = 8;

  // 6x6 Voxel Ball Pixel Mask
  const BALL_MASK = [
    [0, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 0]
  ];

  // --- Game State Enum ---
  const GameState = {
    MENU: "menu",
    PLAYING: "playing",
    PAUSED: "paused",
    DISINTEGRATING: "disintegrating"
  };

  let gameState = GameState.MENU;

  // --- Storage System ---
  function loadSaveData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SAVE_DATA, ...parsed };
      }
    } catch (e) {
      console.warn("Failed to load save data:", e);
    }
    return { ...DEFAULT_SAVE_DATA };
  }

  function writeSaveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save data:", e);
    }
  }

  let saveData = loadSaveData();
  let isMuted = Boolean(saveData.isMuted);

  // --- Audio Engine (Web Audio API) ---
  let audioCtx = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone({ frequency, type, duration, volume, rampDown, delay }) {
    if (isMuted) return;
    const ctxA = ensureAudioContext();
    if (!ctxA) return;

    try {
      const osc = ctxA.createOscillator();
      const gain = ctxA.createGain();

      osc.type = type || "square";
      const startAt = ctxA.currentTime + (delay || 0);
      const stopAt = startAt + duration;

      osc.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(volume || 0.3, startAt);

      if (rampDown !== false) {
        gain.gain.exponentialRampToValueAtTime(0.001, stopAt);
      }

      osc.connect(gain);
      gain.connect(ctxA.destination);

      osc.start(startAt);
      osc.stop(stopAt);
    } catch (e) {
      console.warn("Audio playback error:", e);
    }
  }

  // --- Sound Recipes ---
  function playCollectSound() {
    if (isMuted) return;
    playTone({ frequency: 587, type: "square", duration: 0.07, volume: 0.25, delay: 0 });
    playTone({ frequency: 784, type: "square", duration: 0.10, volume: 0.25, delay: 0.06 });
  }

  function playDeathHitSound() {
    if (isMuted) return;
    playTone({ frequency: 120, type: "sawtooth", duration: 0.15, volume: 0.35, delay: 0 });
    playTone({ frequency: 250, type: "square", duration: 0.12, volume: 0.30, delay: 0.02 });
    playTone({ frequency: 80, type: "square", duration: 0.20, volume: 0.25, delay: 0.05 });
  }

  function playGameOverMelody() {
    if (isMuted) return;
    const notes = [
      { freq: 494, delay: 0, dur: 0.25 },
      { freq: 466, delay: 0.28, dur: 0.25 },
      { freq: 440, delay: 0.56, dur: 0.25 },
      { freq: 349, delay: 0.84, dur: 0.50 }
    ];

    notes.forEach((n) => {
      playTone({
        frequency: n.freq,
        type: "triangle",
        duration: n.dur,
        volume: 0.3,
        delay: n.delay
      });
    });
  }

  function playStartSound() {
    if (isMuted) return;
    const notes = [
      { freq: 523, delay: 0, dur: 0.10 },
      { freq: 659, delay: 0.10, dur: 0.10 },
      { freq: 784, delay: 0.20, dur: 0.10 },
      { freq: 1047, delay: 0.30, dur: 0.25 }
    ];

    notes.forEach((n) => {
      playTone({
        frequency: n.freq,
        type: "square",
        duration: n.dur,
        volume: 0.25,
        delay: n.delay
      });
    });
  }

  function playButtonSound() {
    if (isMuted) return;
    playTone({ frequency: 660, type: "square", duration: 0.05, volume: 0.20 });
  }

  // --- Haptics (Vibration API) ---
  function vibrate(pattern) {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Safe fallback
      }
    }
  }

  // --- DOM References ---
  let canvas;
  let ctx;
  let menuOverlay;
  let startBtn;
  let highScoreDisplay;
  let lastScoreDisplay;
  let totalGamesDisplay;
  let totalPointsDisplay;
  let resetDataBtn;
  let muteBtn;

  let scoreDisplay;
  let pauseBtn;

  let pauseOverlay;
  let continueBtn;
  let quitBtn;
  let pauseMuteBtn;

  let resetModal;
  let resetConfirmBtn;
  let resetCancelBtn;

  // --- Runtime Variables ---
  let frameCount = 0;
  let score = 0;
  let spawnTimer = 0;
  let currentSpawnInterval = INITIAL_SPAWN_INTERVAL;
  let currentBadChance = BAD_BALL_CHANCE_BASE;

  const basket = {
    x: 0,
    y: 0,
    prevX: 0,
    width: BASKET_WIDTH,
    height: BASKET_HEIGHT
  };

  const cursorPos = { x: 0, y: 0, visible: false };
  let isTouch = false;

  let balls = [];
  let menuBalls = [];
  let trailParticles = [];
  let popParticles = [];
  let scoreNotifications = [];
  let disintegrationParticles = [];
  let disintegrationTimer = 0;

  // --- Color Utilities ---
  function adjustLightness(hex, percent) {
    let num = parseInt(hex.replace("#", ""), 16);
    let r = (num >> 16) + Math.round(255 * percent);
    let g = ((num >> 8) & 0x00ff) + Math.round(255 * percent);
    let b = (num & 0x0000ff) + Math.round(255 * percent);

    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function hexToRgba(hex, alpha) {
    let c = hex.replace("#", "");
    if (c.length === 3) {
      c = c.split("").map((ch) => ch + ch).join("");
    }
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function randomFloat(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // --- Circle-vs-Rectangle Collision (Plan_5 §2) ---
  function isBallCaughtByBasket(ball, b) {
    const basketLeft = b.x - b.width / 2;
    const basketRight = b.x + b.width / 2;
    const basketTop = b.y;
    const basketBottom = b.y + b.height;

    const closestX = clamp(ball.x, basketLeft, basketRight);
    const closestY = clamp(ball.y, basketTop, basketBottom);

    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const distanceSquared = dx * dx + dy * dy;

    return distanceSquared <= ball.radius * ball.radius;
  }

  function recalculateDifficulty() {
    const steps = score / DIFFICULTY_STEP;
    currentSpawnInterval = Math.max(MIN_SPAWN_INTERVAL, INITIAL_SPAWN_INTERVAL - steps * 5);
    currentBadChance = Math.min(BAD_BALL_CHANCE_MAX, BAD_BALL_CHANCE_BASE + steps * 0.03);
  }

  function updateBasketPosition(targetX) {
    const halfWidth = basket.width / 2;
    basket.x = clamp(targetX, halfWidth, canvas.width - halfWidth);
  }

  // --- UI Update Helpers ---
  function updateMenuStats() {
    highScoreDisplay.textContent = `HIGH SCORE: ${saveData.highScore}`;
    totalGamesDisplay.textContent = `GAMES PLAYED: ${saveData.totalGamesPlayed}`;
    totalPointsDisplay.textContent = `TOTAL POINTS: ${saveData.totalPointsScored}`;
  }

  function updateMuteButtons() {
    const label = isMuted ? "🔇 SOUND: OFF" : "🔊 SOUND: ON";
    muteBtn.textContent = label;
    pauseMuteBtn.textContent = label;

    muteBtn.classList.toggle("muted", isMuted);
    pauseMuteBtn.classList.toggle("muted", isMuted);
  }

  function toggleMute() {
    isMuted = !isMuted;
    saveData.isMuted = isMuted;
    writeSaveData(saveData);
    updateMuteButtons();

    if (!isMuted) {
      playButtonSound();
    }
  }

  // --- Reset Modal Handlers ---
  function showResetModal() {
    resetModal.classList.remove("hidden");
    playButtonSound();
  }

  function hideResetModal() {
    resetModal.classList.add("hidden");
    playButtonSound();
  }

  function confirmReset() {
    saveData = { ...DEFAULT_SAVE_DATA };
    writeSaveData(saveData);

    isMuted = false;
    updateMuteButtons();

    lastScoreDisplay.classList.add("hidden");
    updateMenuStats();
    resetModal.classList.add("hidden");

    playButtonSound();
  }

  // --- Pause & Resume Flow with Session Persistence (Plan_5 §3) ---
  function pauseGame() {
    if (gameState !== GameState.PLAYING) return;

    gameState = GameState.PAUSED;
    pauseOverlay.classList.remove("hidden");
    pauseBtn.classList.add("hidden");
    document.body.classList.remove("playing");

    // Persist session so it survives refresh
    saveData.pausedSession = {
      score: score,
      balls: balls.map((b) => ({ ...b })),
      basket: { ...basket },
      currentSpawnInterval: currentSpawnInterval,
      currentBadChance: currentBadChance,
      spawnTimer: spawnTimer
    };
    writeSaveData(saveData);

    playButtonSound();
  }

  function resumeGame() {
    if (gameState !== GameState.PAUSED) return;

    gameState = GameState.PLAYING;
    pauseOverlay.classList.add("hidden");
    pauseBtn.classList.remove("hidden");
    document.body.classList.add("playing");

    // Clear saved session — game is live again
    saveData.pausedSession = null;
    writeSaveData(saveData);

    playButtonSound();
  }

  function quitToMenu() {
    if (gameState !== GameState.PAUSED) return;

    const finalScore = score;
    saveData.totalGamesPlayed++;
    saveData.totalPointsScored += finalScore;
    saveData.lastScore = finalScore;
    if (finalScore > saveData.highScore) {
      saveData.highScore = finalScore;
    }
    saveData.pausedSession = null;
    writeSaveData(saveData);

    lastScoreDisplay.textContent = `LAST SCORE: ${finalScore}`;
    lastScoreDisplay.classList.remove("hidden");
    updateMenuStats();

    gameState = GameState.MENU;
    pauseOverlay.classList.add("hidden");
    pauseBtn.classList.add("hidden");
    scoreDisplay.classList.add("hidden");
    menuOverlay.classList.remove("hidden");
    document.body.classList.remove("playing");

    balls = [];
    trailParticles = [];
    popParticles = [];
    scoreNotifications = [];
    disintegrationParticles = [];

    playButtonSound();
  }

  function restorePausedSession(session) {
    score = session.score;
    balls = session.balls.map((b) => ({ ...b }));
    basket.x = session.basket.x;
    basket.y = session.basket.y;
    basket.prevX = session.basket.x;
    basket.width = session.basket.width || BASKET_WIDTH;
    basket.height = session.basket.height || BASKET_HEIGHT;

    currentSpawnInterval = session.currentSpawnInterval;
    currentBadChance = session.currentBadChance;
    spawnTimer = session.spawnTimer;

    trailParticles = [];
    popParticles = [];
    scoreNotifications = [];

    gameState = GameState.PAUSED;
    scoreDisplay.textContent = `SCORE: ${score}`;
    scoreDisplay.classList.remove("hidden");
    pauseOverlay.classList.remove("hidden");
    menuOverlay.classList.add("hidden");
    pauseBtn.classList.add("hidden");
    document.body.classList.remove("playing");

    if (saveData.lastScore !== null && saveData.lastScore !== undefined) {
      lastScoreDisplay.textContent = `LAST SCORE: ${saveData.lastScore}`;
      lastScoreDisplay.classList.remove("hidden");
    }
  }

  // --- Decorative Menu Balls ---
  function createMenuBall(randomY) {
    const cWidth = canvas ? canvas.width : window.innerWidth;
    const cHeight = canvas ? canvas.height : window.innerHeight;
    return {
      x: randomInt(BALL_RADIUS, cWidth - BALL_RADIUS),
      y: randomY ? randomInt(-BALL_RADIUS, cHeight) : -BALL_RADIUS,
      radius: BALL_RADIUS,
      speed: randomFloat(0.5, 1.5),
      color: GOOD_BALL_COLORS[randomInt(0, GOOD_BALL_COLORS.length - 1)],
      isBad: false
    };
  }

  function initMenuBalls() {
    menuBalls = [];
    for (let i = 0; i < MENU_BALL_COUNT; i++) {
      menuBalls.push(createMenuBall(true));
    }
  }

  // --- Pointer Event Handlers (Plan_5 §4) ---
  function onPointerMove(e) {
    if (e.pointerType === "touch") {
      isTouch = true;
    } else if (e.pointerType === "mouse") {
      isTouch = false;
    }

    cursorPos.x = e.clientX;
    cursorPos.y = e.clientY;
    cursorPos.visible = true;

    if (gameState === GameState.PLAYING) {
      updateBasketPosition(e.clientX);
    }
  }

  function onPointerDown(e) {
    if (e.pointerType === "touch") {
      isTouch = true;
    }

    cursorPos.x = e.clientX;
    cursorPos.y = e.clientY;
    cursorPos.visible = true;

    if (gameState === GameState.PLAYING) {
      updateBasketPosition(e.clientX);
    }
  }

  function onPointerLeave() {
    cursorPos.visible = false;
  }

  // --- Lifecycle Functions ---
  function handleResize() {
    const prevWidth = canvas.width || window.innerWidth;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    basket.y = canvas.height - BASKET_Y_OFFSET;
    updateBasketPosition(basket.x || canvas.width / 2);
    basket.prevX = basket.x;

    if (prevWidth > 0 && prevWidth !== canvas.width && balls.length > 0) {
      const scale = canvas.width / prevWidth;
      for (let i = 0; i < balls.length; i++) {
        balls[i].x = clamp(balls[i].x * scale, BALL_RADIUS, canvas.width - BALL_RADIUS);
      }
    }

    if (menuBalls.length === 0) {
      initMenuBalls();
    }
  }

  function startGame() {
    ensureAudioContext();
    playStartSound();

    score = 0;
    scoreDisplay.textContent = `SCORE: ${score}`;
    balls = [];
    trailParticles = [];
    popParticles = [];
    scoreNotifications = [];
    disintegrationParticles = [];
    spawnTimer = 0;
    recalculateDifficulty();

    saveData.pausedSession = null;
    writeSaveData(saveData);

    menuOverlay.classList.add("hidden");
    scoreDisplay.classList.remove("hidden");
    pauseBtn.classList.remove("hidden");
    pauseOverlay.classList.add("hidden");
    resetModal.classList.add("hidden");
    document.body.classList.add("playing");

    gameState = GameState.PLAYING;
  }

  function gameOver() {
    const finalScore = score;
    saveData.totalGamesPlayed++;
    saveData.totalPointsScored += finalScore;
    saveData.lastScore = finalScore;
    if (finalScore > saveData.highScore) {
      saveData.highScore = finalScore;
    }
    saveData.pausedSession = null;
    writeSaveData(saveData);

    lastScoreDisplay.textContent = `LAST SCORE: ${finalScore}`;
    lastScoreDisplay.classList.remove("hidden");
    updateMenuStats();

    gameState = GameState.MENU;
    pauseBtn.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    scoreDisplay.classList.add("hidden");
    menuOverlay.classList.remove("hidden");
    document.body.classList.remove("playing");

    balls = [];
    trailParticles = [];
    popParticles = [];
    scoreNotifications = [];
    disintegrationParticles = [];
  }

  function triggerDisintegration(badBall) {
    gameState = GameState.DISINTEGRATING;
    disintegrationTimer = 120; // ~2 seconds at 60fps cap

    pauseBtn.classList.add("hidden");

    playDeathHitSound();
    vibrate([100, 50, 200]);

    setTimeout(playGameOverMelody, 300);

    const cols = 6;
    const rows = 3;
    const cellW = basket.width / cols;
    const cellH = basket.height / rows;
    const basketLeft = basket.x - basket.width / 2;

    disintegrationParticles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        disintegrationParticles.push({
          x: basketLeft + c * cellW + cellW / 2,
          y: basket.y + r * cellH + cellH / 2,
          width: cellW,
          height: cellH,
          vx: randomFloat(-4, 4),
          vy: randomFloat(-6, 2),
          rotation: 0,
          rotationSpeed: randomFloat(-0.2, 0.2),
          gravity: 0.2,
          alpha: 1.0,
          decay: randomFloat(0.008, 0.02),
          color: PALETTE.freshSky
        });
      }
    }

    if (badBall) {
      spawnPopParticles(badBall.x, badBall.y, PALETTE.blazingFlame, 16);
    }
  }

  // --- Particles & Score Notifications ---
  function spawnPopParticles(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      popParticles.push({
        x: x,
        y: y,
        vx: randomFloat(-3, 3),
        vy: randomFloat(-5, -1),
        size: randomInt(3, 6),
        color: color,
        alpha: 1.0,
        decay: randomFloat(0.03, 0.06),
        gravity: 0.15
      });
    }
  }

  function spawnScoreNotification(x, y, color) {
    scoreNotifications.push({
      x: x,
      y: y,
      text: `+${SCORE_PER_GOOD_CATCH}`,
      alpha: 1.0,
      vy: -1.5,
      life: 60,
      color: color
    });
  }

  function spawnBall() {
    const isBad = Math.random() < currentBadChance;
    const color = isBad
      ? BAD_BALL_COLOR
      : GOOD_BALL_COLORS[Math.floor(Math.random() * GOOD_BALL_COLORS.length)];

    const speed = Math.min(
      BALL_MAX_SPEED,
      BALL_BASE_SPEED + (score / DIFFICULTY_STEP) * 0.5
    );

    const minX = BALL_RADIUS;
    const maxX = canvas.width - BALL_RADIUS;
    const randomX = minX + Math.random() * (maxX - minX);

    balls.push({
      x: randomX,
      y: 0 - BALL_RADIUS,
      radius: BALL_RADIUS,
      speed: speed,
      color: color,
      isBad: isBad
    });
  }

  // --- Update Loop ---
  function update() {
    frameCount++;

    if (gameState === GameState.PAUSED) {
      return;
    }

    // Update Pop Particles
    for (let i = popParticles.length - 1; i >= 0; i--) {
      const p = popParticles[i];
      p.x += p.vx;
      p.vy += p.gravity;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        popParticles.splice(i, 1);
      }
    }

    // Update Floating Score Notifications
    for (let i = scoreNotifications.length - 1; i >= 0; i--) {
      const n = scoreNotifications[i];
      n.y += n.vy;
      n.life--;
      n.alpha = Math.max(0, n.life / 60);
      if (n.life <= 0) {
        scoreNotifications.splice(i, 1);
      }
    }

    // State 1: Disintegrating
    if (gameState === GameState.DISINTEGRATING) {
      disintegrationTimer--;
      let allFaded = true;

      for (let i = 0; i < disintegrationParticles.length; i++) {
        const p = disintegrationParticles[i];
        p.x += p.vx;
        p.vy += p.gravity;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.alpha -= p.decay;
        if (p.alpha > 0) {
          allFaded = false;
        }
      }

      if (allFaded || disintegrationTimer <= 0) {
        gameOver();
      }
      return;
    }

    // State 2: Menu Ambient Balls Update
    if (gameState === GameState.MENU) {
      for (let i = 0; i < menuBalls.length; i++) {
        const mb = menuBalls[i];
        mb.y += mb.speed;
        if (mb.y - mb.radius > canvas.height) {
          Object.assign(mb, createMenuBall(false));
        }
      }
      return;
    }

    // State 3: Playing
    // Basket Trail Particles
    if (basket.x !== basket.prevX) {
      const numTrail = randomInt(2, 4);
      for (let i = 0; i < numTrail; i++) {
        trailParticles.push({
          x: basket.x + randomFloat(-basket.width / 2, basket.width / 2),
          y: basket.y + randomFloat(0, basket.height),
          size: randomInt(3, 6),
          alpha: 0.7,
          decay: randomFloat(0.02, 0.05)
        });
      }
      basket.prevX = basket.x;
    }

    // Update Trail Particles
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const tp = trailParticles[i];
      tp.alpha -= tp.decay;
      if (tp.alpha <= 0) {
        trailParticles.splice(i, 1);
      }
    }

    // Spawn Logic
    spawnTimer--;
    if (spawnTimer <= 0) {
      spawnBall();
      spawnTimer = currentSpawnInterval;
    }

    // Balls Physics & Radius-Aware Collisions (Plan_5 §2)
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      ball.y += ball.speed;

      if (isBallCaughtByBasket(ball, basket)) {
        if (ball.isBad) {
          triggerDisintegration(ball);
          return;
        } else {
          playCollectSound();
          vibrate(50);
          score += SCORE_PER_GOOD_CATCH;
          scoreDisplay.textContent = `SCORE: ${score}`;
          recalculateDifficulty();
          spawnPopParticles(ball.x, ball.y, ball.color, randomInt(8, 15));
          spawnScoreNotification(ball.x, ball.y, ball.color);
          balls.splice(i, 1);
          continue;
        }
      }

      if (ball.y - ball.radius > canvas.height) {
        balls.splice(i, 1);
      }
    }
  }

  // --- Rendering ---
  function drawBackgroundGrid() {
    ctx.fillStyle = PALETTE.yaleBlue;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += 25) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += 25) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
  }

  function drawVoxelBall(ball) {
    const cellSize = (ball.radius * 2) / 6;
    const startX = ball.x - ball.radius;
    const startY = ball.y - ball.radius;

    // Hard 3D pixel shadow (+3px, +3px)
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (BALL_MASK[r][c] === 1) {
          ctx.fillRect(startX + c * cellSize + 3, startY + r * cellSize + 3, cellSize, cellSize);
        }
      }
    }

    // Base Ball Voxel Rendering
    const lighterColor = ball.isBad ? "#1a1a1a" : adjustLightness(ball.color, 0.18);
    const darkerColor = ball.isBad ? "#000000" : adjustLightness(ball.color, -0.2);

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (BALL_MASK[r][c] === 1) {
          if (r <= 1 && c <= 2) {
            ctx.fillStyle = lighterColor;
          } else if (r >= 4 || c >= 4) {
            ctx.fillStyle = darkerColor;
          } else {
            ctx.fillStyle = ball.color;
          }
          ctx.fillRect(startX + c * cellSize, startY + r * cellSize, cellSize, cellSize);
        }
      }
    }

    // Bad Ball Pulse & Cross
    if (ball.isBad) {
      const pulseAlpha = 0.5 + 0.5 * Math.sin(frameCount * 0.1);
      ctx.strokeStyle = hexToRgba(PALETTE.blazingFlame, pulseAlpha);
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, startY, ball.radius * 2, ball.radius * 2);

      ctx.fillStyle = PALETTE.blazingFlame;
      const midX = ball.x;
      const midY = ball.y;
      ctx.fillRect(midX - 5, midY - 5, 3, 3);
      ctx.fillRect(midX + 2, midY - 5, 3, 3);
      ctx.fillRect(midX - 2, midY - 2, 4, 4);
      ctx.fillRect(midX - 5, midY + 2, 3, 3);
      ctx.fillRect(midX + 2, midY + 2, 3, 3);
    }
  }

  function drawBasketAt(posX, posY, width, height) {
    const basketLeft = posX - width / 2;

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(basketLeft + 3, posY + 3, width, height);

    ctx.fillStyle = BASKET_COLOR;
    ctx.fillRect(basketLeft, posY, width, height);

    ctx.fillStyle = adjustLightness(BASKET_COLOR, 0.2);
    ctx.fillRect(basketLeft, posY, width, 3);

    ctx.fillStyle = adjustLightness(BASKET_COLOR, -0.3);
    ctx.fillRect(basketLeft, posY + height - 3, width, 3);

    ctx.fillStyle = adjustLightness(BASKET_COLOR, -0.2);
    ctx.fillRect(basketLeft + width - 3, posY, 3, height);

    const blockWidth = 20;
    ctx.fillStyle = adjustLightness(BASKET_COLOR, -0.25);
    for (let bx = basketLeft + blockWidth; bx < basketLeft + width; bx += blockWidth) {
      ctx.fillRect(bx - 1, posY, 2, height);
    }
  }

  // --- Custom Voxel Cursor (Plan_5 §1) ---
  function drawVoxelCursor(x, y) {
    if (!cursorPos.visible || isTouch) return;

    const px = 3;
    const color = PALETTE.royalGold;
    const shadow = "rgba(0, 0, 0, 0.5)";

    const pattern = [
      [0, -3], [0, -2],
      [0, 2], [0, 3],
      [-3, 0], [-2, 0],
      [2, 0], [3, 0],
      [0, 0]
    ];

    // Shadow
    ctx.fillStyle = shadow;
    pattern.forEach(([ox, oy]) => {
      ctx.fillRect(x + ox * px + 1, y + oy * px + 1, px, px);
    });

    // Main voxel pixels
    ctx.fillStyle = color;
    pattern.forEach(([ox, oy]) => {
      ctx.fillRect(x + ox * px, y + oy * px, px, px);
    });
  }

  function render() {
    drawBackgroundGrid();

    // Menu state
    if (gameState === GameState.MENU) {
      for (let i = 0; i < menuBalls.length; i++) {
        drawVoxelBall(menuBalls[i]);
      }
      drawBasketAt(canvas.width / 2, canvas.height - BASKET_Y_OFFSET, BASKET_WIDTH, BASKET_HEIGHT);
      return;
    }

    // 1. Trail Particles
    for (let i = 0; i < trailParticles.length; i++) {
      const tp = trailParticles[i];
      ctx.fillStyle = hexToRgba(PALETTE.freshSky, tp.alpha);
      ctx.fillRect(tp.x, tp.y, tp.size, tp.size);
    }

    // 2. Balls (Playing or Paused)
    if (gameState === GameState.PLAYING || gameState === GameState.PAUSED) {
      for (let i = 0; i < balls.length; i++) {
        drawVoxelBall(balls[i]);
      }
    }

    // 3. Basket (Playing or Paused)
    if (gameState === GameState.PLAYING || gameState === GameState.PAUSED) {
      drawBasketAt(basket.x, basket.y, basket.width, basket.height);
    }

    // 4. Disintegration Particles
    if (gameState === GameState.DISINTEGRATING) {
      for (let i = 0; i < disintegrationParticles.length; i++) {
        const p = disintegrationParticles[i];
        if (p.alpha <= 0) continue;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        ctx.fillStyle = `rgba(0, 0, 0, ${p.alpha * 0.4})`;
        ctx.fillRect(-p.width / 2 + 2, -p.height / 2 + 2, p.width, p.height);

        ctx.fillStyle = hexToRgba(p.color, p.alpha);
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);

        ctx.fillStyle = hexToRgba("#ffffff", p.alpha * 0.25);
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, 2);

        ctx.restore();
      }
    }

    // 5. Pop Particles
    for (let i = 0; i < popParticles.length; i++) {
      const p = popParticles[i];
      ctx.fillStyle = `rgba(0, 0, 0, ${p.alpha * 0.35})`;
      ctx.fillRect(p.x + 2, p.y + 2, p.size, p.size);

      ctx.fillStyle = hexToRgba(p.color, p.alpha);
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }

    // 6. Floating Score Notifications
    for (let i = 0; i < scoreNotifications.length; i++) {
      const n = scoreNotifications[i];
      ctx.save();
      ctx.globalAlpha = n.alpha;
      ctx.font = "bold 14px 'Press Start 2P', 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillText(n.text, n.x + 2, n.y + 2);

      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
      ctx.fillText(n.text, n.x + 1, n.y);

      ctx.restore();
    }

    // 7. Custom Voxel Cursor (Plan_5 §1) - Drawn last, on top of all canvas layers
    if (gameState === GameState.PLAYING || gameState === GameState.PAUSED) {
      drawVoxelCursor(cursorPos.x, cursorPos.y);
    }
  }

  function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
  }

  // --- Initialisation ---
  function init() {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");

    menuOverlay = document.getElementById("menuOverlay");
    startBtn = document.getElementById("startBtn");
    highScoreDisplay = document.getElementById("highScoreDisplay");
    lastScoreDisplay = document.getElementById("lastScoreDisplay");
    totalGamesDisplay = document.getElementById("totalGamesDisplay");
    totalPointsDisplay = document.getElementById("totalPointsDisplay");
    resetDataBtn = document.getElementById("resetDataBtn");
    muteBtn = document.getElementById("muteBtn");

    scoreDisplay = document.getElementById("scoreDisplay");
    pauseBtn = document.getElementById("pauseBtn");

    pauseOverlay = document.getElementById("pauseOverlay");
    continueBtn = document.getElementById("continueBtn");
    quitBtn = document.getElementById("quitBtn");
    pauseMuteBtn = document.getElementById("pauseMuteBtn");

    resetModal = document.getElementById("resetModal");
    resetConfirmBtn = document.getElementById("resetConfirmBtn");
    resetCancelBtn = document.getElementById("resetCancelBtn");

    handleResize();
    window.addEventListener("resize", handleResize);

    // Apply persistent data & mute state
    saveData = loadSaveData();
    isMuted = Boolean(saveData.isMuted);
    updateMuteButtons();
    updateMenuStats();

    // Check for saved paused session or restore last score
    if (saveData.pausedSession) {
      restorePausedSession(saveData.pausedSession);
    } else {
      gameState = GameState.MENU;
      menuOverlay.classList.remove("hidden");
      if (saveData.lastScore !== null && saveData.lastScore !== undefined) {
        lastScoreDisplay.textContent = `LAST SCORE: ${saveData.lastScore}`;
        lastScoreDisplay.classList.remove("hidden");
      } else {
        lastScoreDisplay.classList.add("hidden");
      }
    }

    // Start Button
    startBtn.addEventListener("click", startGame);

    // Pause & Resume Event Listeners
    pauseBtn.addEventListener("click", pauseGame);
    continueBtn.addEventListener("click", resumeGame);
    quitBtn.addEventListener("click", quitToMenu);

    // Mute Toggles
    muteBtn.addEventListener("click", toggleMute);
    pauseMuteBtn.addEventListener("click", toggleMute);

    // Reset Modal Listeners
    resetDataBtn.addEventListener("click", showResetModal);
    resetCancelBtn.addEventListener("click", hideResetModal);
    resetConfirmBtn.addEventListener("click", confirmReset);

    // Generic button sounds on mousedown
    [startBtn, continueBtn, quitBtn, muteBtn, pauseMuteBtn, resetDataBtn, resetConfirmBtn, resetCancelBtn, pauseBtn].forEach((btn) => {
      if (btn) {
        btn.addEventListener("mousedown", () => ensureAudioContext());
      }
    });

    // Pointer Events for Basket & Custom Cursor (Plan_5 §1 & §4)
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerleave", onPointerLeave);

    // Prevent default touch gestures (pinch-zoom, scroll)
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

    // Keyboard Shortcuts (Escape to Pause/Resume/Close Modal)
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!resetModal.classList.contains("hidden")) {
          hideResetModal();
        } else if (gameState === GameState.PLAYING) {
          pauseGame();
        } else if (gameState === GameState.PAUSED) {
          resumeGame();
        }
      }
    });

    // Audio context unlock on first user interaction
    window.addEventListener(
      "click",
      function () {
        ensureAudioContext();
      },
      { once: true }
    );

    requestAnimationFrame(gameLoop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
