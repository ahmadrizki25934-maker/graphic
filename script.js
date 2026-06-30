const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fpsCounter = document.getElementById("fps-counter");

// Cache Offscreen Canvas untuk performa efek Pixelate/Blur cepat tanpa redraw berat
const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d");

// ===== STATE CONFIGURATION & ADAPTIVE LERP =====
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;
let globalTime = 0;

// Struktur data koordinat internal untuk 4 Sudut Utama AI Frame (Smoothed)
const hudFrame = {
    topLeft:     { x: 0, y: 0, targetX: 0, targetY: 0, active: false },
    bottomLeft:  { x: 0, y: 0, targetX: 0, targetY: 0, active: false },
    topRight:    { x: 0, y: 0, targetX: 0, targetY: 0, active: false },
    bottomRight: { x: 0, y: 0, targetX: 0, targetY: 0, active: false },
    opacity: 0, // Animasi Fade In/Out
    isValid: false
};

// Inisialisasi MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.75,
    minTrackingConfidence: 0.75
});

hands.onResults(onHandResults);

// Utility Camera MediaPipe (Mengontrol siklus hardware secara tunggal)
const camera = new Camera(video, {
    onFrame: async () => {
        await hands.send({ image: video });
    },
    width: 1280,
    height: 720
});
camera.start();

// ===== ADAPTIVE LERP MATH LOGIC =====
function adaptiveLerp(current, target) {
    const distance = Math.hypot(target.x - current.x, target.y - current.y);
    let lerpFactor = distance > 40 ? 0.35 : 0.15; 
    
    current.x += (target.x - current.x) * lerpFactor;
    current.y += (target.y - current.y) * lerpFactor;
}

// ===== CORE PROCESSING PIPELINE =====
function onHandResults(results) {
    // 1. SINKRONISASI RESOLUSI INTERNAL DENGAN UKURAN ASLI VIDEO (1:1 ANTI OFFSET)
    if (video.videoWidth && video.videoHeight) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let leftHand = null;
    let rightHand = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
        results.multiHandLandmarks.forEach((landmarks, index) => {
            const label = results.multiHandedness[index].label; 
            
            // Menggambar skeleton bawaan langsung di atas koordinat asli video
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "rgba(0, 255, 128, 0.4)", lineWidth: 4 });
            drawLandmarks(ctx, landmarks, { color: "#00ff80", fillColor: "#ffffff", radius: 5 });

            if (label === "Left") leftHand = landmarks;
            if (label === "Right") rightHand = landmarks;
        });
    }

    // 2. MAPPING LANDMARK JARI KE EMULASI SUDUT HUD
    if (leftHand && rightHand) {
        hudFrame.isValid = true;
        
        // Tangan Kiri mengontrol Sisi Kiri (Top Left & Bottom Left)
        hudFrame.topLeft.targetX     = leftHand[8].x * canvas.width;
        hudFrame.topLeft.targetY     = leftHand[8].y * canvas.height;
        hudFrame.bottomLeft.targetX  = leftHand[4].x * canvas.width;
        hudFrame.bottomLeft.targetY  = leftHand[4].y * canvas.height;

        // Tangan Kanan mengontrol Sisi Kanan (Top Right & Bottom Right)
        hudFrame.topRight.targetX    = rightHand[8].x * canvas.width;
        hudFrame.topRight.targetY    = rightHand[8].y * canvas.height;
        hudFrame.bottomRight.targetX = rightHand[4].x * canvas.width;
        hudFrame.bottomRight.targetY = rightHand[4].y * canvas.height;
        
        hudFrame.opacity = Math.min(1, hudFrame.opacity + 0.08);
    } else {
        hudFrame.isValid = false;
        hudFrame.opacity = Math.max(0, hudFrame.opacity - 0.05);
    }

    // 3. MENGEKSEKUSI SMOOTHING PERGERAKAN (EMA / LERP ADAPTIF)
    if (hudFrame.opacity > 0) {
        adaptiveLerp(hudFrame.topLeft, { x: hudFrame.topLeft.targetX, y: hudFrame.topLeft.targetY });
        adaptiveLerp(hudFrame.bottomLeft, { x: hudFrame.bottomLeft.targetX, y: hudFrame.bottomLeft.targetY });
        adaptiveLerp(hudFrame.topRight, { x: hudFrame.topRight.targetX, y: hudFrame.topRight.targetY });
        adaptiveLerp(hudFrame.bottomRight, { x: hudFrame.bottomRight.targetX, y: hudFrame.bottomRight.targetY });
        
        // Render Seluruh Efek Visual AI HUD ke Layar Utama
        renderCyberHUDFrame();
    }

    // Penghitung FPS Sistem Real-time
    frameCount++;
    const now = performance.now();
    globalTime = now * 0.002; 
    if (now - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = now;
        fpsCounter.innerText = `SYS_FPS: ${fps}`;
    }
}

// ===== ADVANCED CANVAS RENDERING API =====
function renderCyberHUDFrame() {
    ctx.save();
    ctx.globalAlpha = hudFrame.opacity;

    const pTL = hudFrame.topLeft;
    const pBL = hudFrame.bottomLeft;
    const pTR = hudFrame.topRight;
    const pBR = hudFrame.bottomRight;

    // --- FITUR A: POLYGON DYNAMIC PIXEL BLUR ---
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pTL.x, pTL.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();
    ctx.clip(); // Membatasi area gambar hanya di dalam polygon bentukan jari

    const pixelSize = 16; 
    offscreenCanvas.width = canvas.width / pixelSize;
    offscreenCanvas.height = canvas.height / pixelSize;
    
    // Gambar video asli tanpa modifikasi transform ke offscreen canvas kecil
    offscreenCtx.imageSmoothingEnabled = false;
    offscreenCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
    
    // Kembalikan ukuran ke kanvas utama agar pecah/pikselasi sempurna dan presisi 1:1
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
    
    // Overlay warna hijau cyber transparan
    ctx.fillStyle = "rgba(0, 255, 128, 0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Efek Scanline Berjalan
    const scanlineY = (performance.now() * 0.1) % canvas.height;
    ctx.strokeStyle = "rgba(0, 255, 128, 0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, scanlineY);
    ctx.lineTo(canvas.width, scanlineY);
    ctx.stroke();
    ctx.restore();

    // --- FITUR B: DYNAMIC CONNECTING LINES (GARIS HUBUNG ANTI PUTUS) ---
    const glowIntensity = 5 + Math.sin(globalTime * 3) * 3;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = glowIntensity;
    ctx.shadowColor = "#00ff80";

    ctx.beginPath();
    ctx.moveTo(pTL.x, pTL.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();
    ctx.stroke();

    // --- FITUR C: HUD CORNER STYLE FORM (BENTUK HURUF L PADA UJUNG JARI) ---
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#00ff80";
    
    const avgDist = Math.hypot(pTR.x - pTL.x, pTR.y - pTL.y) * 0.15;
    const len = Math.max(15, Math.min(35, avgDist)); 

    // 1. Sudut Kiri Atas
    ctx.beginPath();
    ctx.moveTo(pTL.x + len, pTL.y); ctx.lineTo(pTL.x, pTL.y); ctx.lineTo(pTL.x, pTL.y + len);
    ctx.stroke();

    // 2. Sudut Kanan Atas
    ctx.beginPath();
    ctx.moveTo(pTR.x - len, pTR.y); ctx.lineTo(pTR.x, pTR.y); ctx.lineTo(pTR.x, pTR.y + len);
    ctx.stroke();

    // 3. Sudut Kanan Bawah
    ctx.beginPath();
    ctx.moveTo(pBR.x - len, pBR.y); ctx.lineTo(pBR.x, pBR.y); ctx.lineTo(pBR.x, pBR.y - len);
    ctx.stroke();

    // 4. Sudut Kiri Bawah
    ctx.beginPath();
    ctx.moveTo(pBL.x + len, pBL.y); ctx.lineTo(pBL.x, pBL.y); ctx.lineTo(pBL.x, pBL.y - len);
    ctx.stroke();

    // Teks Indikator Real-time (di-mirror balik khusus teks agar tulisan tidak terbalik dibaca)
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px monospace";
    
    ctx.save();
    ctx.translate(pTL.x + 5, pTL.y - 10);
    ctx.scale(-1, 1); // Membalikkan teks agar terbaca normal dari kiri ke kanan di layar ter-mirror
    ctx.fillText("AI_STRETCH_MASK_MATRIX", -180, 0); 
    ctx.restore();

    ctx.restore();
}
