const canvas = document.getElementById('matrixCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const alphabet = "0123456789ABCDEF//[]{}<>-+_*&^%\$#@!X";
const fontSize = 14;
let columns = Math.floor(canvas.width / fontSize);
let rainDrops = Array(columns).fill(1);

let themeColor = '#10b981';
let loopInterval;
let currentSpeed = 30;
let audioCtx = null;
let isMuted = true;
let longTrailMode = false;

const mouse = { x: undefined, y: undefined, radius: 140 };

function playGlitchTone(freq) {
    if (isMuted) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.005, audioCtx.currentTime); 
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } catch(e) {}
}

function handleInteraction(clientX, clientY) {
    mouse.x = clientX;
    mouse.y = clientY;
    playGlitchTone(150 + (clientY / window.innerHeight) * 200);
}

window.addEventListener('mousemove', (e) => handleInteraction(e.clientX, e.clientY));
window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) handleInteraction(e.touches.clientX, e.touches.clientY);
});

function changeColor(primary) {
    themeColor = primary;
    const panel = document.getElementById('controlPanel');
    const header = document.querySelector('h3');
    const slider = document.getElementById('speedSlider');
    const showBtn = document.getElementById('showHUDButton');
    const trailBtn = document.getElementById('trailToggleBtn');
    const labels = document.querySelectorAll('label');
    const inputWrap = document.querySelector('.input-wrapper');
    const telemetryGrid = document.querySelector('.telemetry-grid');
    
    panel.style.borderColor = primary;
    header.style.borderBottomColor = primary;
    header.style.color = primary;
    slider.style.accentColor = primary;
    showBtn.style.borderColor = primary;
    trailBtn.style.borderColor = primary;
    trailBtn.style.color = primary;
    if (inputWrap) inputWrap.style.borderColor = `${primary}33`;
    if (telemetryGrid) telemetryGrid.style.borderColor = `${primary}33`;
    
    labels.forEach(lbl => lbl.style.color = primary);
    updateNetworkStatus();
}

document.getElementById('muteButton').addEventListener('click', () => {
    isMuted = !isMuted;
    document.getElementById('muteButton').innerText = isMuted ? 'AUDIO OFF' : 'AUDIO ON';
});

const controlPanel = document.getElementById('controlPanel');
const showHUDButton = document.getElementById('showHUDButton');

document.getElementById('hideButton').addEventListener('click', () => {
    controlPanel.classList.add('hidden');
    showHUDButton.classList.remove('hidden');
});

showHUDButton.addEventListener('click', () => {
    showHUDButton.classList.add('hidden');
    controlPanel.classList.remove('hidden');
});

document.getElementById('trailToggleBtn').addEventListener('click', (e) => {
    longTrailMode = !longTrailMode;
    e.target.innerText = longTrailMode ? "TRAIL PROCESSING: DEEP FIELD" : "TRAIL PROCESSING: INSTANT FADE";
});

document.getElementById('btn-green').addEventListener('click', () => changeColor('#10b981'));
document.getElementById('btn-pink').addEventListener('click', () => changeColor('#ec4899'));
document.getElementById('btn-gold').addEventListener('click', () => changeColor('#f59e0b'));
document.getElementById('btn-blue').addEventListener('click', () => changeColor('#06b6d4'));

document.getElementById('speedSlider').addEventListener('input', (e) => {
    currentSpeed = parseInt(e.target.value);
    startEngine(currentSpeed);
});

function updateNetworkStatus() {
    const netStatus = document.getElementById('netStatus');
    if (netStatus) {
        if (navigator.onLine) {
            netStatus.innerText = "ONLINE / SECURE";
            netStatus.style.color = '#ffffff';
        } else {
            netStatus.innerText = "DISCONNECTED";
            netStatus.style.color = "#ec4899";
        }
    }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

// FIXED BUG: Safe fallback configuration for the Battery Tracker API
if ('getBattery' in navigator) {
    navigator.getBattery().then(function(battery) {
        function updateBatteryInfo() {
            // Guarding against NaN values returned by restrictive browser profiles
            const rawLevel = battery.level;
            const levelNum = (isNaN(rawLevel) || rawLevel === null || rawLevel === undefined) ? 100 : Math.floor(rawLevel * 100);
            const level = levelNum + "%";
            const charging = battery.charging ? " (CONNECTED)" : " (DISCHARGING)";
            document.getElementById('batteryStatus').innerText = level + charging;
        }
        updateBatteryInfo();
        battery.addEventListener('levelchange', updateBatteryInfo);
        battery.addEventListener('chargingchange', updateBatteryInfo);
    });
} else {
    document.getElementById('batteryStatus').innerText = "UNSUPPORTED";
}

function draw() {
    ctx.fillStyle = longTrailMode ? 'rgba(3, 7, 18, 0.015)' : 'rgba(3, 7, 18, 0.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = fontSize + 'px monospace';

    for (let i = 0; i < rainDrops.length; i++) {
        const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        const x = i * fontSize;
        const y = rainDrops[i] * fontSize;

        let isNearMouse = false;
        if (mouse.x !== undefined && mouse.y !== undefined) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            if (Math.sqrt(dx * dx + dy * dy) < mouse.radius) {
                isNearMouse = true;
            }
        }

        if (isNearMouse) {
            if (currentSpeed > 75 && Math.random() > 0.85) {
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = '#ffffff'; 
                ctx.shadowColor = themeColor;
                ctx.shadowBlur = 20;
            }
        } else {
            ctx.fillStyle = themeColor; 
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }

        if (!isNearMouse && Math.random() > 0.98) {
            ctx.fillStyle = '#ffffff';
        }

        ctx.fillText(text, x, y);

        if (y > canvas.height && Math.random() > 0.975) {
            rainDrops[i] = 0;
        }
        rainDrops[i]++;
    }
}

function startEngine(speed) {
    clearInterval(loopInterval);
    loopInterval = setInterval(draw, 110 - speed); 
}

startEngine(currentSpeed);
