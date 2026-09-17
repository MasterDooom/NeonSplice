(function() {
    'use strict';
    const {Game, COLOURS} = window.NeonEngine;
    const engine = new Game();
    const $ = id => document.getElementById(id);
    const canvas = $('scene')
      , ctx = canvas.getContext('2d', {
        alpha: false
    });
    const shell = $('game');
    const soundtrack = $('soundtrack');
    const keyButtons = Array.from(document.querySelectorAll('[data-colour]'));
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let selectedMode = 'normal';
    let lowFX = prefersReduced
      , soundEnabled = false
      , soundChosen = false;
    try {
        const fx = localStorage.getItem('neon-splice-low-fx');
        if (fx !== null)
            lowFX = fx === 'true';
        const s = localStorage.getItem('neon-splice-sound');
        if (s !== null) {
            soundEnabled = s === 'true';
            soundChosen = true;
        }
    } catch {}
    let width = 0
      , height = 0
      , dpr = 1
      , clock = 0
      , travel = 0
      , lastTime = 0
      , feedbackUntil = 0
      , milestoneUntil = 0
      , deadTime = -10
      , lastInput = -10
      , frameAccent = COLOURS[0].hex;
    let bgGradient = null
      , glowGradient = null
      , particles = []
      , gateEchoes = []
      , shake = 0
      , resultsShown = false;
    const stars = Array.from({
        length: 95
    }, () => ({
        a: Math.random() * Math.PI * 2,
        t: Math.random(),
        length: .018 + Math.random() * .08,
        cyan: Math.random() > .34
    }));

    class Synth {
        constructor() {
            this.context = null;
            this.master = null;
            this.enabled = false;
            this.nextNote = 0;
            this.step = 0;
            this.active = false;
            this.noise = null;
        }
        unlock() {
            try {
                if (!this.context) {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (!AC)
                        return false;
                    this.context = new AC();
                    const compressor = this.context.createDynamicsCompressor();
                    compressor.threshold.value = -15;
                    compressor.ratio.value = 5;
                    this.master = this.context.createGain();
                    this.master.gain.value = .22;
                    this.master.connect(compressor);
                    compressor.connect(this.context.destination);
                    this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
                    const channel = this.noise.getChannelData(0);
                    for (let i = 0; i < channel.length; i++)
                        channel[i] = Math.random() * 2 - 1;
                    this.timer = setInterval( () => this.schedule(), 75);
                }
                if (this.context.state === 'suspended')
                    this.context.resume().catch( () => {}
                    );
                return true;
            } catch {
                return false;
            }
        }
        setEnabled(enabled) {
            this.enabled = enabled;
            if (this.context) {
                this.master.gain.setTargetAtTime(enabled ? .22 : 0, this.context.currentTime, .03);
                this.nextNote = this.context.currentTime + .03;
            }
        }
        tone(freq, time, duration, type='sine', volume=.2, endFreq=null) {
            if (!this.context || !this.enabled)
                return;
            const osc = this.context.createOscillator()
              , gain = this.context.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, time);
            if (endFreq)
                osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
            gain.gain.setValueAtTime(.0001, time);
            gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume), time + .008);
            gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
            osc.connect(gain);
            gain.connect(this.master);
            osc.start(time);
            osc.stop(time + duration + .03);
            osc.onended = () => {
                osc.disconnect();
                gain.disconnect();
            }
            ;
        }
        hiss(time, duration, volume=.12, highpass=5000) {
            if (!this.context || !this.enabled)
                return;
            const src = this.context.createBufferSource()
              , gain = this.context.createGain()
              , filter = this.context.createBiquadFilter();
            src.buffer = this.noise;
            filter.type = 'highpass';
            filter.frequency.value = highpass;
            gain.gain.setValueAtTime(volume, time);
            gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
            src.connect(filter);
            filter.connect(gain);
            gain.connect(this.master);
            src.start(time);
            src.stop(time + duration + .02);
            src.onended = () => {
                src.disconnect();
                filter.disconnect();
                gain.disconnect();
            }
            ;
        }
        schedule() {
            if (!this.context || !this.enabled || engine.phase !== 'running') {
                if (this.context)
                    this.nextNote = this.context.currentTime + .04;
                return;
            }
            const now = this.context.currentTime;
            if (this.nextNote < now - .1)
                this.nextNote = now + .03;
            const bpm = 112 + Math.min(44, engine.combo);
            while (this.nextNote < now + .15) {
                const t = this.nextNote
                  , n = this.step % 16
                  , notes = [55, 55, 65.406, 55, 82.407, 73.416, 65.406, 49];
                if (n % 4 === 0) {
                    this.tone(135, t, .2, 'sine', .6, 42);
                    this.tone(notes[Math.floor(n / 2) % 8], t, .19, 'sawtooth', .08);
                }
                if (n % 4 === 2) {
                    this.hiss(t, .105, .16, 1200);
                    this.tone(170, t, .07, 'triangle', .09, 85);
                }
                this.hiss(t, .035, n % 2 === 0 ? .07 : .035, 7200);
                if (engine.combo >= 5 && n % 2 === 0)
                    this.tone(notes[n / 2] * 4, t, .10, 'triangle', .055);
                if (engine.combo >= 15 && n % 4 === 3)
                    this.tone([440, 523.25, 659.25, 587.33][Math.floor(n / 4)], t, .13, 'sine', .06);
                this.nextNote += 60 / bpm / 4;
                this.step++;
            }
        }
        success(colour, precise) {
            if (!this.context)
                return;
            const t = this.context.currentTime;
            this.tone([523.25, 659.25, 783.99, 987.77][colour], t, .13, 'triangle', .18);
            if (precise)
                this.tone([1046.5, 1318.5, 1568, 1975.5][colour], t + .035, .17, 'sine', .09);
            this.hiss(t, .04, .04, 4800);
        }
        countdown(number) {
            if (this.context)
                this.tone(number ? 440 : 880, this.context.currentTime, .1, 'sine', .18);
        }
        fail() {
            if (!this.context)
                return;
            const t = this.context.currentTime;
            this.tone(190, t, .7, 'sawtooth', .16, 30);
            this.hiss(t, .55, .22, 900);
        }
        upgrade() {
            if (!this.context)
                return;
            const t = this.context.currentTime;
            [440, 554.37, 659.25, 880].forEach( (f, i) => this.tone(f, t + i * .07, .2, 'triangle', .15));
        }
    }
    const synth = new Synth();

    function selectMode(mode) {
        selectedMode = mode === 'boss' ? 'boss' : 'normal';
        const normal = $('modeNormal'), boss = $('modeBoss');
        if (normal) normal.classList.toggle('selected', selectedMode === 'normal');
        if (boss) boss.classList.toggle('selected', selectedMode === 'boss');
        const rules = document.querySelector('.rules');
        if (rules) rules.textContent = selectedMode === 'boss'
            ? 'BOSS MODE: Maximum velocity. ×4 multiplier from the first gate. Survive the anomaly.'
            : 'NORMAL MODE: Build your combo, increase velocity and break the limit.';
        const edition = document.querySelector('.edition');
        if (edition) edition.innerHTML = selectedMode === 'boss'
            ? '<span></span> TIME PARADOX / BOSS FIRST'
            : '<span></span> ENDLESS ARCADE / NORMAL RUN';
    }

    function forceWASDLabels() {
        const keys=['W','A','S','D'];
        document.querySelectorAll('.menu-controls kbd').forEach((el,i)=>{if(keys[i])el.textContent=keys[i];});
        document.querySelectorAll('.play-keys button kbd').forEach((el,i)=>{if(keys[i])el.textContent=keys[i];});
    }

    function resize() {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, lowFX ? 1 : 1.65);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bgGradient = ctx.createLinearGradient(0, 0, 0, height);
        bgGradient.addColorStop(0, '#080511');
        bgGradient.addColorStop(.47, '#100927');
        bgGradient.addColorStop(1, '#060512');
        glowGradient = ctx.createRadialGradient(width * .5, height * .43, 0, width * .5, height * .43, width * .52);
        glowGradient.addColorStop(0, '#56318935');
        glowGradient.addColorStop(.38, '#2a1a6019');
        glowGradient.addColorStop(1, '#09051300');
    }
    function setFX() {
        shell.classList.toggle('low-fx', lowFX);
        $('motion').setAttribute('aria-pressed', String(lowFX));
        resize();
        try {
            localStorage.setItem('neon-splice-low-fx', String(lowFX));
        } catch {}
    }
    function setSound(enabled) {
        soundEnabled = enabled;
        if (enabled && !synth.unlock()) {
            soundEnabled = false;
            $('announcement').textContent = 'Sound is unavailable in this browser. The game can still be played.';
        }
        synth.setEnabled(soundEnabled);
        if (soundtrack) soundtrack.volume = soundEnabled ? 0.82 : 0;
        $('sound').setAttribute('aria-pressed', String(soundEnabled));
        $('sound').setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Enable sound');
        document.querySelector('.mute-slash').hidden = soundEnabled;
        try {
            localStorage.setItem('neon-splice-sound', String(soundEnabled));
        } catch {}
    }
    function start() {
        if (!soundChosen) {
            soundEnabled = true;
            soundChosen = true;
        }
        setSound(soundEnabled);
        particles = [];
        gateEchoes = [];
        deadTime = -10;
        resultsShown = false;
        shake = 0;
        feedbackUntil = 0;
        milestoneUntil = 0;
        lastInput = -10;
        engine.start(selectedMode);
        handleEvents();
        syncUI();
    }
    function resume() {
        if (soundEnabled)
            synth.unlock();
        engine.resume();
        handleEvents();
        syncUI();
    }
    function pause() {
        engine.pause();
        handleEvents();
        syncUI();
    }
    function input(index) {
        if (engine.phase !== 'running' || clock - lastInput < .08)
            return;
        lastInput = clock;
        keyButtons[index].classList.add('pressed');
        setTimeout( () => keyButtons[index].classList.remove('pressed'), 115);
        engine.splice(index);
        handleEvents();
        syncUI();
    }

    function polygon(points, fill, stroke, lineWidth=1) {
        ctx.beginPath();
        points.forEach( ([x,y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    }
    const shape = [[-.67, -.78], [.67, -.78], [1, -.41], [1, .51], [.65, .87], [-.65, .87], [-1, .51], [-1, -.41]];
    function framePoints(scale, cx=width * .5, cy=height * .43) {
        return shape.map( ([x,y]) => [cx + x * width * .64 * scale, cy + y * height * .72 * scale]);
    }
    function line(x1, y1, x2, y2, colour, width_=1) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = colour;
        ctx.lineWidth = width_;
        ctx.stroke();
    }
    function neonOutline(points, colour, alpha=1, thickness=2) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'lighter';
        if (!lowFX) {
            ctx.globalAlpha = alpha * .12;
            polygon(points, null, colour, thickness + 8);
            ctx.globalAlpha = alpha * .3;
            polygon(points, null, colour, thickness + 3);
            ctx.globalAlpha = alpha;
        }
        polygon(points, null, colour, thickness);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * .5;
        polygon(points, null, '#f4ebff', Math.max(.5, thickness * .2));
        ctx.restore();
    }

    function drawTunnel() {
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = glowGradient;
        ctx.fillRect(0, 0, width, height);
        const cx = width * .5
          , cy = height * .43;
        // The floor, rails and frames share one vanishing point.
        polygon([[cx, cy], [-width * .2, height], [width * 1.2, height]], '#0a0819');
        const outer = framePoints(1.75)
          , inner = framePoints(.028);
        for (let i = 0; i < shape.length; i++) {
            line(inner[i][0], inner[i][1], outer[i][0], outer[i][1], i % 2 ? '#321837' : '#163240', 1);
        }
        for (let i = -6; i <= 6; i++) {
            const x = width * .5 + i * width * .23;
            line(cx + (x - cx) * .026, cy + 7, x, height, '#172135', 1);
        }
        const count = lowFX ? 13 : 20;
        for (let i = 0; i < count; i++) {
            const t = ((i / count + travel * .075) % 1);
            const s = .025 + Math.pow(t, 2.05) * 1.5;
            const points = framePoints(s);
            const a = .12 + Math.pow(t, 1.4) * .50;
            neonOutline(points, i % 4 === 0 ? '#ac3cbb' : i % 3 === 0 ? '#176e87' : '#43315f', a, s > .4 ? 1.5 : .9);
            const p = points;
            if (i % 3 === 0) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = a * .65;
                ctx.shadowColor = i % 2 ? '#ff3caa' : '#00e5ef';
                ctx.shadowBlur = lowFX ? 0 : 14;
                line(p[2][0], p[2][1], p[3][0], p[3][1], i % 2 ? '#ff3caa' : '#00d9ea', 2 + s * 2);
                line(p[6][0], p[6][1], p[7][0], p[7][1], i % 2 ? '#ff3caa' : '#00d9ea', 2 + s * 2);
                ctx.restore();
            }
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowBlur = lowFX ? 0 : 16;
        for (const side of [-1, 1]) {
            ctx.shadowColor = '#00e5ef';
            line(cx + side * 8, cy + 12, cx + side * width * .54, height, '#00afc280', 2);
            ctx.shadowColor = '#ff3caa';
            line(cx + side * 13, cy + 5, cx + side * width * .9, height * .78, '#d93b9850', 2);
            line(cx + side * 20, cy - 10, cx + side * width * .88, 0, '#5f226656', 1);
        }
        ctx.restore();
        if (!lowFX) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const intensity = engine.phase === 'running' ? .35 + Math.min(.6, engine.combo * .012) : .2;
            for (const star of stars) {
                const t = (star.t + travel * .21) % 1;
                const r = Math.pow(t, 2.2);
                const r0 = Math.pow(Math.max(0, t - star.length * (.6 + engine.speed * .4)), 2.2);
                const dx = Math.cos(star.a) * width * .86
                  , dy = Math.sin(star.a) * height;
                ctx.globalAlpha = t * t * intensity;
                line(cx + dx * r0, cy + dy * r0, cx + dx * r, cy + dy * r, star.cyan ? '#24d9e8' : '#db399f', t > .75 ? 1.5 : .7);
            }
            ctx.restore();
        }
        // Reflected light remains subtle so upcoming gates stay legible.
        ctx.save();
        const floor = ctx.createLinearGradient(cx, cy, cx, height);
        floor.addColorStop(0, '#02d6df00');
        floor.addColorStop(1, '#02d6df06');
        polygon([[cx - 5, cy], [cx + 5, cy], [cx + width * .14, height], [cx - width * .14, height]], floor);
        ctx.restore();
    }

    function drawGate(progress, colour, alpha=1, broken=false) {
        const c = COLOURS[colour];
        const s = .12 + Math.pow(Math.min(1.1, progress), 1.75) * 1.14;
        const points = framePoints(s);
        ctx.save();
        ctx.globalAlpha = alpha;
        if (!broken) {
            polygon(points, c.hex + '08');
            const hw = width * .64 * s
              , hh = height * .72 * s
              , cx = width * .5
              , cy = height * .43;
            ctx.save();
            ctx.beginPath();
            points.forEach( ([x,y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
            ctx.closePath();
            ctx.clip();
            for (let i = -3; i <= 3; i++) {
                const y = cy + i * hh * .205;
                ctx.fillStyle = c.hex + (i === 0 ? '26' : '15');
                ctx.fillRect(cx - hw, y - 3 * s, hw * 2, 6 * s + 1);
                line(cx - hw, y, cx + hw, y, c.hex + '55', 1);
            }
            ctx.restore();
        }
        neonOutline(points, c.hex, alpha, 2 + Math.min(6, s * 5));
        // Industrial corner segments emphasize depth without hiding the key.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = c.hex;
        ctx.lineWidth = 3 + s * 7;
        ctx.shadowColor = c.hex;
        ctx.shadowBlur = lowFX ? 0 : 17;
        for (const i of [0, 2, 4, 6]) {
            const a = points[i]
              , b = points[(i + 1) % 8];
            line(a[0], a[1], a[0] + (b[0] - a[0]) * .38, a[1] + (b[1] - a[1]) * .38, c.hex, ctx.lineWidth);
        }
        ctx.restore();
        if (!broken) {
            const size = Math.max(32, Math.min(76, width * .08 + progress * 22));
            const x = width * .5
              , y = height * .43;
            polygon([[x - size * .5 + 8, y - size * .5], [x + size * .5 - 8, y - size * .5], [x + size * .5, y - size * .5 + 8], [x + size * .5, y + size * .5 - 8], [x + size * .5 - 8, y + size * .5], [x - size * .5 + 8, y + size * .5], [x - size * .5, y + size * .5 - 8], [x - size * .5, y - size * .5 + 8]], '#0c071bea', c.hex, 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.font = `700 ${size * .53}px ui-monospace,Consolas,monospace`;
            ctx.shadowColor = c.hex;
            ctx.shadowBlur = lowFX ? 0 : 14;
            ctx.fillText(c.key, x, y + 1);
            ctx.shadowBlur = 0;
            ctx.fillStyle = c.hex;
            ctx.font = `500 ${Math.max(10, size * .15)}px ui-monospace,Consolas,monospace`;
            ctx.fillText(c.name, x, y - size * .5 - 15);
        }
        ctx.restore();
    }

    
    function drawFinalBossAtmosphere() {
        const now = performance.now() * .001;
        ctx.save();

        // distant cyber skyline
        const horizon = height * .39;
        ctx.globalAlpha=.58;
        for(let side=0; side<2; side++){
            for(let i=0;i<13;i++){
                const bw = width*(.018 + (i%4)*.006);
                const bh = height*(.07 + ((i*37)%9)*.018);
                const gap = width*.026;
                const bx = side===0 ? i*gap : width-i*gap-bw;
                ctx.fillStyle='rgba(4,8,24,.92)';
                ctx.fillRect(bx,horizon-bh,bw,bh);
                ctx.fillStyle = i%2 ? 'rgba(53,246,255,.34)' : 'rgba(255,59,212,.30)';
                for(let wy=horizon-bh+8;wy<horizon-5;wy+=13)
                    ctx.fillRect(bx+(i%3+1)*4,wy,2,4);
            }
        }

        // horizon glow
        let hg=ctx.createLinearGradient(0,horizon-35,0,horizon+90);
        hg.addColorStop(0,'rgba(177,48,255,0)');
        hg.addColorStop(.5,'rgba(64,77,255,.10)');
        hg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=hg;ctx.fillRect(0,horizon-35,width,130);

        // fast perspective road streaks
        ctx.globalCompositeOperation='lighter';
        ctx.lineWidth=1.2;
        for(let i=0;i<18;i++){
            const z=((now*.34+i/18)%1);
            const yy=horizon+(height-horizon)*z*z;
            const spread=(width*.48)*z;
            ctx.globalAlpha=.08+.26*z;
            ctx.strokeStyle=i%2?'#35f6ff':'#ff3bd4';
            ctx.beginPath();
            ctx.moveTo(width/2 + (i%2?-1:1)*spread*.18, yy);
            ctx.lineTo(width/2 + (i%2?-1:1)*spread, yy+height*.055*z);
            ctx.stroke();
        }

        // drifting data particles
        for(let i=0;i<34;i++){
            const q=(now*(.12+(i%5)*.012)+i*.137)%1;
            const yy=horizon+q*(height-horizon);
            const xx=width*.5 + Math.sin(i*91.7)*width*.46*q;
            ctx.globalAlpha=.12+.5*q;
            ctx.fillStyle=i%3?'#35f6ff':'#ff3bd4';
            ctx.fillRect(xx,yy,1+q*2,2+q*7);
        }
        ctx.restore();
    }
function drawRunner() {
        const x = width * 0.5, y = height * 0.79;
        const t = performance.now() * 0.004;
        ctx.save();
        ctx.translate(x, y);

        // Long twin ion trails
        ctx.globalCompositeOperation = 'lighter';
        const trail = ctx.createLinearGradient(0, 8, 0, 155);
        trail.addColorStop(0,'rgba(255,255,255,.95)');
        trail.addColorStop(.12,'rgba(53,246,255,.95)');
        trail.addColorStop(.55,'rgba(174,55,255,.48)');
        trail.addColorStop(1,'rgba(255,40,196,0)');
        ctx.fillStyle = trail;
        for (const dx of [-22,22]) {
            ctx.beginPath(); ctx.moveTo(dx-5,18); ctx.lineTo(dx+5,18);
            ctx.lineTo(dx+2+Math.sin(t+dx)*3,145); ctx.lineTo(dx-2,145); ctx.closePath(); ctx.fill();
        }

        // Outer aura
        ctx.shadowBlur=28; ctx.shadowColor='#35f6ff';
        ctx.strokeStyle='rgba(53,246,255,.85)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(0,-54); ctx.lineTo(73,17); ctx.lineTo(31,11);
        ctx.lineTo(18,36); ctx.lineTo(0,26); ctx.lineTo(-18,36);
        ctx.lineTo(-31,11); ctx.lineTo(-73,17); ctx.closePath(); ctx.stroke();

        // Main interceptor body
        const body=ctx.createLinearGradient(-60,-30,60,32);
        body.addColorStop(0,'#10233d'); body.addColorStop(.42,'#d8fbff');
        body.addColorStop(.52,'#3c5681'); body.addColorStop(1,'#230d45');
        ctx.fillStyle=body; ctx.shadowBlur=14; ctx.shadowColor='#ff3bd4';
        ctx.beginPath(); ctx.moveTo(0,-58); ctx.lineTo(18,-12); ctx.lineTo(76,18);
        ctx.lineTo(30,13); ctx.lineTo(21,39); ctx.lineTo(0,27);
        ctx.lineTo(-21,39); ctx.lineTo(-30,13); ctx.lineTo(-76,18);
        ctx.lineTo(-18,-12); ctx.closePath(); ctx.fill();

        // Wing neon trims
        ctx.lineWidth=3; ctx.shadowBlur=13; ctx.shadowColor='#ff3bd4'; ctx.strokeStyle='#ff4edb';
        ctx.beginPath(); ctx.moveTo(-72,17);ctx.lineTo(-20,1);ctx.lineTo(0,-50);ctx.stroke();
        ctx.shadowColor='#35f6ff';ctx.strokeStyle='#35f6ff';
        ctx.beginPath();ctx.moveTo(72,17);ctx.lineTo(20,1);ctx.lineTo(0,-50);ctx.stroke();

        // Cockpit
        const glass=ctx.createRadialGradient(0,-20,2,0,-15,24);
        glass.addColorStop(0,'#f5ffff');glass.addColorStop(.22,'#4ef7ff');glass.addColorStop(1,'#171c62');
        ctx.fillStyle=glass;ctx.shadowBlur=22;ctx.shadowColor='#35f6ff';
        ctx.beginPath();ctx.moveTo(0,-45);ctx.lineTo(13,-6);ctx.lineTo(0,8);ctx.lineTo(-13,-6);ctx.closePath();ctx.fill();

        // Engine cores
        for(const dx of [-22,22]){
            ctx.fillStyle='#fff';ctx.shadowBlur=22;ctx.shadowColor=dx<0?'#ff3bd4':'#35f6ff';
            ctx.beginPath();ctx.arc(dx,23,5+Math.sin(t*2)*1.2,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
    }
    function burst(colour, progress, death=false) {
        const c = COLOURS[colour].hex;
        const count = lowFX ? (death ? 22 : 12) : (death ? 120 : 48);
        const s = .12 + Math.pow(progress, 1.75) * 1.14;
        const points = framePoints(s);
        for (let i = 0; i < count; i++) {
            const a = points[i % 8]
              , b = points[(i + 1) % 8]
              , f = Math.random();
            const x = a[0] + (b[0] - a[0]) * f
              , y = a[1] + (b[1] - a[1]) * f;
            const angle = Math.atan2(y - height * .43, x - width * .5) + (Math.random() - .5) * .7;
            const speed = death ? 200 + Math.random() * 600 : 60 + Math.random() * 290;
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: death ? 5 + Math.random() * 24 : 2 + Math.random() * 10,
                rotation: Math.random() * 6,
                spin: (Math.random() - .5) * 7,
                life: 1,
                maxLife: death ? 1.2 + Math.random() : .5 + Math.random() * .55,
                colour: c,
                death
            });
        }
        if (particles.length > 220)
            particles.splice(0, particles.length - 220);
    }
    function drawParticles(dt) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt / p.maxLife;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += (p.death ? 140 : 30) * dt;
            p.rotation += p.spin * dt;
            ctx.save();
            ctx.globalAlpha = Math.min(1, p.life) * .8;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.colour + (p.death ? '45' : '90');
            ctx.strokeStyle = p.colour;
            ctx.lineWidth = .7;
            ctx.beginPath();
            ctx.moveTo(-p.size, -p.size * .4);
            ctx.lineTo(p.size * .7, -p.size * .7);
            ctx.lineTo(p.size * .3, p.size);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }
    function drawFracture() {
        const age = clock - deadTime;
        if (age < 0 || age > 1.1 || lowFX)
            return;
        const alpha = (1 - age / 1.1) * .45;
        ctx.save();
        ctx.globalAlpha = alpha;
        const cx = width * .5
          , cy = height * .43;
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI * 2 / 12 + .17;
            const r = Math.max(width, height);
            const bend = .75 + Math.sin(i * 6) * .25;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * r * .15, cy + Math.sin(a) * r * .15);
            ctx.lineTo(cx + Math.cos(a + .08) * r * .33 * bend, cy + Math.sin(a + .08) * r * .33 * bend);
            ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            ctx.strokeStyle = i % 2 ? '#f0c4ef' : '#8ee9f1';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.restore();
    }

    function handleEvents() {
        for (const event of engine.drain()) {
            switch (event.type) {
            case 'start':
                $('menu').hidden = true;
                $('results').hidden = true;
                $('paused').hidden = true;
                $('announcement').textContent = 'Get ready. D cyan, F pink, J gold, K violet.';
                break;
            case 'countdown':
                $('countdown').hidden = false;
                $('countdown').innerHTML = event.number + '<small>GET READY</small>';
                synth.countdown(event.number);
                break;
            case 'running':
                $('countdown').hidden = true;
                if (soundtrack) { soundtrack.currentTime = 0; soundtrack.play().catch(() => {}); }
                $('paused').hidden = true;
                synth.countdown(0);
                break;
            case 'gate':
                frameAccent = COLOURS[event.colour].hex;
                break;
            case 'splice':
                {
                    const c = COLOURS[event.colour];
                    frameAccent = c.hex;
                    burst(event.colour, event.progress);
                    gateEchoes.push({
                        colour: event.colour,
                        progress: event.progress,
                        life: 1
                    });
                    $('feedback').querySelector('strong').textContent = event.precise ? 'PERFECT SPLICE' : 'SPLICED';
                    $('feedback').querySelector('span').textContent = '+' + event.points + '  /  ' + event.combo + ' STREAK';
                    feedbackUntil = clock + .68;
                    synth.success(event.colour, event.precise);
                    break;
                }
            case 'upgrade':
                $('milestone').querySelector('strong').textContent = event.multiplier === 2 ? 'OVERDRIVE' : event.multiplier === 4 ? 'HYPERDRIVE' : 'LIMIT BREAK';
                $('milestone').querySelector('span').textContent = '×' + event.multiplier + ' MULTIPLIER UNLOCKED';
                milestoneUntil = clock + 1.1;
                synth.upgrade();
                $('announcement').textContent = 'Multiplier times ' + event.multiplier;
                break;
            case 'fail':
                if (soundtrack) soundtrack.pause();
                deadTime = clock;
                shake = lowFX ? 0 : 18;
                resultsShown = false;
                feedbackUntil = 0;
                milestoneUntil = 0;
                burst(event.expected, Math.min(1, engine.gate?.progress ?? 1), true);
                synth.fail();
                $('countdown').hidden = true;
                break;
            case 'pause':
                if (soundtrack) soundtrack.pause();
                $('paused').hidden = false;
                $('countdown').hidden = true;
                $('announcement').textContent = 'Game paused.';
                break;
            case 'resume':
                $('paused').hidden = true;
                break;
            case 'menu':
                if (soundtrack) { soundtrack.pause(); soundtrack.currentTime = 0; }
                $('menu').hidden = false;
                $('results').hidden = true;
                $('paused').hidden = true;
                $('countdown').hidden = true;
                particles = [];
                gateEchoes = [];
                break;
            }
        }
    }

    let previousPhase = ''
      , lastScore = -1
      , lastCombo = -1;
    function syncUI() {
        shell.dataset.phase = engine.phase;
        shell.style.setProperty('--accent', frameAccent);
        if (lastScore !== engine.score) {
            $('score').textContent = String(engine.score).padStart(6, '0');
            lastScore = engine.score;
        }
        if (lastCombo !== engine.combo) {
            $('combo').textContent = engine.combo + ' STREAK';
            $('multiplier').textContent = '×' + engine.multiplier;
            const threshold = engine.combo < 5 ? 5 : engine.combo < 15 ? 15 : engine.combo < 30 ? 30 : 0;
            const previous = engine.combo < 5 ? 0 : engine.combo < 15 ? 5 : 15;
            $('comboFill').style.width = (threshold ? (engine.combo - previous) / (threshold - previous) * 100 : 100) + '%';
            $('nextCombo').textContent = threshold ? (threshold - engine.combo) + ' TO ×' + (engine.multiplier * 2) : 'MAX MULTIPLIER';
            lastCombo = engine.combo;
        }
        $('velocity').innerHTML = engine.speed.toFixed(2) + '<span>×</span>';
        const activeBars = Math.round(4 + (engine.speed - 1) / 2.1 * 14);
        Array.from($('velocityBars').children).forEach( (el, i) => el.classList.toggle('on', i < activeBars));
        $('elapsed').textContent = String(Math.floor(engine.elapsed / 60)).padStart(2, '0') + ':' + String(Math.floor(engine.elapsed) % 60).padStart(2, '0');
        if (engine.gate) {
            const c = COLOURS[engine.gate.colour];
            $('targetKey').textContent = c.key;
            $('targetColour').textContent = c.name;
            $('targetLabel').textContent = engine.gate.progress > .66 ? 'SPLICE NOW · BONUS' : 'MATCH BEFORE IMPACT';
            $('approachFill').style.width = Math.min(100, engine.gate.progress * 100) + '%';
        } else {
            $('targetLabel').textContent = 'GATE CLEARED';
            $('approachFill').style.width = '0%';
        }
        $('targetCue').style.opacity = engine.gate ? '1' : '.4';
        keyButtons.forEach( (b, i) => b.classList.toggle('active', engine.phase === 'running' && engine.gate?.colour === i));
        if (previousPhase !== engine.phase) {
            $('status').textContent = ({
                menu: 'SYSTEM READY',
                countdown: 'CONNECTING',
                running: 'SIGNAL LIVE',
                paused: 'SIGNAL PAUSED',
                dead: 'SIGNAL LOST'
            })[engine.phase];
            previousPhase = engine.phase;
        }
        $('feedback').classList.toggle('show', clock < feedbackUntil && engine.phase === 'running');
        $('milestone').classList.toggle('show', clock < milestoneUntil && engine.phase === 'running');
        if (engine.phase === 'dead' && !resultsShown && clock - deadTime > (lowFX ? .3 : 1.05)) {
            resultsShown = true;
            $('results').hidden = false;
            $('finalScore').textContent = String(engine.score).padStart(6, '0');
            $('finalCombo').textContent = engine.combo;
            $('finalPerfect').textContent = engine.perfect;
            $('finalTime').textContent = Math.floor(engine.elapsed) + 's';
            const f = engine.failure;
            const expected = COLOURS[f.expected];
            $('failureReason').textContent = f.reason === 'wrong' ? 'Wrong frequency. ' + expected.name + ' needed ' + expected.key + '.' : 'Impact. ' + expected.name + ' needed ' + expected.key + ' before the gate reached you.';
            $('announcement').textContent = 'Run complete. Score ' + engine.score + '. Best streak ' + engine.combo + '. Press Enter to retry.';
            $('retry').focus({
                preventScroll: true
            });
        }
    }

    function render(timestamp) {
        const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, .05) : 1 / 60;
        lastTime = timestamp;
        clock += dt;
        engine.tick(dt);
        handleEvents();
        const phase = engine.phase;
        const flow = phase === 'running' ? engine.speed : phase === 'dead' ? .06 : phase === 'paused' ? 0 : .24;
        travel += dt * flow * (lowFX ? .45 : 1);
        ctx.save();
        if (shake > .15 && !lowFX) {
            ctx.translate(Math.sin(clock * 85) * shake, Math.cos(clock * 103) * shake * .55);
            shake *= Math.pow(.002, dt);
        }
        drawTunnel();
        if (phase === 'menu') {
            drawGate(.18 + Math.sin(clock * .25) * .05, 1, .25);
        }
        if (engine.gate && phase !== 'dead')
            drawGate(engine.gate.progress, engine.gate.colour, phase === 'paused' ? .35 : 1);
        for (let i = gateEchoes.length - 1; i >= 0; i--) {
            const echo = gateEchoes[i];
            echo.life -= dt * 3;
            echo.progress += dt * 2.2;
            if (echo.life <= 0) {
                gateEchoes.splice(i, 1);
                continue;
            }
            drawGate(echo.progress, echo.colour, echo.life * .5, true);
        }
        if (phase !== 'menu')
            drawFinalBossAtmosphere();
        drawRunner();
        drawParticles(phase === 'paused' ? 0 : dt);
        drawFracture();
        ctx.restore();
        syncUI();
        requestAnimationFrame(render);
    }

    $('start').addEventListener('click', start);
    $('modeNormal').addEventListener('click', () => selectMode('normal'));
    $('modeBoss').addEventListener('click', () => selectMode('boss'));
    $('retry').addEventListener('click', start);
    $('pauseRestart').addEventListener('click', start);
    $('resume').addEventListener('click', resume);
    $('pause').addEventListener('click', () => engine.phase === 'paused' ? resume() : pause());
    $('backMenu').addEventListener('click', () => {
        engine.menu();
        handleEvents();
        syncUI();
        $('start').focus({
            preventScroll: true
        });
    }
    );
    $('sound').addEventListener('click', () => {
        soundChosen = true;
        setSound(!soundEnabled);
    }
    );
    $('motion').addEventListener('click', () => {
        lowFX = !lowFX;
        setFX();
    }
    );
    $('fullscreen').addEventListener('click', async () => {
        try {
            if (!document.fullscreenElement)
                await shell.requestFullscreen();
            else
                await document.exitFullscreen();
        } catch {
            $('announcement').textContent = 'Fullscreen is unavailable. You can keep playing in this window.';
        }
    }
    );
    document.addEventListener('fullscreenchange', () => {
        $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
        forceWASDLabels();
    resize();
    }
    );
    keyButtons.forEach( (button, i) => button.addEventListener('pointerdown', event => {
        event.preventDefault();
        input(i);
    }
    ));
    document.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.repeat)
            return;
        const key = event.key.toUpperCase();
        const index = COLOURS.findIndex(c => c.key === key);
        if (index !== -1) {
            event.preventDefault();
            input(index);
            return;
        }
        if (key === 'ENTER') {
            event.preventDefault();
            if (engine.phase === 'menu' || engine.phase === 'dead')
                start();
            else if (engine.phase === 'paused')
                resume();
        }
        if (key === 'ESCAPE' || event.code === 'Space') {
            event.preventDefault();
            if (engine.phase === 'paused')
                resume();
            else if (engine.phase === 'running' || engine.phase === 'countdown')
                pause();
            else if (engine.phase === 'menu' && event.code === 'Space')
                start();
        }
        if (key === 'M') {
            soundChosen = true;
            setSound(!soundEnabled);
        }
    }
    );
    document.addEventListener('visibilitychange', () => {
        if (document.hidden)
            pause();
        lastTime = 0;
    }
    );
    window.addEventListener('blur', pause);
    window.addEventListener('resize', resize);
    for (let i = 0; i < 18; i++)
        $('velocityBars').appendChild(document.createElement('i'));
    setFX();
    $('sound').setAttribute('aria-pressed', String(soundEnabled));
    document.querySelector('.mute-slash').hidden = soundEnabled;
    syncUI();
    requestAnimationFrame(render);

    // Agents can inspect the same run state exposed in the HUD. No automatic play.
    const modelContext = document.modelContext;
    if (modelContext?.registerTool) {
        const lifecycle = new AbortController();
        try {
            Promise.resolve(modelContext.registerTool({
                name: 'read_neon_splice_run',
                title: 'Read Neon Splice run',
                description: 'Read the current game phase, score, combo, speed, and approaching gate. Does not play or change the run.',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    additionalProperties: false
                },
                annotations: {
                    readOnlyHint: true,
                    untrustedContentHint: false
                },
                execute(input) {
                    if (input === null || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)
                        throw new Error('Expected an empty object.');
                    return engine.snapshot();
                }
            }, {
                signal: lifecycle.signal
            })).catch( () => {}
            );
        } catch {}
        window.addEventListener('pagehide', () => lifecycle.abort(), {
            once: true
        });
    }
}
)();
