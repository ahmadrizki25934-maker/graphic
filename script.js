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
function adaptiveLerp(current, target, lastDelta) {
    // Jika pergerakan jari sangat cepat (lastDelta besar), kurangi smoothing agar responsif (lerpFactor naik)
    // Jika pergerakan lambat, naikkan smoothing agar stabil bebas jitter (lerpFactor turun)
    const distance = Math.hypot(target.x - current.x, target.y - current.y);
    let lerpFactor = distance > 40 ? 0.35 : 0.15; 
    
    current.x += (target.x - current.x) * lerpFactor;
    current.y += (target.y - current.y) * lerpFactor;
}

// ===== CORE PROCESSING PIPELINE =====
function onHandResults(results) {
    // 1. SINKRONISASI TOTAL UKURAN FRAME: Menghilangkan bug "Meluber ke bawah"
    if (video.clientWidth && video.clientHeight) {
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
            canvas.width = video.clientWidth;
            canvas.height = video.clientHeight;
        }
    } else {
        canvas.width = 900;
        canvas.height = 506;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Reset status deteksi tiap frame sebelum pengecekan silang koordinat tangan
    let leftHand = null;
    let rightHand = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
        results.multiHandLandmarks.forEach((landmarks, index) => {
            const label = results.multiHandedness[index].label; // "Left" atau "Right" dari perspektif kamera mentah
            
            // Menggambar kerangka tangan bawaan project Anda agar fungsi lama tidak terhapus
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "rgba(0, 255, 128, 0.4)", lineWidth: 2 });
            drawLandmarks(ctx, landmarks, { color: "#00ff80", fillColor: "#ffffff", radius: 4 });

            if (label === "Left") leftHand = landmarks;
            if (label === "Right") rightHand = landmarks;
        });
    }

    // 2. MAPPING LANDMARK JARI KE EMULASI SUDUT HUD
    // Sesuai Instruksi: 4 Sudut utama dibentuk murni dari ujung ibu jari (4) dan telunjuk (8) dari kedua tangan
    if (leftHand && rightHand) {
        hudFrame.isValid = true;
        
        // Tangan Kiri mengontrol Sudut Sisi Kiri (Top Left & Bottom Left)
        hudFrame.topLeft.targetX     = leftHand[8].x * canvas.width;
        hudFrame.topLeft.targetY     = leftHand[8].y * canvas.height;
        hudFrame.bottomLeft.targetX  = leftHand[4].x * canvas.width;
        hudFrame.bottomLeft.targetY  = leftHand[4].y * canvas.height;

        // Tangan Kanan mengontrol Sudut Sisi Kanan (Top Right & Bottom Right)
        hudFrame.topRight.targetX    = rightHand[8].x * canvas.width;
        hudFrame.topRight.targetY    = rightHand[8].y * canvas.height;
        hudFrame.bottomRight.targetX = rightHand[4].x * canvas.width;
        hudFrame.bottomRight.targetY = rightHand[4].y * canvas.height;
        
        // Fade-in Animation (Mencapai 100% dalam ~250ms)
        hudFrame.opacity = Math.min(1, hudFrame.opacity + 0.08);
    } else {
        hudFrame.isValid = false;
        // Fade-out Animation jika salah satu tangan lepas dari deteksi sensor (~350ms)
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
    globalTime = now * 0.002; // Dipakai untuk animasi Breathing Glow
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

    // --- FITUR A: POLYGON DYNAMIC PIXEL BLUR (DOWN-SAMPLING MASKING) ---
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pTL.x, pTL.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();
    ctx.clip(); // Membatasi area gambar hanya di dalam polygon bentukan jari

    // Seting resolusi super kecil untuk offscreen canvas demi efek pikselasi retro hitech
    const pixelSize = 16; 
    offscreenCanvas.width = canvas.width / pixelSize;
    offscreenCanvas.height = canvas.height / pixelSize;
    
    offscreenCtx.imageSmoothingEnabled = false;
    // Gambar video asli kamera ke kanvas kecil (proses downsampling otomatis memburamkan objek)
    offscreenCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
    
    ctx.imageSmoothingEnabled = false;
    // Gambar ulang kanvas kecil yang pecah ke kanvas utama (menghasilkan pixelation efek murni tanpa drop fps)
    ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
    
    // Memberikan overlay warna cyber transparan di dalam area polygon terpotong
    ctx.fillStyle = "rgba(0, 255, 128, 0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Efek Scanline Berjalan di dalam Kotak Seleksi
    const scanlineY = (performance.now() * 0.1) % canvas.height;
    ctx.strokeStyle = "rgba(0, 255, 128, 0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, scanlineY);
    ctx.lineTo(canvas.width, scanlineY);
    ctx.stroke();
    ctx.restore();

    // --- FITUR B: DYNAMIC CONNECTING LINES (GARIS HUBUNG ANTI PUTUS) ---
    // Ditambahkan efek breathing glow tipis yang berdenyut lambat secara presisi
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
    
    // Panjang siku dinamis menyesuaikan jarak rentang antar jari agar proporsional
    const avgDist = Math.hypot(pTR.x - pTL.x, pTR.y - pTL.y) * 0.15;
    const len = Math.max(15, Math.min(35, avgDist)); 

    // 1. Sudut Kiri Atas (Ujung Telunjuk Kiri)
    ctx.beginPath();
    ctx.moveTo(pTL.x + len, pTL.y); ctx.lineTo(pTL.x, pTL.y); ctx.lineTo(pTL.x, pTL.y + len);
    ctx.stroke();

    // 2. Sudut Kanan Atas (Ujung Telunjuk Kanan)
    ctx.beginPath();
    ctx.moveTo(pTR.x - len, pTR.y); ctx.lineTo(pTR.x, pTR.y); ctx.lineTo(pTR.x, pTR.y + len);
    ctx.stroke();

    // 3. Sudut Kanan Bawah (Ujung Ibu Jari Kanan)
    ctx.beginPath();
    ctx.moveTo(pBR.x - len, pBR.y); ctx.lineTo(pBR.x, pBR.y); ctx.lineTo(pBR.x, pBR.y - len);
    ctx.stroke();

    // 4. Sudut Kiri Bawah (Ujung Ibu Jari Kiri)
    ctx.beginPath();
    ctx.moveTo(pBL.x + len, pBL.y); ctx.lineTo(pBL.x, pBL.y); ctx.lineTo(pBL.x, pBL.y - len);
    ctx.stroke();

    // Teks Indikator Real-time Data AI Vision Target Lock
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px monospace";
    ctx.fillText("AI_STRETCH_MASK_MATRIX", pTL.x + 5, pTL.y - 10);

    ctx.restore();
}
