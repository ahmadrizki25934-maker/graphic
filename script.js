const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const handCountEl = document.getElementById("handCount");
const fpsValueEl = document.getElementById("fpsValue");

// === Kamera ===
async function startCamera(){
    try{
        const stream = await navigator.mediaDevices.getUserMedia({ video:true });
        video.srcObject = stream;
        statusText.textContent = "Memuat model...";
    }catch(err){
        statusText.textContent = "Kamera tidak tersedia";
        console.error(err);
    }
}

startCamera();

// === MediaPipe Hands ===
const hands = new Hands({
    locateFile:(file)=>{
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands:2,
    modelComplexity:1,
    minDetectionConfidence:0.7,
    minTrackingConfidence:0.7
});

hands.onResults(onResults);

const camera = new Camera(video,{
    onFrame:async()=>{
        await hands.send({ image:video });
    },
    width:1280,
    height:720
});

camera.start();

// === FPS counter ===
let lastFrameTime = performance.now();
let fps = 0;

/*
  Karena video memakai object-fit: cover, video di-crop secara visual
  agar pas mengisi container, sedangkan titik landmark dari MediaPipe
  dihitung relatif terhadap resolusi ASLI video (videoWidth x videoHeight).
  Kalau canvas cuma di-stretch 100% tanpa memperhitungkan crop itu,
  titik-titiknya jadi geser dari posisi tangan yang sebenarnya.

  Fungsi ini mereplikasi logika "cover" milik CSS: menghitung skala dan
  offset crop yang sama persis, supaya titik landmark presisi menimpa
  tangan di video.
*/
function getCoverTransform(containerW, containerH, sourceW, sourceH){
    const containerRatio = containerW / containerH;
    const sourceRatio = sourceW / sourceH;

    let scale, offsetX = 0, offsetY = 0;

    if(sourceRatio > containerRatio){
        // sumber lebih lebar -> sisi kiri/kanan ter-crop
        scale = containerH / sourceH;
        offsetX = (containerW - sourceW * scale) / 2;
    } else {
        // sumber lebih tinggi -> sisi atas/bawah ter-crop
        scale = containerW / sourceW;
        offsetY = (containerH - sourceH * scale) / 2;
    }

    return { scale, offsetX, offsetY };
}

function onResults(results){
    // canvas resolusi internal disamakan dengan ukuran tampilan (container),
    // bukan dengan resolusi asli video, supaya 1:1 dengan transform "cover".
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;

    if(canvas.width !== displayW || canvas.height !== displayH){
        canvas.width = displayW;
        canvas.height = displayH;
    }

    ctx.clearRect(0,0,canvas.width,canvas.height);

    // FPS
    const now = performance.now();
    const delta = now - lastFrameTime;
    lastFrameTime = now;
    fps = Math.round(1000 / delta);
    fpsValueEl.textContent = fps;

    const sourceW = video.videoWidth || canvas.width;
    const sourceH = video.videoHeight || canvas.height;

    const { scale, offsetX, offsetY } = getCoverTransform(
        canvas.width, canvas.height, sourceW, sourceH
    );

    if(results.multiHandLandmarks && results.multiHandLandmarks.length > 0){
        statusDot.classList.add("active");
        statusText.textContent = "Tangan terdeteksi";
        handCountEl.textContent = results.multiHandLandmarks.length;

        ctx.save();
        // gambar di koordinat piksel video asli (setelah scale+offset),
        // lalu flip horizontal supaya cocok dengan video yang scaleX(-1)
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);

        for(const landmarks of results.multiHandLandmarks){
            // landmark MediaPipe ternormalisasi 0..1 relatif video asli.
            // Konversi ke koordinat piksel video asli, lalu terapkan
            // scale + offset yang sama dengan crop "cover".
            const mapped = landmarks.map(lm => ({
                x: (lm.x * sourceW * scale + offsetX) / canvas.width,
                y: (lm.y * sourceH * scale + offsetY) / canvas.height,
                z: lm.z
            }));

            drawConnectors(
                ctx,
                mapped,
                HAND_CONNECTIONS,
                {
                    color:"#00ffe0",
                    lineWidth:2
                }
            );

            drawLandmarks(
                ctx,
                mapped,
                {
                    color:"#ffffff",
                    fillColor:"#00ffe0",
                    radius:5
                }
            );
        }

        ctx.restore();
    } else {
        statusDot.classList.remove("active");
        statusText.textContent = "Mencari tangan...";
        handCountEl.textContent = "0";
    }
}
