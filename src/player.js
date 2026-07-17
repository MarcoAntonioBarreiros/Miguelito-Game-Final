const initialPlayer = {
  x: 90,
  y: 500,
  w: 32,
  h: 48,
  vx: 0,
  vy: 0,
  onGround: false,
  facing: 1,
  coyote: 0,
  jumpBuffer: 0,
  canDoubleJump: false,
  airJumpAvailable: false,
  canDash: false,
  canPulse: false,
  dashTime: 0,
  dashCooldown: 0,
  invuln: 0,
  alive: true,
  exudates: 0,
  soil: 28,
  hope: 31,
  maxVitality: 5,
  vitality: 5,
  infection: 0,
  infectionExposure: 0,
  fungalDamageCooldown: 0,
  nematodeDamageCooldown: 0,
  healCooldown: 0,
  nematodeLoad: 0,
  moveMultiplier: 1,
  jumpMultiplier: 1,
  dashCooldownMultiplier: 1,
  dashSuppressed: false,
  deathFlash: 0,
  deaths: 0,
};

export function createPlayer() {
  return { ...initialPlayer };
}

export function resetPlayer(player, unlocks = null) {
  const deaths = player.deaths || 0;
  Object.assign(player, initialPlayer);
  player.deaths = deaths;
  if (!unlocks) return;
  player.canDoubleJump = Boolean(unlocks.doubleJump);
  player.canDash = Boolean(unlocks.dash);
  player.canPulse = Boolean(unlocks.pulse);
  player.airJumpAvailable = player.canDoubleJump;
}
