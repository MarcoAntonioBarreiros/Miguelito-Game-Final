export function updateContextPanel(state, nearbyRoot, contextDiv, sim) {
  if (!contextDiv) return;

  if (!nearbyRoot && (!sim || !sim.state)) {
    contextDiv.classList.remove('visible');
    return;
  }
  
  contextDiv.classList.add('visible');
  let html = `<div class="context-header">Bioma Local <span>${state?.activeBiomes?.length || 1}</span></div>`;

  if (nearbyRoot) {
    const health = nearbyRoot.rootHealth ? Math.round(nearbyRoot.rootHealth * 100) : 100;
    html += `
      <div class="context-item">
        <span>Raiz: <strong>${health >= 80 ? 'Saudável' : health >= 40 ? 'Estressada' : 'Crítica'}</strong> (${health}%)</span>
        <div class="context-bar"><div class="context-bar-fill" style="width: ${health}%; background: ${health < 40 ? '#ff8297' : '#70e5d6'};"></div></div>
      </div>
    `;
    if (nearbyRoot.hasPhosphate) {
      html += `<div class="context-item" style="color: #c9a5ff; font-weight: bold; margin-top: 4px;">P Cristalizado Detectado</div>`;
    }
  } else {
    html += `<div class="context-item"><span>Explorando o solo...</span></div>`;
  }

  if (sim && sim.state) {
    const s = sim.state;
    const phase = s.campaign?.phase || 0;

    // Iron
    const ironMax = 1.5;
    const ironRecovered = sim.pseudomonasSiderophores?.ironRecovered || 0;
    const ironPct = Math.min(100, (ironRecovered / ironMax) * 100);
    if (phase >= 5 || ironPct > 0) {
      html += `
        <div class="context-item" style="margin-top: 8px;">
          <span>Ferro (Fe³⁺): <strong>${Math.round(ironPct)}%</strong></span>
          <div class="context-bar"><div class="context-bar-fill" style="width: ${ironPct}%; background: #f4a261;"></div></div>
        </div>
      `;
    }
    
    // Nitrogen
    const fixation = (s.level?.rhizobiumNodules || []).reduce((sum, site) => sum + (site.fixationRate || 0), 0);
    const associativeNitrogen = sim.azospirillumNitrogen?.associativeNitrogenRate || 0;
    if (phase >= 2 || fixation > 0 || associativeNitrogen > 0) {
      const nPct = Math.min(100, (fixation + associativeNitrogen) * 20);
      html += `
        <div class="context-item">
          <span>Nitrogênio (N): <strong>${Math.round(nPct)}%</strong></span>
          <div class="context-bar"><div class="context-bar-fill" style="width: ${nPct}%; background: #ffd783;"></div></div>
        </div>
      `;
    }

    // Phosphorus
    const availablePhosphate = sim.phosphateSolubilization?.availablePhosphate || 0;
    if (phase >= 7 || availablePhosphate > 0) {
      const pPct = Math.min(100, availablePhosphate * 100);
      html += `
        <div class="context-item">
          <span>Fósforo (P): <strong>${Math.round(pPct)}%</strong></span>
          <div class="context-bar"><div class="context-bar-fill" style="width: ${pPct}%; background: #c9a5ff;"></div></div>
        </div>
      `;
    }

    // Antibiosis
    const vigor = sim.trichodermaColonies?.vigorAverage || 0;
    if (phase >= 6 || vigor > 0) {
      const aPct = Math.min(100, vigor * 100);
      html += `
        <div class="context-item">
          <span>Antibiose: <strong>${Math.round(aPct)}%</strong></span>
          <div class="context-bar"><div class="context-bar-fill" style="width: ${aPct}%; background: #b9f36f;"></div></div>
        </div>
      `;
    }
  }

  contextDiv.innerHTML = html;
}
