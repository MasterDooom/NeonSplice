(function(root, factory) {
    if (typeof module === 'object' && module.exports)
        module.exports = factory();
    else
        root.NeonEngine = factory();
}
)(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';
    const COLOURS = [{
        key: 'W',
        name: 'CYAN',
        hex: '#00e5ef'
    }, {
        key: 'A',
        name: 'PINK',
        hex: '#ff3caa'
    }, {
        key: 'S',
        name: 'GOLD',
        hex: '#ffc65b'
    }, {
        key: 'D',
        name: 'VIOLET',
        hex: '#a477ff'
    }];
    class Game {
        constructor(random=Math.random) {
            this.random = random;
            this.phase = 'menu';
            this.mode = 'normal';
            this.events = [];
            this.reset();
            this.phase = 'menu';
        }
        reset() {
            this.score = 0;
            this.combo = 0;
            this.multiplier = 1;
            this.perfect = 0;
            this.elapsed = 0;
            this.gate = null;
            this.nextGateIn = 0;
            this.lastColour = -1;
            this.failure = null;
            this.countdownLeft = 3;
            this.gateId = 0;
            this.speed = this.mode === 'boss' ? 2.65 : 1;
            this.events = [];
            this.countdownNumber = 3;
        }
        emit(type, detail={}) {
            this.events.push({
                type,
                ...detail
            });
        }
        drain() {
            return this.events.splice(0);
        }
        start(mode=this.mode) {
            this.mode = mode === 'boss' ? 'boss' : 'normal';
            this.reset();
            this.phase = 'countdown';
            this.emit('start');
            this.emit('countdown', {
                number: 3
            });
        }
        spawn() {
            let colour = Math.floor(this.random() * 4) % 4;
            if (colour === this.lastColour && this.random() > .4)
                colour = (colour + 1 + Math.floor(this.random() * 3)) % 4;
            this.lastColour = colour;
            this.gate = {
                id: ++this.gateId,
                colour,
                progress: 0,
                duration: Math.max(.82, 2.65 / this.speed)
            };
            this.emit('gate', {
                colour
            });
        }
        tick(dt) {
            if (!Number.isFinite(dt) || dt <= 0)
                return;
            dt = Math.min(dt, .1);
            if (this.phase === 'countdown') {
                this.countdownLeft -= dt;
                const n = Math.ceil(this.countdownLeft);
                if (n > 0 && n !== this.countdownNumber) {
                    this.countdownNumber = n;
                    this.emit('countdown', {
                        number: n
                    });
                }
                if (this.countdownLeft <= 0) {
                    this.phase = 'running';
                    if (!this.gate)
                        this.spawn();
                    this.emit('running');
                }
                return;
            }
            if (this.phase !== 'running')
                return;
            this.elapsed += dt;
            if (this.gate) {
                this.gate.progress += dt / this.gate.duration;
                if (this.gate.progress >= 1)
                    this.fail('missed');
            } else {
                this.nextGateIn -= dt;
                if (this.nextGateIn <= 0)
                    this.spawn();
            }
        }
        splice(colour) {
            if (this.phase !== 'running' || !this.gate || !Number.isInteger(colour) || colour < 0 || colour > 3)
                return false;
            const gate = this.gate;
            if (colour !== gate.colour) {
                this.fail('wrong', colour);
                return false;
            }
            const oldMultiplier = this.multiplier;
            const precise = gate.progress >= .66;
            this.combo++;
            this.multiplier = this.mode === 'boss' ? (this.combo >= 12 ? 8 : 4) : (this.combo >= 30 ? 8 : this.combo >= 15 ? 4 : this.combo >= 5 ? 2 : 1);
            const points = (precise ? 150 : 100) * this.multiplier;
            this.score += points;
            if (precise)
                this.perfect++;
            this.speed = this.mode === 'boss' ? 2.65 + Math.min(1.15, this.combo * .035) : 1 + Math.min(2.1, this.combo * .047);
            this.gate = null;
            this.nextGateIn = Math.max(.13, .38 / this.speed);
            this.emit('splice', {
                colour,
                points,
                precise,
                progress: gate.progress,
                combo: this.combo,
                multiplier: this.multiplier
            });
            if (this.multiplier !== oldMultiplier)
                this.emit('upgrade', {
                    multiplier: this.multiplier
                });
            return true;
        }
        fail(reason, pressed=null) {
            if (this.phase !== 'running')
                return;
            this.failure = {
                reason,
                expected: this.gate?.colour ?? 0,
                pressed
            };
            this.phase = 'dead';
            this.emit('fail', {
                ...this.failure,
                score: this.score,
                combo: this.combo
            });
        }
        pause() {
            if (this.phase !== 'running' && this.phase !== 'countdown')
                return;
            this.pausedFrom = this.phase;
            this.phase = 'paused';
            this.emit('pause');
        }
        resume() {
            if (this.phase !== 'paused')
                return;
            this.phase = 'countdown';
            this.countdownLeft = 3;
            this.countdownNumber = 3;
            this.emit('resume');
            this.emit('countdown', {
                number: 3
            });
        }
        menu() {
            this.phase = 'menu';
            this.gate = null;
            this.emit('menu');
        }
        snapshot() {
            return {
                phase: this.phase,
                score: this.score,
                combo: this.combo,
                multiplier: this.multiplier,
                perfectSplices: this.perfect,
                elapsedSeconds: Math.floor(this.elapsed),
                speed: Number(this.speed.toFixed(2)),
                gate: this.gate ? {
                    key: COLOURS[this.gate.colour].key,
                    colour: COLOURS[this.gate.colour].name,
                    progress: Number(this.gate.progress.toFixed(3))
                } : null
            };
        }
    }
    return {
        Game,
        COLOURS
    };
});
