const canvas = document.getElementById('matrixCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";
const fontSize = 16;
let columns = Math.floor(canvas.width / fontSize);
let rainDrops = Array(columns).fill(1);

// Configuration States
let themeColor = '#00ff66';
let loopInterval;
let currentSpeed = 30;
let audioCtx = null;
let isMuted = false;
let longTrailMode = false; // New state tracking

const mouse = { x: undefined, y: undefined, radius: 120 };

function playGlitchTone(freq) {
    if (isMuted) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.01, audioCtx.currentTime); 
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch(e) {}
}

function handleInteraction(clientX, clientY) {
    mouse.x = clientX;
    mouse.y = clientY;
    playGlitchTone(100 + (clientY / window.innerHeight) * 300);
}

window.addEventListener('mousemove', (e) => handleInteraction(e.clientX, e.clientY));
window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) handleInteraction(e.touches.clientX, e.touches.clientY);
});

// UI Event Responders
function changeColor(primary) {
    themeColor = primary;
    const panel = document.getElementById('controlPanel');
    const header = document.querySelector('h3');
    const slider = document.getElementById('speedSlider');
    const showBtn = document.getElementById('showHUDButton');
    const trailBtn = document.getElementById('trailToggleBtn');
    
    panel.style.borderColor = primary;
    panel.style.boxShadow = `0 0 20px ${primary}33`;
    header.style.borderBottomColor = primary;
    header.style.color = primary;
    slider.style.accentColor = primary;
    slider.style.borderColor = primary;
    showBtn.style.borderColor = primary;
    
    trailBtn.style.borderColor = primary;
    trailBtn.style.color = primary;
}

// Mute and HUD Switches
document.getElementById('muteButton').addEventListener('click', () => {
    isMuted = !isMuted;
    document.getElementById('muteButton').innerText = isMuted ? '🔇' : '🔊';
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

// Trail Switch Logic
document.getElementById('trailToggleBtn').addEventListener('click', (e) => {
    longTrailMode = !longTrailMode;
    e.target.innerText = longTrailMode ? "TRAIL MODE: FLUID GLOW" : "TRAIL MODE: CLASSIC";
});

// Theme listeners
document.getElementById('btn-green').addEventListener('click', () => changeColor('#00ff66'));
document.getElementById('btn-pink').addEventListener('click', () => changeColor('#ff007f'));
document.getElementById('btn-gold').addEventListener('click', () => changeColor('#ffaa00'));
document.getElementById('btn-blue').addEventListener('click', () => changeColor('#00ffff'));

document.getElementById('speedSlider').addEventListener('input', (e) => {
    currentSpeed = parseInt(e.target.value);
    startEngine(currentSpeed);
});

// Primary Rendering Cycle
function draw() {
    // If fluid mode is active, trail drops fade slower creating sweeping light beams
    ctx.fillStyle = longTrailMode ? 'rgba(0, 0, 0, 0.018)' : 'rgba(0, 0, 0, 0.05)';
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
            // SPEED FLICKER UPGRADE: High engine speeds make spotlight glow flash erratically
            if (currentSpeed > 75 && Math.random() > 0.85) {
                ctx.fillStyle = 'rgba(0,0,0,0)'; // momentary dark dropout frame
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = '#ffffff'; 
                ctx.shadowColor = themeColor;
                ctx.shadowBlur = 25;
            }
        } else {
            ctx.fillStyle = themeColor; 
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }

        if (!isNearMouse && Math.random() > 0.98) {
            ctx.fillStyle = '#fff';
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
