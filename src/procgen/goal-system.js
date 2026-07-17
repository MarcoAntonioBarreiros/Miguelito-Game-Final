import { W } from '../core/constants.js';

const TAU = Math.PI * 2;

export function createGoalSystem({ state, entities }) {
  let completedAt = -1;

  function reset() {
    completedAt = -1;
    if (state.level.goal) state.level.goal.completed = false;
  }

  function clear() {
    completedAt = -1;
  }

  function complete(goal) {
    if (goal.completed) return;
    goal.completed = true;
    completedAt = state.time;
    state.player.vx = 0;
    state.player.vy = 0;
    state.gameState = 'end';
    state.mission = 'Raiz principal alcançada — o solo vivo foi reconectado';
    state.toast = 'Fase concluída: a rede microbiana alcançou a raiz principal';
    state.toastTime = 7;
    state.shake = .5;
    for (let i = 0; i < 5; i++) {
      entities.burst(goal.x, goal.y + 45, i % 2 ? '#d6afff' : '#8ff2c1', 28, 140 + i * 36);
    }
  }

  function update() {
    const goal = state.level.goal;
    if (!goal || goal.completed || state.gameState !== 'play') return;
    const px = state.player.x + state.player.w / 2;
    const py = state.player.y + state.player.h / 2;
    if (Math.hypot(px - goal.x, py - (goal.y + 48)) < goal.radius) complete(goal);
  }

  function render(ctx) {
    const goal = state.level.goal;
    if (!goal) return;
    const time = state.time;
    ctx.save();
    ctx.translate(-state.cameraX, 0);

    const pulse = 1 + Math.sin(time * 2.1) * .05;
    ctx.save();
    ctx.translate(goal.x, goal.y);
    ctx.scale(pulse, pulse);

    ctx.shadowBlur = goal.completed ? 42 : 24;
    ctx.shadowColor = goal.completed ? '#a7ffd2' : '#d6b37f';
    ctx.strokeStyle = goal.completed ? '#b9ffd8' : '#d6b37f';
    ctx.lineCap = 'round';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(0, -205);
    ctx.bezierCurveTo(-18, -138, 26, -76, 0, 20);
    ctx.bezierCurveTo(-10, 64, 12, 95, 0, 130);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = goal.completed ? 'rgba(235,255,244,.88)' : 'rgba(255,235,198,.66)';
    ctx.lineWidth = 3;
    ctx.stroke();

    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? -1 : 1;
      const y = -112 + i * 28;
      const length = 42 + (i % 3) * 18;
      ctx.strokeStyle = goal.completed ? 'rgba(142,255,193,.76)' : 'rgba(215,181,125,.7)';
      ctx.lineWidth = 5 - i * .18;
      ctx.beginPath();
      ctx.moveTo(side * 2, y);
      ctx.bezierCurveTo(side * 20, y + 8, side * 28, y + 24, side * length, y + 34);
      ctx.stroke();
    }

    const halo = ctx.createRadialGradient(0, 44, 8, 0, 44, goal.completed ? 120 : 86);
    halo.addColorStop(0, goal.completed ? 'rgba(140,255,190,.65)' : 'rgba(214,179,127,.42)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 44, goal.completed ? 120 : 86, 0, TAU);
    ctx.fill();

    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU + time * (goal.completed ? .42 : .18);
      const r = 42 + (i % 4) * 11 + Math.sin(time * 1.7 + i) * 4;
      ctx.fillStyle = i % 2 ? '#d6afff' : '#8ff2c1';
      ctx.globalAlpha = goal.completed ? .82 : .42;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, 44 + Math.sin(a) * r * .55, 2.2 + (i % 3), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (goal.x > state.cameraX - 160 && goal.x < state.cameraX + W + 160) {
      ctx.textAlign = 'center';
      ctx.font = '800 14px Inter,system-ui';
      ctx.shadowBlur = 12;
      ctx.shadowColor = goal.completed ? '#8ff2c1' : '#d6b37f';
      ctx.fillStyle = goal.completed ? '#eafff1' : '#fff1d4';
      ctx.fillText(goal.completed ? 'SOLO VIVO RESTAURADO' : 'RAIZ PRINCIPAL', goal.x, goal.y - 226);
      ctx.font = '600 11px Inter,system-ui';
      ctx.fillStyle = 'rgba(235,255,244,.82)';
      ctx.fillText(goal.completed ? 'Fase concluída' : 'Alcance o córtex luminoso', goal.x, goal.y - 207);
      ctx.shadowBlur = 0;
    }

    if (completedAt >= 0) {
      const age = state.time - completedAt;
      if (age < 4.5) {
        ctx.globalAlpha = Math.max(0, 1 - age / 4.5);
        ctx.strokeStyle = '#b9ffd8';
        ctx.lineWidth = 8 * ctx.globalAlpha;
        ctx.beginPath();
        ctx.arc(goal.x, goal.y + 44, 70 + age * 120, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  return { reset, clear, update, render };
}
