import { createSimulator } from './simulator.js';

const FPS = 60;
const DT = 1 / FPS;

export function validateChunk(fromPlatform, toPlatform, primitive, agentType = 'normal') {
  const sim = createSimulator();
  
  // Setup level with hazards below so respawn doesn't interfere
  sim.state.level.platforms = [fromPlatform, toPlatform];
  sim.state.level.hazards = []; // No hazards during validation
  sim.state.player.x = fromPlatform.x + fromPlatform.w - 40;
  sim.state.player.y = fromPlatform.y - 48;
  sim.state.player.canDoubleJump = primitive.requires.includes('doubleJump');
  sim.state.player.airJumpAvailable = primitive.requires.includes('doubleJump');
  sim.state.player.canDash = primitive.requires.includes('dash');
  sim.state.player.canPulse = primitive.requires.includes('pulse');

  // Agent timing offsets
  let jumpTiming = 0;
  if (agentType === 'conservative') {
    jumpTiming = -3; // Jump slightly early
  } else if (agentType === 'error-early') {
    jumpTiming = -8;
  } else if (agentType === 'error-late') {
    jumpTiming = 4;
  }

  const isDash = primitive.id.includes('dash');
  const isDouble = primitive.id.includes('double');

  let frames = 0;
  let phase = 'approach'; // approach -> jump -> airborne -> (double) -> landing
  let hasJumped = false;
  let hasDoubleJumped = false;
  let hasDashed = false;
  let airFrames = 0;

  while (frames < 360) {
    let keys = {};
    
    if (phase === 'approach') {
      // Run right toward edge of fromPlatform
      keys = { ArrowRight: true };
      if (sim.state.player.x >= fromPlatform.x + fromPlatform.w - 34 + (jumpTiming * 3)) {
        phase = 'jump';
      }
    } else if (phase === 'jump') {
      // Press jump + right
      keys = { ArrowRight: true, Space: true };
      hasJumped = true;
      phase = 'airborne';
    } else if (phase === 'airborne') {
      keys = { ArrowRight: true };
      airFrames++;
      
      // Double jump: wait until near apex (vy close to 0 or positive), then press jump
      if (isDouble && !hasDoubleJumped && sim.state.player.vy >= -80 && airFrames > 8) {
        keys = { ArrowRight: true, Space: true };
        hasDoubleJumped = true;
      }
      
      // Dash: use near apex for maximum horizontal distance
      if (isDash && !hasDashed && sim.state.player.vy >= -50 && airFrames > 10) {
        keys = { ArrowRight: true, ShiftLeft: true };
        hasDashed = true;
      }
    }

    // Need to release Space between presses for double jump to register
    if (hasJumped && phase === 'airborne' && !hasDoubleJumped && isDouble && airFrames < 8) {
      keys.Space = false;
    }

    sim.setInputs(keys);
    sim.step(DT);
    frames++;

    // Check: did we land on target platform? (with tolerance)
    const p = sim.state.player;
    if (p.onGround && 
        p.x + p.w > toPlatform.x && 
        p.x < toPlatform.x + toPlatform.w &&
        Math.abs(p.y - (toPlatform.y - 48)) < 10) {
      return true;
    }

    // Fell too far below target
    if (p.y > Math.max(fromPlatform.y, toPlatform.y) + 200) {
      return false;
    }
  }

  return false;
}
