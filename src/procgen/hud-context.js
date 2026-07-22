if (typeof window !== 'undefined') {
  window._activeGauges = window._activeGauges || new Set();
}

function circularGaugeMarkup({ label, symbol, valueText, pct, color }) {
  const dashOffset = 100 - Math.min(100, Math.max(0, pct));
  const isActive = typeof window !== 'undefined' && window._activeGauges && window._activeGauges.has(label);
  return `
    <div class="mobile-gauge-item${isActive ? ' active' : ''}" data-label="${label}">
      <svg class="gauge-circle" viewBox="0 0 36 36">
        <path class="gauge-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="rgba(6,26,32,0.88)" stroke="rgba(255,255,255,0.18)" stroke-width="2.5" />
        <path class="gauge-fill" stroke-dasharray="100, 100" stroke-dashoffset="${dashOffset}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" />
        <text x="18" y="21.5" text-anchor="middle" fill="#ecfff7" font-size="10.5" font-weight="900">${symbol}</text>
      </svg>
      <div class="gauge-tooltip">${label}: <strong>${valueText}</strong></div>
    </div>
  `;
}

let lastRootData = { health: 100, status: 'Saudável', color: '#70e5d6' };

export function updateContextPanel(state, nearbyRoot, contextDiv, sim) {
  if (!contextDiv) return;

  contextDiv.classList.add('visible');
  let html = `<div class="context-header">Bioma Local <span>${state?.activeBiomes?.length || 1}</span></div>`;

  let mobileGaugesHtml = '<div class="mobile-gauge-row">';

  if (nearbyRoot) {
    const health = nearbyRoot.rootHealth ? Math.round(nearbyRoot.rootHealth * 100) : 100;
    const rootColor = health < 40 ? '#ff8297' : '#70e5d6';
    const rootStatus = health >= 80 ? 'Saudável' : health >= 40 ? 'Estressada' : 'Crítica';
    lastRootData = { health, status: rootStatus, color: rootColor };

    html += `
      <div class="context-item">
        <span>Raiz: <strong>${rootStatus}</strong> (${health}%)</span>
        <div class="context-bar"><div class="context-bar-fill" style="width: ${health}%; background: ${rootColor};"></div></div>
      </div>
    `;
    if (nearbyRoot.hasPhosphate) {
      html += `<div class="context-item" style="color: #c9a5ff; font-weight: bold; margin-top: 4px;">P Cristalizado Detectado</div>`;
    }
  } else {
    html += `<div class="context-item"><span>Explorando o solo...</span></div>`;
  }

  // O medidor circular de Raiz (R) permanece continuamente aceso na UI móvel
  mobileGaugesHtml += circularGaugeMarkup({
    label: 'Saúde da Raiz',
    symbol: 'R',
    valueText: `${lastRootData.status} (${lastRootData.health}%)`,
    pct: lastRootData.health,
    color: lastRootData.color
  });

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
      mobileGaugesHtml += circularGaugeMarkup({ label: 'Ferro (Fe³⁺)', symbol: 'Fe', valueText: `${Math.round(ironPct)}%`, pct: ironPct, color: '#f4a261' });
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
      mobileGaugesHtml += circularGaugeMarkup({ label: 'Nitrogênio (N)', symbol: 'N', valueText: `${Math.round(nPct)}%`, pct: nPct, color: '#ffd783' });
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
      mobileGaugesHtml += circularGaugeMarkup({ label: 'Fósforo (P)', symbol: 'P', valueText: `${Math.round(pPct)}%`, pct: pPct, color: '#c9a5ff' });
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
      mobileGaugesHtml += circularGaugeMarkup({ label: 'Antibiose', symbol: 'A', valueText: `${Math.round(aPct)}%`, pct: aPct, color: '#b9f36f' });
    }

    if (phase >= 9) {
      const score = Math.round(Number(s.level?.ecologicalScore || 0) * 100);
      html += `
        <div class="context-item" style="margin-top: 10px; border-top: 1px solid rgba(126,214,205,0.3); padding-top: 6px;">
          <span>Qualidade Ecológica: <strong style="color: ${score >= 100 ? '#82ffbd' : '#ffd783'};">${score}%</strong> / 100%</span>
          <div class="context-bar"><div class="context-bar-fill" style="width: ${Math.min(100, score)}%; background: #82ffbd;"></div></div>
          <div style="font-size: 9px; color: rgba(222,250,245,0.72); margin-top: 4px;">Combine N, P, Fe³⁺, Biocontrole e Saúde Radicular</div>
        </div>
      `;
      mobileGaugesHtml += circularGaugeMarkup({ label: 'Qualidade Ecológica', symbol: 'Q', valueText: `${score}%`, pct: score, color: '#82ffbd' });
    }
  }

  mobileGaugesHtml += '</div>';

  contextDiv.innerHTML = html + mobileGaugesHtml;
}
