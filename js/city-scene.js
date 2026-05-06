import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function createRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function byCommits(left, right) {
  return (
    (right.commits || 0) - (left.commits || 0) ||
    (right.contributions || 0) - (left.contributions || 0) ||
    left.username.localeCompare(right.username)
  );
}

function createPixelWindowTexture({
  seed,
  rows,
  columns,
  litRatio,
  palette,
  wallColor,
  windowOff
}) {
  const cell = 10;
  const gap = 3;
  const pad = 6;
  const width = pad * 2 + columns * cell + (columns - 1) * gap;
  const height = pad * 2 + rows * cell + (rows - 1) * gap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  const random = createRandom(seed);

  context.fillStyle = wallColor;
  context.fillRect(0, 0, width, height);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = pad + column * (cell + gap);
      const y = pad + row * (cell + gap);

      context.fillStyle = random() < litRatio
        ? palette[Math.floor(random() * palette.length)]
        : windowOff;
      context.fillRect(x, y, cell, cell);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createLabelSprite(title, subtitle, tint) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 180;
  const context = canvas.getContext("2d");

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(4, 8, 18, 0.76)";
  context.strokeStyle = "rgba(255,255,255,0.14)";
  context.lineWidth = 4;
  roundRect(context, 18, 18, 476, 144, 22);
  context.fill();
  context.stroke();

  context.font = "700 42px 'Space Grotesk', sans-serif";
  context.fillStyle = "#edf2ff";
  context.textAlign = "center";
  context.fillText(title, canvas.width / 2, 78);

  context.font = "700 30px 'Space Mono', monospace";
  context.fillStyle = tint;
  context.fillText(subtitle, canvas.width / 2, 122);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(110, 38, 1);
  sprite.center.set(0.5, 0);
  return sprite;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function createRoad(scene, width, depth, position) {
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(width, 2, depth),
    new THREE.MeshStandardMaterial({
      color: 0x0a1123,
      roughness: 0.95,
      metalness: 0.05
    })
  );
  road.position.copy(position);
  road.receiveShadow = true;
  scene.add(road);

  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.92, depth * 0.05),
    new THREE.MeshBasicMaterial({
      color: 0x7ec6ff,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide
    })
  );
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(position.x, position.y + 1.2, position.z);
  scene.add(lane);
}

function createPlaza(scene, position, radius, color) {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.12, 4, 48),
    new THREE.MeshStandardMaterial({
      color: 0x101b34,
      emissive: new THREE.Color(color).multiplyScalar(0.08),
      roughness: 0.8,
      metalness: 0.1
    })
  );
  base.position.copy(position);
  base.receiveShadow = true;
  scene.add(base);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.84, radius * 0.96, 56),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, position.y + 2.2, position.z);
  scene.add(ring);
}

function createBuildingMaterials(seed, palette, rows, columns, litRatio, accentColor, leader = false) {
  const wallTexture = createPixelWindowTexture({
    seed,
    rows,
    columns,
    litRatio,
    palette,
    wallColor: leader ? "#18284f" : "#111b35",
    windowOff: leader ? "#15203a" : "#0b1226"
  });

  const sideTexture = createPixelWindowTexture({
    seed: seed + 91,
    rows,
    columns: Math.max(2, Math.round(columns * 0.7)),
    litRatio: Math.max(0.08, litRatio * 0.85),
    palette,
    wallColor: leader ? "#132246" : "#0f1731",
    windowOff: leader ? "#101935" : "#090f22"
  });

  const frontMaterial = new THREE.MeshStandardMaterial({
    map: wallTexture,
    emissive: new THREE.Color(accentColor).multiplyScalar(leader ? 0.4 : 0.16),
    emissiveMap: wallTexture,
    roughness: 0.58,
    metalness: leader ? 0.24 : 0.16
  });

  const sideMaterial = new THREE.MeshStandardMaterial({
    map: sideTexture,
    emissive: new THREE.Color(accentColor).multiplyScalar(leader ? 0.26 : 0.1),
    emissiveMap: sideTexture,
    roughness: 0.6,
    metalness: 0.12
  });

  const roofMaterial = new THREE.MeshStandardMaterial({
    color: leader ? 0xe0a33d : 0x22365f,
    emissive: new THREE.Color(accentColor).multiplyScalar(leader ? 0.9 : 0.24),
    roughness: 0.45,
    metalness: leader ? 0.5 : 0.2
  });

  return [
    sideMaterial,
    sideMaterial,
    roofMaterial,
    roofMaterial,
    frontMaterial,
    frontMaterial
  ];
}

function createLeaderPartyShip(radius, accent) {
  const shipGroup = new THREE.Group();

  const saucerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.34, radius * 0.5, 10, 40),
    new THREE.MeshStandardMaterial({
      color: 0xefe6ff,
      emissive: new THREE.Color("#a770ff"),
      emissiveIntensity: 0.45,
      roughness: 0.24,
      metalness: 0.82
    })
  );
  shipGroup.add(saucerBase);

  const saucerDome = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.22, 28, 20),
    new THREE.MeshStandardMaterial({
      color: 0xbfe8ff,
      emissive: new THREE.Color("#7fd7ff"),
      emissiveIntensity: 0.9,
      roughness: 0.12,
      metalness: 0.28,
      transparent: true,
      opacity: 0.92
    })
  );
  saucerDome.position.y = 10;
  shipGroup.add(saucerDome);

  const lowerRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.44, 2.8, 14, 48),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.82
    })
  );
  lowerRing.rotation.x = Math.PI / 2;
  lowerRing.position.y = -1;
  shipGroup.add(lowerRing);

  const discoHalo = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.62, 3.5, 16, 64),
    new THREE.MeshBasicMaterial({
      color: 0xff7bfa,
      transparent: true,
      opacity: 0.45
    })
  );
  discoHalo.rotation.x = Math.PI / 2;
  discoHalo.position.y = -5;
  shipGroup.add(discoHalo);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.12, radius * 0.34, 150, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x8ef3ff,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  beam.position.y = -78;
  shipGroup.add(beam);

  const lightDots = new THREE.Group();
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 12, 12),
      new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? 0xffd86f : 0x7fe1ff,
        transparent: true,
        opacity: 0.95
      })
    );
    light.position.set(Math.cos(angle) * radius * 0.4, -2, Math.sin(angle) * radius * 0.4);
    lightDots.add(light);
  }
  shipGroup.add(lightDots);

  shipGroup.userData = {
    lowerRing,
    discoHalo,
    beam,
    lightDots
  };

  return shipGroup;
}

const NON_LEADER_STYLES = [
  "classic",
  "brutalist",
  "modern",
  "artdeco",
  "tiered",
  "cylindrical",
  "exoskeleton",
  "eco",
  "spire",
  "monolith",
  "offset"
];

function pickTowerStyle(index) {
  return NON_LEADER_STYLES[index % NON_LEADER_STYLES.length];
}

function getStyleConfig(style, color, accent) {
  switch (style) {
    case "brutalist":
      return {
        palette: ["#a89c8a", "#9a8e7a", "#bba896"],
        wallColor: "#5a5145",
        windowOff: "#1d1812",
        crownColor: 0x3a3024,
        roughness: 0.92,
        metalness: 0.04,
        emissiveScale: 0.05,
        litMul: 0.4,
        columnsMul: 0.55
      };
    case "modern":
      return {
        palette: ["#9adfff", "#7ec0ee", "#cdf2ff", "#dde6ff"],
        wallColor: "#1a2740",
        windowOff: "#0a1224",
        crownColor: 0x2a4366,
        roughness: 0.32,
        metalness: 0.46,
        emissiveScale: 0.22,
        litMul: 1.1,
        columnsMul: 1.45
      };
    case "artdeco":
      return {
        palette: ["#ffe4a3", "#f0c878", "#fff0c8"],
        wallColor: "#2a2010",
        windowOff: "#1a1408",
        crownColor: 0xc89a4e,
        roughness: 0.42,
        metalness: 0.34,
        emissiveScale: 0.20,
        litMul: 0.9,
        columnsMul: 1.0
      };
    case "tiered":
      return {
        palette: ["#ff9a6e", "#ffb88c", "#ffd9c4"],
        wallColor: "#3a2418",
        windowOff: "#241410",
        crownColor: 0xa84e2e,
        roughness: 0.5,
        metalness: 0.18,
        emissiveScale: 0.18,
        litMul: 0.8,
        columnsMul: 0.9
      };
    case "cylindrical":
      return {
        palette: ["#8ff4ff", "#5eb4ff", "#d8fbff"],
        wallColor: "#10243c",
        windowOff: "#07101e",
        crownColor: 0x64d8ff,
        roughness: 0.28,
        metalness: 0.52,
        emissiveScale: 0.28,
        litMul: 1.2,
        columnsMul: 1.7
      };
    case "exoskeleton":
      return {
        palette: ["#ff9a48", "#ffd0a4", "#79c8ff"],
        wallColor: "#181716",
        windowOff: "#090807",
        crownColor: 0xcc5f24,
        roughness: 0.5,
        metalness: 0.36,
        emissiveScale: 0.24,
        litMul: 0.75,
        columnsMul: 0.8
      };
    case "eco":
      return {
        palette: ["#9affb9", "#69db88", "#d9ffd7"],
        wallColor: "#183323",
        windowOff: "#07170e",
        crownColor: 0x4fb86e,
        roughness: 0.72,
        metalness: 0.1,
        emissiveScale: 0.18,
        litMul: 0.85,
        columnsMul: 1.05
      };
    case "spire":
      return {
        palette: ["#b59cff", "#7bd7ff", "#f3e8ff"],
        wallColor: "#171132",
        windowOff: "#080615",
        crownColor: 0x7f6dff,
        roughness: 0.25,
        metalness: 0.62,
        emissiveScale: 0.34,
        litMul: 1.15,
        columnsMul: 1.3
      };
    case "monolith":
      return {
        palette: ["#ff7d73", "#ffbd9b", "#86a8ff"],
        wallColor: "#262b34",
        windowOff: "#10131a",
        crownColor: 0x3a414e,
        roughness: 0.86,
        metalness: 0.08,
        emissiveScale: 0.14,
        litMul: 0.55,
        columnsMul: 0.65
      };
    case "offset":
      return {
        palette: ["#ff8fe5", "#8fdcff", "#ffd7fb"],
        wallColor: "#201735",
        windowOff: "#0c0818",
        crownColor: 0x8c55cc,
        roughness: 0.38,
        metalness: 0.34,
        emissiveScale: 0.3,
        litMul: 1.0,
        columnsMul: 1.2
      };
    case "classic":
    default:
      return {
        palette: [color, accent, "#dbeaff", "#a8d8ff"],
        wallColor: "#111b35",
        windowOff: "#0b1226",
        crownColor: 0x2f4a83,
        roughness: 0.58,
        metalness: 0.16,
        emissiveScale: 0.16,
        litMul: 1.0,
        columnsMul: 1.0
      };
  }
}

function createStyledMaterials(seed, floors, columns, litRatio, accent, config) {
  const adjLit = Math.min(0.98, litRatio * config.litMul);
  const adjColumns = Math.max(2, Math.round(columns * config.columnsMul));

  const wallTexture = createPixelWindowTexture({
    seed,
    rows: floors,
    columns: adjColumns,
    litRatio: adjLit,
    palette: config.palette,
    wallColor: config.wallColor,
    windowOff: config.windowOff
  });

  const sideTexture = createPixelWindowTexture({
    seed: seed + 91,
    rows: floors,
    columns: Math.max(2, Math.round(adjColumns * 0.7)),
    litRatio: Math.max(0.05, adjLit * 0.85),
    palette: config.palette,
    wallColor: config.wallColor,
    windowOff: config.windowOff
  });

  const front = new THREE.MeshStandardMaterial({
    map: wallTexture,
    emissive: new THREE.Color(accent).multiplyScalar(config.emissiveScale),
    emissiveMap: wallTexture,
    roughness: config.roughness,
    metalness: config.metalness
  });

  const side = new THREE.MeshStandardMaterial({
    map: sideTexture,
    emissive: new THREE.Color(accent).multiplyScalar(config.emissiveScale * 0.62),
    emissiveMap: sideTexture,
    roughness: Math.min(1, config.roughness + 0.02),
    metalness: config.metalness * 0.7
  });

  const roof = new THREE.MeshStandardMaterial({
    color: config.crownColor,
    emissive: new THREE.Color(accent).multiplyScalar(config.emissiveScale * 1.4),
    roughness: 0.45,
    metalness: 0.2
  });

  return [side, side, roof, roof, front, front];
}

function buildStyledTowerStructure({ style, baseWidth, baseDepth, height, crownHeight, materials, config, accent, seed }) {
  const random = createRandom(seed + 7);
  const bodies = [];
  const decorations = [];

  if (style === "brutalist") {
    const slabs = 3;
    const slabH = height / slabs;
    for (let i = 0; i < slabs; i += 1) {
      const w = baseWidth * (1 - i * 0.04);
      const d = baseDepth * (1 - i * 0.04);
      const offX = (random() - 0.5) * baseWidth * 0.18;
      const offZ = (random() - 0.5) * baseDepth * 0.18;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(w, slabH * 0.94, d),
        materials
      );
      slab.position.set(offX, slabH * (i + 0.5), offZ);
      bodies.push(slab);
    }

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(baseWidth * 0.8, crownHeight * 0.6, baseDepth * 0.8),
      new THREE.MeshStandardMaterial({
        color: 0x2e2618,
        roughness: 0.92,
        metalness: 0.04
      })
    );
    cap.position.y = height + crownHeight * 0.3;
    decorations.push(cap);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height + crownHeight * 0.6,
      topWidth: baseWidth * 0.92,
      topDepth: baseDepth * 0.92
    };
  }

  if (style === "modern") {
    const slimW = baseWidth * 0.78;
    const slimD = baseDepth * 0.78;
    const main = new THREE.Mesh(
      new THREE.BoxGeometry(slimW, height, slimD),
      materials
    );
    main.position.y = height / 2;
    bodies.push(main);

    const taper = new THREE.Mesh(
      new THREE.BoxGeometry(slimW * 0.85, crownHeight * 0.6, slimD * 0.85),
      new THREE.MeshStandardMaterial({
        color: 0x1c2a44,
        emissive: new THREE.Color(accent).multiplyScalar(0.5),
        roughness: 0.32,
        metalness: 0.5
      })
    );
    taper.position.y = height + crownHeight * 0.3;
    decorations.push(taper);

    const antennaH = crownHeight * 4.5;
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1.4, antennaH, 12),
      new THREE.MeshStandardMaterial({
        color: 0xc8d6e6,
        emissive: new THREE.Color(accent).multiplyScalar(0.7),
        roughness: 0.3,
        metalness: 0.85
      })
    );
    antenna.position.y = height + crownHeight * 0.6 + antennaH / 2;
    decorations.push(antenna);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xff4040 })
    );
    beacon.position.y = height + crownHeight * 0.6 + antennaH + 1.5;
    decorations.push(beacon);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height + crownHeight * 0.6 + antennaH + 4,
      topWidth: slimW,
      topDepth: slimD
    };
  }

  if (style === "artdeco") {
    const tiers = [
      { w: 1.0, d: 1.0, h: 0.55 },
      { w: 0.78, d: 0.78, h: 0.28 },
      { w: 0.55, d: 0.55, h: 0.17 }
    ];
    let y = 0;
    let lastW = 0;
    let lastD = 0;
    for (const t of tiers) {
      const w = baseWidth * t.w;
      const d = baseDepth * t.d;
      const h = height * t.h;
      const tier = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        materials
      );
      tier.position.y = y + h / 2;
      bodies.push(tier);
      y += h;
      lastW = w;
      lastD = d;
    }

    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(lastW * 0.32, lastW * 0.42, crownHeight * 0.85, 18),
      new THREE.MeshStandardMaterial({
        color: 0xd4a85a,
        emissive: new THREE.Color("#ffcd6a").multiplyScalar(0.5),
        roughness: 0.32,
        metalness: 0.74
      })
    );
    drum.position.y = height + crownHeight * 0.42;
    decorations.push(drum);

    const spireH = crownHeight * 3.4;
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(lastW * 0.18, spireH, 14),
      new THREE.MeshStandardMaterial({
        color: 0xffd97a,
        emissive: new THREE.Color("#ffd366").multiplyScalar(0.7),
        roughness: 0.25,
        metalness: 0.82
      })
    );
    spire.position.y = height + crownHeight * 0.85 + spireH / 2;
    decorations.push(spire);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height + crownHeight * 0.85 + spireH,
      topWidth: lastW,
      topDepth: lastD
    };
  }

  if (style === "tiered") {
    const tiers = [
      { w: 1.0, d: 1.0, h: 0.36 },
      { w: 0.82, d: 0.82, h: 0.26 },
      { w: 0.64, d: 0.64, h: 0.20 },
      { w: 0.46, d: 0.46, h: 0.18 }
    ];
    let y = 0;
    let lastW = 0;
    let lastD = 0;
    for (const t of tiers) {
      const w = baseWidth * t.w;
      const d = baseDepth * t.d;
      const h = height * t.h;
      const tier = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        materials
      );
      tier.position.y = y + h / 2;
      bodies.push(tier);
      y += h;
      lastW = w;
      lastD = d;
    }

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(lastW * 0.42, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0xb55a3a,
        emissive: new THREE.Color("#ff8c5a").multiplyScalar(0.45),
        roughness: 0.4,
        metalness: 0.32
      })
    );
    dome.position.y = height;
    decorations.push(dome);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height + lastW * 0.42,
      topWidth: lastW,
      topDepth: lastD
    };
  }

  if (style === "cylindrical") {
    const radius = Math.max(baseWidth, baseDepth) * 0.42;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.08, height, 28),
      materials[4]
    );
    body.position.y = height / 2;
    bodies.push(body);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent),
      transparent: true,
      opacity: 0.55
    });
    for (let i = 1; i <= 4; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * (1.02 + i * 0.015), 1.2, 8, 48),
        ringMaterial
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = height * (i / 5);
      decorations.push(ring);
    }

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.72, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: config.crownColor,
        emissive: new THREE.Color(accent).multiplyScalar(0.65),
        roughness: 0.22,
        metalness: 0.58
      })
    );
    dome.position.y = height;
    decorations.push(dome);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height + radius * 0.72,
      topWidth: radius * 2,
      topDepth: radius * 2
    };
  }

  if (style === "exoskeleton") {
    const coreW = baseWidth * 0.64;
    const coreD = baseDepth * 0.64;
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(coreW, height, coreD),
      materials
    );
    core.position.y = height / 2;
    bodies.push(core);

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xd36d30,
      emissive: new THREE.Color("#ff7838").multiplyScalar(0.45),
      roughness: 0.34,
      metalness: 0.66
    });
    const legPositions = [
      [baseWidth * 0.48, baseDepth * 0.48],
      [-baseWidth * 0.48, baseDepth * 0.48],
      [baseWidth * 0.48, -baseDepth * 0.48],
      [-baseWidth * 0.48, -baseDepth * 0.48]
    ];
    legPositions.forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(4, height * 0.96, 4), frameMaterial);
      leg.position.set(x, height * 0.48, z);
      decorations.push(leg);
    });
    for (let i = 1; i <= 4; i += 1) {
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(baseWidth * 1.05, 4, baseDepth * 1.05),
        frameMaterial
      );
      deck.position.y = height * (i / 5);
      decorations.push(deck);
    }

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(baseWidth * 0.9, crownHeight * 0.55, baseDepth * 0.9),
      frameMaterial
    );
    crown.position.y = height + crownHeight * 0.28;
    decorations.push(crown);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height + crownHeight * 0.55,
      topWidth: baseWidth,
      topDepth: baseDepth
    };
  }

  if (style === "eco") {
    const tiers = [
      { r: 0.58, h: 0.30 },
      { r: 0.50, h: 0.25 },
      { r: 0.42, h: 0.22 },
      { r: 0.34, h: 0.18 }
    ];
    let y = 0;
    let lastRadius = 0;
    for (const tier of tiers) {
      const tierH = height * tier.h;
      const radius = Math.max(baseWidth, baseDepth) * tier.r;
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.92, radius, tierH, 18),
        materials[4]
      );
      body.position.y = y + tierH / 2;
      bodies.push(body);

      const garden = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.96, 2.2, 8, 36),
        new THREE.MeshStandardMaterial({
          color: 0x66d47d,
          emissive: new THREE.Color("#48d36f").multiplyScalar(0.35),
          roughness: 0.82,
          metalness: 0.02
        })
      );
      garden.rotation.x = Math.PI / 2;
      garden.position.y = y + tierH;
      decorations.push(garden);
      y += tierH;
      lastRadius = radius;
    }

    const glassCap = new THREE.Mesh(
      new THREE.SphereGeometry(lastRadius * 0.7, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0x9fffc0,
        emissive: new THREE.Color("#69ff98").multiplyScalar(0.42),
        roughness: 0.36,
        metalness: 0.18
      })
    );
    glassCap.position.y = height;
    decorations.push(glassCap);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height + lastRadius * 0.7,
      topWidth: lastRadius * 2,
      topDepth: lastRadius * 2
    };
  }

  if (style === "spire") {
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(baseWidth * 0.56, height, 4),
      materials[4]
    );
    body.rotation.y = Math.PI / 4;
    body.position.y = height / 2;
    bodies.push(body);

    const edgeMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent),
      transparent: true,
      opacity: 0.62
    });
    for (let i = 0; i < 4; i += 1) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, height * 0.78, 2.4),
        edgeMaterial
      );
      const angle = Math.PI / 4 + i * Math.PI / 2;
      fin.position.set(
        Math.cos(angle) * baseWidth * 0.34,
        height * 0.45,
        Math.sin(angle) * baseWidth * 0.34
      );
      decorations.push(fin);
    }

    const needle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 2.4, crownHeight * 3.6, 12),
      new THREE.MeshStandardMaterial({
        color: config.crownColor,
        emissive: new THREE.Color(accent).multiplyScalar(0.85),
        roughness: 0.2,
        metalness: 0.78
      })
    );
    needle.position.y = height + crownHeight * 1.8;
    decorations.push(needle);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height + crownHeight * 3.6,
      topWidth: baseWidth * 0.7,
      topDepth: baseWidth * 0.7
    };
  }

  if (style === "monolith") {
    const slabs = [
      { w: 0.92, d: 1.0, h: 0.32, x: -0.06, z: 0.03 },
      { w: 1.0, d: 0.84, h: 0.30, x: 0.08, z: -0.08 },
      { w: 0.78, d: 0.92, h: 0.24, x: -0.02, z: 0.08 },
      { w: 0.62, d: 0.72, h: 0.14, x: 0.10, z: 0.00 }
    ];
    let y = 0;
    let lastW = 0;
    let lastD = 0;
    slabs.forEach((slabInfo) => {
      const h = height * slabInfo.h;
      const w = baseWidth * slabInfo.w;
      const d = baseDepth * slabInfo.d;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials);
      slab.position.set(baseWidth * slabInfo.x, y + h / 2, baseDepth * slabInfo.z);
      bodies.push(slab);
      y += h;
      lastW = w;
      lastD = d;
    });

    const cutGlow = new THREE.Mesh(
      new THREE.BoxGeometry(baseWidth * 0.72, 3, baseDepth * 0.08),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent),
        transparent: true,
        opacity: 0.65
      })
    );
    cutGlow.position.set(0, height * 0.56, baseDepth * 0.49);
    decorations.push(cutGlow);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height,
      topWidth: lastW,
      topDepth: lastD
    };
  }

  if (style === "offset") {
    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(baseWidth * 0.72, height * 0.62, baseDepth * 0.72),
      materials
    );
    lower.position.set(-baseWidth * 0.12, height * 0.31, 0);
    bodies.push(lower);

    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(baseWidth * 0.58, height * 0.52, baseDepth * 0.58),
      materials
    );
    upper.position.set(baseWidth * 0.16, height * 0.74, 0);
    upper.rotation.y = Math.PI / 10;
    bodies.push(upper);

    const sail = new THREE.Mesh(
      new THREE.ConeGeometry(baseWidth * 0.28, crownHeight * 3.2, 3),
      new THREE.MeshStandardMaterial({
        color: config.crownColor,
        emissive: new THREE.Color(accent).multiplyScalar(0.72),
        roughness: 0.24,
        metalness: 0.64
      })
    );
    sail.position.set(baseWidth * 0.32, height + crownHeight * 1.6, 0);
    sail.rotation.y = Math.PI / 6;
    decorations.push(sail);

    return {
      bodies,
      decorations,
      topY: height,
      apexY: height + crownHeight * 3.2,
      topWidth: baseWidth * 0.7,
      topDepth: baseDepth * 0.7
    };
  }

  // classic
  const main = new THREE.Mesh(
    new THREE.BoxGeometry(baseWidth, height, baseDepth),
    materials
  );
  main.position.y = height / 2;
  bodies.push(main);

  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(baseWidth * 0.74, crownHeight, baseDepth * 0.72),
    new THREE.MeshStandardMaterial({
      color: config.crownColor,
      emissive: new THREE.Color(accent).multiplyScalar(0.35),
      roughness: 0.42,
      metalness: 0.38
    })
  );
  crown.position.y = height + crownHeight / 2;
  decorations.push(crown);

  return {
    bodies,
    decorations,
    topY: height,
    apexY: height + crownHeight,
    topWidth: baseWidth,
    topDepth: baseDepth
  };
}

function createAirplane(seed) {
  const accents = ["#ff7b7b", "#9afcff", "#ffd57a", "#aef0a0", "#ff9eff", "#ffae5a"];
  const accent = accents[seed % accents.length];

  const group = new THREE.Group();

  const fuselageMaterial = new THREE.MeshStandardMaterial({
    color: 0xeef2f8,
    emissive: 0x1a2032,
    roughness: 0.42,
    metalness: 0.55
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a5468,
    roughness: 0.5,
    metalness: 0.4
  });

  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 28, 14),
    fuselageMaterial
  );
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 4, 14),
    fuselageMaterial
  );
  nose.position.set(0, 0, -16);
  nose.rotation.x = -Math.PI / 2;
  group.add(nose);

  const wings = new THREE.Mesh(
    new THREE.BoxGeometry(28, 0.8, 6),
    trimMaterial
  );
  wings.position.set(0, -0.5, 0);
  group.add(wings);

  const hStab = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.6, 3),
    trimMaterial
  );
  hStab.position.set(0, 0.4, 12);
  group.add(hStab);

  const vStab = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 5, 4),
    trimMaterial
  );
  vStab.position.set(0, 2.5, 12.5);
  group.add(vStab);

  const lightR = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a })
  );
  lightR.position.set(14.2, -0.3, 0);
  group.add(lightR);

  const lightG = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x2aff5a })
  );
  lightG.position.set(-14.2, -0.3, 0);
  group.add(lightG);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  beacon.position.set(0, 3.0, 8);
  group.add(beacon);

  const strobeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(accent),
    transparent: true,
    opacity: 0.85
  });
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 10, 10),
    strobeMat
  );
  strobe.position.set(0, -2.6, -2);
  group.add(strobe);

  group.userData = { beacon, strobe, accent };
  return group;
}

function createAirTraffic(scene, count) {
  const planes = [];
  for (let i = 0; i < count; i += 1) {
    const plane = createAirplane(i + 1);

    const altitude = 460 + ((i * 73) % 280);
    const pathRadius = 880 + ((i * 137) % 420);
    const angularSpeedBase = 0.045 + (((i * 13) % 7) / 7) * 0.05;
    const angularSpeed = angularSpeedBase * (i % 2 === 0 ? 1 : -1);
    const angleOffset = (i * 0.62) % (Math.PI * 2);
    const tilt = (((i * 31) % 17) / 17 - 0.5) * 0.22;
    const bobAmp = 5 + (i % 4) * 1.4;

    plane.userData.path = { altitude, pathRadius, angularSpeed, angleOffset, tilt, bobAmp };
    scene.add(plane);
    planes.push(plane);
  }

  const aheadVec = new THREE.Vector3();

  return {
    planes,
    update(elapsed) {
      planes.forEach((plane) => {
        const { altitude, pathRadius, angularSpeed, angleOffset, tilt, bobAmp } = plane.userData.path;
        const angle = angleOffset + elapsed * angularSpeed;
        const x = Math.cos(angle) * pathRadius;
        const z = Math.sin(angle) * pathRadius;
        const y = altitude + Math.sin(elapsed * 0.5 + angleOffset) * bobAmp;
        plane.position.set(x, y, z);

        const aheadAngle = angle + Math.sign(angularSpeed) * 0.05;
        aheadVec.set(
          Math.cos(aheadAngle) * pathRadius,
          y,
          Math.sin(aheadAngle) * pathRadius
        );
        plane.lookAt(aheadVec);
        plane.rotation.z += tilt * Math.sin(elapsed * 0.3 + angleOffset);

        if (plane.userData.beacon) {
          const t = (elapsed * 1.4 + angleOffset) % 1.6;
          const lit = t < 0.12 ? 1.0 : 0.18;
          plane.userData.beacon.material.color.setRGB(lit, lit, lit);
        }
        if (plane.userData.strobe) {
          const pulse = (Math.sin(elapsed * 4.5 + angleOffset * 3) + 1) * 0.5;
          plane.userData.strobe.material.opacity = 0.35 + pulse * 0.6;
        }
      });
    }
  };
}

function createMainTower(competitor, options) {
  const {
    position,
    isLeader,
    commitRatio,
    color,
    accent,
    towerStyle
  } = options;

  const seed = hashString(competitor.username);
  const group = new THREE.Group();
  group.position.copy(position);

  const baseWidth = 42 + commitRatio * 24 + (isLeader ? 18 : 0);
  const baseDepth = 34 + commitRatio * 22 + (isLeader ? 14 : 0);
  const height = 150 + commitRatio * 370 + (isLeader ? 130 : 0);
  const crownHeight = height * (isLeader ? 0.1 : 0.07);
  const floors = Math.max(10, Math.round(height / 10));
  const columns = Math.max(4, Math.round(baseWidth / 7));
  const litRatio = Math.min(0.98, 0.2 + commitRatio * 0.73);

  const style = isLeader ? "leader" : towerStyle;
  const bodies = [];
  let topY;
  let topWidth;
  let topDepth;
  let apexY;

  if (isLeader) {
    const materials = createBuildingMaterials(
      seed,
      ["#fff1b7", "#ffd56d", "#ffc14e", "#c7ebff"],
      floors,
      columns,
      litRatio,
      accent,
      true
    );

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(baseWidth, height, baseDepth),
      materials
    );
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = height / 2;
    body.userData.competitor = competitor;
    group.add(body);
    bodies.push(body);

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(baseWidth * 0.74, crownHeight, baseDepth * 0.72),
      new THREE.MeshStandardMaterial({
        color: 0xf7c557,
        emissive: new THREE.Color(accent).multiplyScalar(1.2),
        roughness: 0.42,
        metalness: 0.38
      })
    );
    crown.position.y = height + crownHeight / 2;
    crown.castShadow = true;
    group.add(crown);

    topY = height;
    topWidth = baseWidth;
    topDepth = baseDepth;
    apexY = height + crownHeight;
  } else {
    const config = getStyleConfig(style, color, accent);
    const materials = createStyledMaterials(seed, floors, columns, litRatio, accent, config);
    const struct = buildStyledTowerStructure({
      style,
      baseWidth,
      baseDepth,
      height,
      crownHeight,
      materials,
      config,
      accent,
      seed
    });

    struct.bodies.forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.competitor = competitor;
      group.add(mesh);
      bodies.push(mesh);
    });

    struct.decorations.forEach((mesh) => {
      mesh.castShadow = true;
      group.add(mesh);
    });

    topY = struct.topY;
    topWidth = struct.topWidth;
    topDepth = struct.topDepth;
    apexY = struct.apexY;
  }

  const labelBaseY = isLeader
    ? height + crownHeight + 156
    : Math.max(apexY + 32, height + crownHeight + 92);

  const roofGlow = new THREE.Mesh(
    new THREE.TorusGeometry(topWidth * 0.34, isLeader ? 2.6 : 1.4, 12, 42),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: isLeader ? 0.7 : 0.35
    })
  );
  roofGlow.rotation.x = Math.PI / 2;
  roofGlow.position.y = topY + (isLeader ? crownHeight + 24 : crownHeight + 14);
  group.add(roofGlow);

  let haloRing = null;
  let orbCluster = null;
  let crownTier = null;
  let cornerLights = null;
  let partyShip = null;
  const label = createLabelSprite(
    competitor.username,
    `${competitor.commits || 0} commits`,
    isLeader ? "#ffdd88" : accent
  );
  label.position.set(0, labelBaseY, 0);
  group.add(label);

  const baseGlow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(baseWidth, baseDepth) * (isLeader ? 0.82 : 0.68), 48),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: isLeader ? 0.26 : 0.12
    })
  );
  baseGlow.rotation.x = -Math.PI / 2;
  baseGlow.position.y = 1.5;
  group.add(baseGlow);

  let beam = null;
  if (isLeader) {
    crownTier = new THREE.Mesh(
      new THREE.BoxGeometry(baseWidth * 0.54, crownHeight * 0.72, baseDepth * 0.52),
      new THREE.MeshStandardMaterial({
        color: 0xffe097,
        emissive: new THREE.Color("#ffd977"),
        emissiveIntensity: 1.35,
        roughness: 0.28,
        metalness: 0.66
      })
    );
    crownTier.position.y = height + crownHeight + crownHeight * 0.38;
    crownTier.castShadow = true;
    group.add(crownTier);

    beam = new THREE.Mesh(
      new THREE.CylinderGeometry(baseWidth * 0.08, baseWidth * 0.22, 380, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd56d,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    beam.position.y = height + 180;
    group.add(beam);

    haloRing = new THREE.Mesh(
      new THREE.TorusGeometry(baseWidth * 0.48, 4.4, 18, 64),
      new THREE.MeshBasicMaterial({
        color: 0xffe18c,
        transparent: true,
        opacity: 0.55
      })
    );
    haloRing.rotation.x = Math.PI / 2;
    haloRing.position.y = height + crownHeight + 54;
    group.add(haloRing);

    orbCluster = new THREE.Group();
    const orbMaterial = new THREE.MeshBasicMaterial({
      color: 0xffefb4,
      transparent: true,
      opacity: 0.95
    });
    const orbOffsets = [
      [baseWidth * 0.42, height + crownHeight + 72, 0],
      [-baseWidth * 0.42, height + crownHeight + 72, 0],
      [0, height + crownHeight + 72, baseDepth * 0.42],
      [0, height + crownHeight + 72, -baseDepth * 0.42]
    ];
    orbOffsets.forEach(([x, y, z]) => {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 20), orbMaterial);
      orb.position.set(x, y, z);
      orbCluster.add(orb);
    });
    group.add(orbCluster);

    cornerLights = new THREE.Group();
    const finMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd56d,
      emissive: new THREE.Color("#ffd46a"),
      emissiveIntensity: 0.95,
      roughness: 0.22,
      metalness: 0.74
    });
    const finPositions = [
      [baseWidth * 0.46, height * 0.5, baseDepth * 0.46],
      [-baseWidth * 0.46, height * 0.5, baseDepth * 0.46],
      [baseWidth * 0.46, height * 0.5, -baseDepth * 0.46],
      [-baseWidth * 0.46, height * 0.5, -baseDepth * 0.46]
    ];
    finPositions.forEach(([x, y, z]) => {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(5, height * 0.72, 5),
        finMaterial
      );
      fin.position.set(x, y, z);
      fin.castShadow = true;
      cornerLights.add(fin);
    });
    group.add(cornerLights);

    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 6, 72, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffd56d,
        emissive: new THREE.Color("#ffdc8c"),
        emissiveIntensity: 1.2,
        roughness: 0.2,
        metalness: 0.8
      })
    );
    spire.position.y = height + crownHeight + 40;
    group.add(spire);

    const trophy = new THREE.Mesh(
      new THREE.OctahedronGeometry(12, 0),
      new THREE.MeshStandardMaterial({
        color: 0xffefb2,
        emissive: new THREE.Color("#ffe7a0"),
        emissiveIntensity: 1.5,
        roughness: 0.16,
        metalness: 0.92
      })
    );
    trophy.position.y = height + crownHeight + 82;
    group.add(trophy);

    partyShip = createLeaderPartyShip(baseWidth, accent);
    partyShip.position.set(0, height + crownHeight + 118, 0);
    group.add(partyShip);
  }

  group.userData = {
    competitor,
    body: bodies[0],
    bodies,
    style,
    label,
    labelBaseY,
    beam,
    haloRing,
    orbCluster,
    roofGlow,
    crownTier,
    cornerLights,
    partyShip,
    towerTop: topY + crownHeight,
    apexY,
    focusHeight: height * 0.55
  };

  return group;
}

function createFillerTower({ seed, position, height, width, depth, color, accent, leaderDistrict }) {
  const rows = Math.max(6, Math.round(height / 14));
  const columns = Math.max(2, Math.round(width / 8));
  const materials = createBuildingMaterials(
    seed,
    leaderDistrict ? ["#ffe9a7", "#ffd974", "#9fd7ff"] : [color, accent, "#bad8ff"],
    rows,
    columns,
    leaderDistrict ? 0.52 : 0.36,
    accent,
    false
  );

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    materials
  );
  mesh.position.copy(position);
  mesh.position.y += height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addDistrictFillers(scene, districtCenter, options) {
  const {
    seed,
    baseHeight,
    color,
    accent,
    leaderDistrict
  } = options;

  const random = createRandom(seed);
  const offsets = [];
  const step = 56;

  for (let x = -2; x <= 2; x += 1) {
    for (let z = -2; z <= 2; z += 1) {
      if (Math.abs(x) <= 1 && Math.abs(z) <= 1) {
        continue;
      }

      offsets.push([x * step + (random() - 0.5) * 10, z * step + (random() - 0.5) * 10]);
    }
  }

  offsets.forEach(([xOffset, zOffset], index) => {
    const height = baseHeight * (0.22 + random() * (leaderDistrict ? 0.46 : 0.34));
    const width = 18 + random() * (leaderDistrict ? 18 : 12);
    const depth = 18 + random() * (leaderDistrict ? 16 : 10);
    const filler = createFillerTower({
      seed: seed + index * 17,
      position: new THREE.Vector3(districtCenter.x + xOffset, 0, districtCenter.z + zOffset),
      height,
      width,
      depth,
      color,
      accent,
      leaderDistrict
    });
    scene.add(filler);
  });
}

function createStars(scene) {
  const geometry = new THREE.BufferGeometry();
  const count = 900;
  const positions = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const radius = 900 + Math.random() * 1200;
    const theta = Math.random() * Math.PI * 2;
    const y = 260 + Math.random() * 520;

    positions[index * 3] = Math.cos(theta) * radius;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = Math.sin(theta) * radius;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x8fdcff,
    size: 3,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return points;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeOutBack(value) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function createFireworks(scene) {
  const systems = [];

  function launch(position, color) {
    const count = 120;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color(color);
    const accentColor = new THREE.Color(color).offsetHSL(0.1, 0, 0.2);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 80 + Math.random() * 180;
      velocities.push(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed * 0.8 + 60,
        Math.sin(phi) * Math.sin(theta) * speed
      );

      const c = Math.random() > 0.5 ? baseColor : accentColor;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 5,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    systems.push({ points, velocities, age: 0, maxAge: 2.2 });
  }

  function update(delta) {
    for (let i = systems.length - 1; i >= 0; i--) {
      const sys = systems[i];
      sys.age += delta;
      if (sys.age >= sys.maxAge) {
        scene.remove(sys.points);
        sys.points.geometry.dispose();
        sys.points.material.dispose();
        systems.splice(i, 1);
        continue;
      }

      const positions = sys.points.geometry.attributes.position.array;
      const gravity = -120 * delta;
      const drag = 1 - delta * 1.2;

      for (let j = 0; j < positions.length / 3; j++) {
        sys.velocities[j * 3] *= drag;
        sys.velocities[j * 3 + 1] += gravity;
        sys.velocities[j * 3 + 1] *= drag;
        sys.velocities[j * 3 + 2] *= drag;

        positions[j * 3] += sys.velocities[j * 3] * delta;
        positions[j * 3 + 1] += sys.velocities[j * 3 + 1] * delta;
        positions[j * 3 + 2] += sys.velocities[j * 3 + 2] * delta;
      }

      sys.points.geometry.attributes.position.needsUpdate = true;
      sys.points.material.opacity = 1 - (sys.age / sys.maxAge);
    }
  }

  return { launch, update };
}

function buildCity(scene, competition) {
  const competitors = [...competition.competitors].sort(byCommits);
  const maxCommits = Math.max(...competitors.map((competitor) => competitor.commits || 0), 1);
  const palette = [
    { color: "#72b8ff", accent: "#9edbff" },
    { color: "#6f8cff", accent: "#afc0ff" },
    { color: "#ff9079", accent: "#ffc1b3" },
    { color: "#b792ff", accent: "#e0ceff" },
    { color: "#59d99b", accent: "#bff5d5" }
  ];

  const baseDistricts = [
    new THREE.Vector3(0, 2, 0),
    new THREE.Vector3(-220, 2, -170),
    new THREE.Vector3(210, 2, -180),
    new THREE.Vector3(-200, 2, 190),
    new THREE.Vector3(230, 2, 200),
    new THREE.Vector3(-420, 2, -10),
    new THREE.Vector3(420, 2, 10),
    new THREE.Vector3(0, 2, -350),
    new THREE.Vector3(0, 2, 380),
    new THREE.Vector3(-400, 2, -340)
  ];

  const districts = [...baseDistricts];
  const ringSpacing = 210;
  const minDistrictSpacing = 180;
  while (districts.length < competitors.length) {
    const extraIndex = districts.length - baseDistricts.length;
    let attempt = 0;
    let candidate;

    do {
      const candidateIndex = extraIndex + attempt;
      const angle = candidateIndex * 2.399963229728653;
      const ring = Math.floor(candidateIndex / 8) + 3;
      const radius = ring * ringSpacing;
      candidate = new THREE.Vector3(
        Math.cos(angle) * radius,
        2,
        Math.sin(angle) * radius
      );
      attempt += 1;
    } while (
      attempt < 64 &&
      districts.some((district) => district.distanceTo(candidate) < minDistrictSpacing)
    );

    districts.push(candidate);
  }

  const majorTowers = [];
  const selectables = [];

  createRoad(scene, 1800, 90, new THREE.Vector3(0, 0, 0));
  createRoad(scene, 90, 1800, new THREE.Vector3(0, 0, 0));

  competitors.forEach((competitor, index) => {
    const district = districts[index].clone();
    const isLeader = index === 0;
    const colors = palette[index % palette.length];
    const commitRatio = (competitor.commits || 0) / maxCommits;
    const towerStyle = isLeader ? "leader" : pickTowerStyle(index - 1);

    createPlaza(scene, district, isLeader ? 62 : 46, isLeader ? "#ffc85a" : colors.accent);

    const tower = createMainTower(competitor, {
      position: district,
      isLeader,
      commitRatio,
      color: colors.color,
      accent: isLeader ? "#ffc85a" : colors.accent,
      towerStyle
    });

    scene.add(tower);
    majorTowers.push(tower);
    selectables.push(...(tower.userData.bodies || [tower.userData.body]));

    const towerHeight = tower.userData.focusHeight * 1.8;
    addDistrictFillers(scene, district, {
      seed: hashString(competitor.username),
      baseHeight: towerHeight,
      color: colors.color,
      accent: isLeader ? "#ffc85a" : colors.accent,
      leaderDistrict: isLeader
    });
  });

  return { majorTowers, selectables, competitors };
}

export function createCityScene(container, competition, { onSelect } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040814);
  scene.fog = new THREE.FogExp2(0x050915, 0.0006);

  const camera = new THREE.PerspectiveCamera(
    48,
    container.clientWidth / container.clientHeight,
    0.1,
    4000
  );
  camera.position.set(880, 640, 920);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.rotateSpeed = 1.75;
  controls.zoomSpeed = 1.35;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 180;
  controls.maxDistance = 2200;
  controls.target.set(0, 90, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.78,
      0.8,
      0.22
    )
  );

  const ambientLight = new THREE.AmbientLight(0x8ca8ff, 0.68);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0x6fb7ff, 0x0c1020, 0.52);
  scene.add(hemiLight);

  const moonLight = new THREE.DirectionalLight(0xd5e6ff, 1.3);
  moonLight.position.set(240, 420, 120);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.near = 0.1;
  moonLight.shadow.camera.far = 1800;
  moonLight.shadow.camera.left = -900;
  moonLight.shadow.camera.right = 900;
  moonLight.shadow.camera.top = 900;
  moonLight.shadow.camera.bottom = -900;
  scene.add(moonLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(3200, 3200),
    new THREE.MeshStandardMaterial({
      color: 0x060b18,
      roughness: 0.98,
      metalness: 0.04
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const gridHelper = new THREE.GridHelper(3200, 64, 0x17315f, 0x0f1e3f);
  gridHelper.position.y = 1;
  scene.add(gridHelper);

  const horizon = new THREE.Mesh(
    new THREE.CylinderGeometry(980, 980, 10, 64, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x0a1530,
      transparent: true,
      opacity: 0.34,
      side: THREE.BackSide
    })
  );
  horizon.position.y = 4;
  scene.add(horizon);

  createStars(scene);

  const { majorTowers, selectables, competitors } = buildCity(scene, competition);

  const fireworks = createFireworks(scene);
  const airTraffic = createAirTraffic(scene, 7);

  // Building grow animation
  const growAnims = [];
  majorTowers.forEach((tower, index) => {
    tower.scale.y = 0.001;
    tower.userData._originalY = tower.position.y;
    growAnims.push({
      tower,
      delay: index * 0.18,
      duration: 1.2,
      elapsed: 0,
      done: false
    });
  });

  const focusMarker = new THREE.Mesh(
    new THREE.RingGeometry(32, 46, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffd467,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    })
  );
  focusMarker.rotation.x = -Math.PI / 2;
  focusMarker.position.y = 2.2;
  scene.add(focusMarker);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const focusTarget = new THREE.Vector3(0, 80, 0);
  const transitionState = {
    active: false,
    progress: 1,
    duration: 0.9,
    startTarget: controls.target.clone(),
    endTarget: controls.target.clone(),
    startPosition: camera.position.clone(),
    endPosition: camera.position.clone()
  };
  const focusState = {
    tower: majorTowers[0] || null
  };

  function setFocus(login, immediate = false) {
    const tower = majorTowers.find((candidate) => candidate.userData.competitor.username === login);
    if (!tower) {
      return;
    }

    focusState.tower = tower;
    const position = tower.position.clone();
    const focusHeight = tower.userData.focusHeight || 90;
    const nextTarget = new THREE.Vector3(position.x, Math.max(42, focusHeight), position.z);
    focusTarget.copy(nextTarget);
    focusMarker.position.set(position.x, 2.2, position.z);

    const currentOffset = camera.position.clone().sub(controls.target);
    currentOffset.normalize();
    const desiredDistance = 260 + focusHeight * 0.62;
    const nextCameraPosition = nextTarget.clone().add(currentOffset.multiplyScalar(desiredDistance));
    nextCameraPosition.y = Math.max(nextCameraPosition.y, focusHeight + 110);

    if (immediate) {
      controls.target.copy(nextTarget);
      camera.position.copy(nextCameraPosition);
      transitionState.active = false;
      transitionState.progress = 1;
    } else {
      transitionState.active = true;
      transitionState.progress = 0;
      transitionState.startTarget.copy(controls.target);
      transitionState.endTarget.copy(nextTarget);
      transitionState.startPosition.copy(camera.position);
      transitionState.endPosition.copy(nextCameraPosition);
    }

    onSelect?.(tower.userData.competitor);
  }

  const rootPointLight = new THREE.PointLight(0x82d1ff, 2.4, 760, 2);
  rootPointLight.position.set(0, 320, 0);
  scene.add(rootPointLight);

  const leaderTower = majorTowers[0];
  if (leaderTower) {
    const leaderSpot = new THREE.PointLight(0xffd98c, 4.8, 1100, 2);
    leaderSpot.position.set(
      leaderTower.position.x,
      leaderTower.userData.focusHeight + 160,
      leaderTower.position.z
    );
    scene.add(leaderSpot);
  }

  function onPointerDown(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(selectables, false);
    if (!intersections.length) {
      return;
    }

    const competitor = intersections[0].object.userData.competitor;
    if (competitor) {
      setFocus(competitor.username);

      // Fireworks on leader tower click
      const clickedTower = majorTowers.find((t) => t.userData.competitor.username === competitor.username);
      if (clickedTower && competitor.username === competitors[0]?.username) {
        const top = clickedTower.userData.towerTop || 300;
        const pos = clickedTower.position.clone();
        pos.y = top + 40;
        const colors = ["#ffd56d", "#ff7bfa", "#89d7ff", "#6fdd8b", "#ff9079"];
        for (let burst = 0; burst < 3; burst++) {
          setTimeout(() => {
            const offset = pos.clone();
            offset.x += (Math.random() - 0.5) * 60;
            offset.y += Math.random() * 80;
            offset.z += (Math.random() - 0.5) * 60;
            fireworks.launch(offset, colors[Math.floor(Math.random() * colors.length)]);
          }, burst * 300);
        }
      }
    }
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);

  const clock = new THREE.Clock();
  let animationFrame = null;

  function animate() {
    animationFrame = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;

    if (transitionState.active) {
      transitionState.progress = Math.min(
        1,
        transitionState.progress + delta / transitionState.duration
      );
      const eased = easeOutCubic(transitionState.progress);
      camera.position.lerpVectors(
        transitionState.startPosition,
        transitionState.endPosition,
        eased
      );
      controls.target.lerpVectors(
        transitionState.startTarget,
        transitionState.endTarget,
        eased
      );

      if (transitionState.progress >= 1) {
        transitionState.active = false;
      }
    }

    controls.update();

    // Building grow animation
    for (const anim of growAnims) {
      if (anim.done) continue;
      anim.elapsed += delta;
      const t = Math.max(0, (anim.elapsed - anim.delay) / anim.duration);
      if (t <= 0) continue;
      const clamped = Math.min(1, t);
      anim.tower.scale.y = easeOutBack(clamped);
      if (clamped >= 1) anim.done = true;
    }

    // Fireworks
    fireworks.update(delta);

    // Air traffic
    airTraffic.update(elapsed);

    majorTowers.forEach((tower, index) => {
      const glow = tower.userData.roofGlow;
      if (glow) {
        glow.rotation.z += 0.0025 + index * 0.0002;
      }

      const beam = tower.userData.beam;
      if (beam) {
        beam.material.opacity = 0.12 + Math.sin(elapsed * 1.8) * 0.03;
      }

      const haloRing = tower.userData.haloRing;
      if (haloRing) {
        haloRing.rotation.z -= 0.0042;
      }

      const orbCluster = tower.userData.orbCluster;
      if (orbCluster) {
        orbCluster.rotation.y += 0.012;
        orbCluster.position.y = Math.sin(elapsed * 1.3) * 4;
      }

      const partyShip = tower.userData.partyShip;
      if (partyShip) {
        const orbitRadius = 44;
        partyShip.position.x = Math.cos(elapsed * 0.55) * orbitRadius;
        partyShip.position.z = Math.sin(elapsed * 0.55) * orbitRadius;
        partyShip.position.y = (tower.userData.towerTop || 200) + 118 + Math.sin(elapsed * 2.1) * 7;
        partyShip.rotation.y += 0.03;

        const { lowerRing, discoHalo, beam, lightDots } = partyShip.userData;
        if (lowerRing) {
          lowerRing.rotation.z += 0.028;
        }
        if (discoHalo) {
          discoHalo.rotation.z -= 0.022;
          discoHalo.material.opacity = 0.3 + (Math.sin(elapsed * 4.2) + 1) * 0.12;
        }
        if (beam) {
          beam.material.opacity = 0.09 + (Math.sin(elapsed * 5.4) + 1) * 0.05;
        }
        if (lightDots) {
          lightDots.rotation.y -= 0.06;
        }
      }

      const label = tower.userData.label;
      if (label) {
        label.position.y = (tower.userData.labelBaseY || 120) + Math.sin(elapsed * 1.4 + index) * 4;
      }
    });

    composer.render();
  }

  function onResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
  }

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  animate();
  if (competitors[0]) {
    setFocus(competitors[0].username, true);
  }

  return {
    focusCompetitor: setFocus,
    screenshot() {
      composer.render();
      return renderer.domElement.toDataURL("image/png");
    },
    launchFireworks(username) {
      const tower = majorTowers.find((t) => t.userData.competitor.username === username);
      if (!tower) return;
      const top = tower.userData.towerTop || 300;
      const pos = tower.position.clone();
      pos.y = top + 40;
      const colors = ["#ffd56d", "#ff7bfa", "#89d7ff", "#6fdd8b", "#ff9079"];
      for (let burst = 0; burst < 5; burst++) {
        setTimeout(() => {
          const offset = pos.clone();
          offset.x += (Math.random() - 0.5) * 80;
          offset.y += Math.random() * 100;
          offset.z += (Math.random() - 0.5) * 80;
          fireworks.launch(offset, colors[Math.floor(Math.random() * colors.length)]);
        }, burst * 250);
      }
    },
    dispose() {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      composer.dispose();
      controls.dispose();
      renderer.dispose();
      container.innerHTML = "";
    }
  };
}
