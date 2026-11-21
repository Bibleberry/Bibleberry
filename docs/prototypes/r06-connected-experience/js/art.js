/*
 * Bibleberry R06 Connected Experience Prototype — Icons & Synthetic Card Art Placeholders
 *
 * Notice: All card graphics below are clearly identified SYNTHETIC PLACEHOLDERS for UX review only.
 * They are NOT real published Bibleberry Scripture Cards or production artwork by Alexis Waid.
 * Source artwork colors are intentionally fixed (not CSS variables) so seasonal/manual app chrome
 * palettes never recolor earned Card illustrations (§1.2, §7.3).
 */

window.R06Proto = window.R06Proto || {};

window.R06Proto.Art = (function () {
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon(name) {
    var svgs = {
      today: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
      library: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
      collections: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="9" rx="1.5"/><rect x="14" y="4" width="7" height="5" rx="1.5"/><rect x="14" y="13" width="7" height="7" rx="1.5"/><rect x="3" y="17" width="7" height="3" rx="1.5"/></svg>',
      more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
      chevronRight: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
      arrowLeft: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
      check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
      lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      bookmark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
      share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>',
      sliders: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/></svg>'
    };
    return svgs[name] || '';
  }

  var ART_PALETTES = {
    botanical: { bg: '#f4efe4', shape1: '#d6e3d3', shape2: '#c5d4be', stroke: '#355c44', accent: '#9a7144' },
    arch:      { bg: '#f2ede6', shape1: '#dde5ec', shape2: '#c5d4e0', stroke: '#2c4c68', accent: '#8e6243' },
    lantern:   { bg: '#f7f1e5', shape1: '#efe0c0', shape2: '#dec798', stroke: '#6c4d21', accent: '#3d634a' },
    olive:     { bg: '#eff2ea', shape1: '#d8e3cd', shape2: '#bfcfa9', stroke: '#3e5938', accent: '#835d3b' },
    vessel:    { bg: '#f4ecea', shape1: '#e8d7d3', shape2: '#d5bcb6', stroke: '#683f44', accent: '#445e53' },
    scroll:    { bg: '#f3f1eb', shape1: '#e0dcd0', shape2: '#ccc5b4', stroke: '#464d3e', accent: '#7c5c39' },
    gathering: { bg: '#eef1f5', shape1: '#d5dfea', shape2: '#bac9db', stroke: '#2d4660', accent: '#7f5e3b' }
  };

  /**
   * Renders a fixed-color synthetic notebook illustration SVG for a genuinely earned Card.
   * When withExportWatermark === true, appends subtle export-time attribution ONLY to the exported preview (§7.3).
   */
  function renderCardIllustration(card, options) {
    var opts = options || {};
    if (card.simulateBrokenArt || opts.forceBroken) {
      return (
        '<div class="card-art-broken" role="img" aria-label="Illustration temporarily unavailable for earned card ' + esc(card.title) + '">' +
          '<strong>Illustration unavailable</strong>' +
          '<span>Your earned Scripture Card record and text remain intact.</span>' +
        '</div>'
      );
    }

    var p = ART_PALETTES[card.artMotif] || ART_PALETTES.botanical;
    var motifPath = '';
    switch (card.artMotif) {
      case 'arch':
        motifPath =
          '<path d="M72 220V118a88 88 0 0 1 176 0v102" fill="' + p.shape1 + '" stroke="' + p.stroke + '" stroke-width="2.2"/>' +
          '<path d="M108 220V132a52 52 0 0 1 104 0v88" fill="' + p.shape2 + '" stroke="' + p.stroke + '" stroke-width="1.6"/>' +
          '<circle cx="160" cy="96" r="14" fill="' + p.accent + '" opacity="0.82"/>';
        break;
      case 'lantern':
        motifPath =
          '<circle cx="160" cy="126" r="64" fill="' + p.shape1 + '"/>' +
          '<circle cx="160" cy="126" r="38" fill="' + p.shape2 + '"/>' +
          '<path d="M160 66v120M122 126h76M135 95l50 62M185 95l-50 62" stroke="' + p.stroke + '" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>' +
          '<circle cx="160" cy="126" r="11" fill="' + p.accent + '"/>';
        break;
      case 'vessel':
        motifPath =
          '<ellipse cx="160" cy="186" rx="70" ry="20" fill="' + p.shape1 + '"/>' +
          '<path d="M114 96h92c-6 36-16 66-20 88h-52c-4-22-14-52-20-88Z" fill="' + p.shape2 + '" stroke="' + p.stroke + '" stroke-width="2.2"/>' +
          '<path d="M132 76h56" stroke="' + p.accent + '" stroke-width="3" stroke-linecap="round"/>';
        break;
      case 'scroll':
        motifPath =
          '<rect x="78" y="64" width="164" height="128" rx="14" fill="' + p.shape1 + '" stroke="' + p.stroke + '" stroke-width="2"/>' +
          '<path d="M106 102h108M106 128h92M106 154h72" stroke="' + p.stroke + '" stroke-width="2.4" stroke-linecap="round"/>' +
          '<circle cx="212" cy="154" r="10" fill="' + p.accent + '"/>';
        break;
      case 'gathering':
        motifPath =
          '<circle cx="118" cy="132" r="46" fill="' + p.shape1 + '" stroke="' + p.stroke + '" stroke-width="1.8"/>' +
          '<circle cx="202" cy="132" r="46" fill="' + p.shape2 + '" stroke="' + p.stroke + '" stroke-width="1.8" opacity="0.88"/>' +
          '<circle cx="160" cy="96" r="32" fill="' + p.accent + '" opacity="0.32" stroke="' + p.stroke + '" stroke-width="1.8"/>';
        break;
      case 'olive':
      case 'botanical':
      default:
        motifPath =
          '<circle cx="160" cy="128" r="68" fill="' + p.shape1 + '"/>' +
          '<path d="M160 202V64" stroke="' + p.stroke + '" stroke-width="2.2" stroke-linecap="round"/>' +
          '<path d="M160 162c-26-8-42-26-44-50 24 4 40 20 44 50Z" fill="' + p.shape2 + '" stroke="' + p.stroke + '" stroke-width="1.7"/>' +
          '<path d="M160 134c26-8 42-26 44-50-24 4-40 20-44 50Z" fill="' + p.shape2 + '" stroke="' + p.stroke + '" stroke-width="1.7"/>' +
          '<circle cx="160" cy="64" r="7" fill="' + p.accent + '"/>';
        break;
    }

    var watermarkSvg = opts.withExportWatermark
      ? '<rect x="14" y="210" width="292" height="22" rx="4" fill="#ffffff" opacity="0.88"/>' +
        '<text x="160" y="225" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10.5" font-weight="600" fill="' + p.stroke + '">Bibleberry • Export-time attribution (Synthetic)</text>'
      : '';

    var label = opts.compact
      ? ''
      : '<text x="160" y="34" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" font-weight="700" letter-spacing="1.4" fill="' + p.stroke + '" opacity="0.72">SYNTHETIC ILLUSTRATION PLACEHOLDER</text>';

    return (
      '<svg viewBox="0 0 320 240" role="img" aria-label="' + esc(card.altText || ('Synthetic illustration placeholder for ' + card.title)) + '">' +
        '<rect width="320" height="240" fill="' + p.bg + '"/>' +
        '<rect x="10" y="10" width="300" height="220" rx="10" fill="none" stroke="' + p.stroke + '" stroke-width="1" opacity="0.22"/>' +
        label +
        motifPath +
        watermarkSvg +
      '</svg>'
    );
  }

  return {
    esc: esc,
    icon: icon,
    renderCardIllustration: renderCardIllustration
  };
})();
