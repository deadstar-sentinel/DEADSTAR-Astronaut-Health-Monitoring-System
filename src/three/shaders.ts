import * as THREE from "three";

export function createStriatedMuscleTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext("2d");

  if (ctx && bCtx) {
    ctx.fillStyle = "#d8d0d0";
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = "#808080";
    bCtx.fillRect(0, 0, size, size);

    // Longitudinal muscle fascicles running along V (top-to-bottom in texture space)
    for (let x = 0; x < size; x += 2) {
      const bundle = Math.sin((x / size) * Math.PI * 16) * 0.5 + 0.5;
      const fiber = Math.sin((x / size) * Math.PI * 74) * 0.5 + 0.5;
      const groove = Math.pow(bundle, 0.75);
      const lum = Math.round(145 + groove * 72 + fiber * 36);
      ctx.fillStyle = `rgb(${lum},${Math.round(lum * 0.94)},${Math.round(lum * 0.94)})`;
      ctx.fillRect(x, 0, 2, size);

      const bv = Math.round(75 + groove * 100 + fiber * 60);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x, 0, 2, size);
    }

    // Subtle transverse sarcomere micro-banding
    for (let y = 0; y < size; y += 6) {
      ctx.fillStyle = y % 12 === 0 ? "rgba(255, 245, 245, 0.08)" : "rgba(40, 20, 24, 0.09)";
      ctx.fillRect(0, y, size, 2);
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 1);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 1);

  return { map, bumpMap };
}

export function createLabBackdropTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(256, 240, 12, 256, 256, 360);
    grad.addColorStop(0, "#0c2747");
    grad.addColorStop(0.42, "#061426");
    grad.addColorStop(0.78, "#030b17");
    grad.addColorStop(1, "#02050c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHologramShellMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPrimary: { value: new THREE.Color("#00E5FF") },
      uSecondary: { value: new THREE.Color("#8A5CFF") },
      uOpacity: { value: 0.48 },
      uIntensity: { value: 1.0 },
      uScanEnabled: { value: 1.0 },
      uFlickerEnabled: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        vec4 mvPos = viewMatrix * worldPos;
        vViewPos = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uPrimary;
      uniform vec3 uSecondary;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uScanEnabled;
      uniform float uFlickerEnabled;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;

      void main() {
        float ndotv = abs(dot(normalize(vNormalView), normalize(vViewPos)));
        float fresnel = pow(1.0 - clamp(ndotv, 0.0, 1.0), 2.3);

        float scanBand = 0.0;
        float fineLines = 0.0;
        if (uScanEnabled > 0.5) {
          float sweepY = mod(uTime * 0.42, 2.2) - 1.05;
          scanBand = exp(-pow((vWorldPos.y - sweepY) * 18.0, 2.0)) * 0.85;
          float lineArg = vWorldPos.y * 190.0 - uTime * 2.6;
          float lineAA = 1.0 - smoothstep(0.6, 1.6, fwidth(lineArg)); // no sub-pixel shimmer
          fineLines = smoothstep(0.86, 1.0, sin(lineArg)) * 0.16 * lineAA;
        }

        float flicker = mix(1.0, 0.985 + 0.015 * sin(uTime * 1.2), uFlickerEnabled);
        float violetMix = smoothstep(0.35, 0.95, fresnel) * (0.42 + 0.2 * sin(vWorldPos.y * 3.0 + uTime));
        vec3 baseCol = mix(uPrimary, uSecondary, violetMix * 0.45);
        vec3 col = baseCol * (fresnel * 1.45 + scanBand + fineLines + 0.07) * uIntensity * flicker;
        float alpha = clamp((fresnel * 0.88 + scanBand * 0.6 + fineLines + 0.05) * uOpacity * flicker, 0.0, 0.95);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createOrganHoloMaterial(
  primaryHex: string,
  accentHex = "#8A5CFF",
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(primaryHex) },
      uAccent: { value: new THREE.Color(accentHex) },
      uOpacity: { value: 0.88 },
      uIntensity: { value: 1.0 },
      uHighlight: { value: 0.0 },
      uDimmed: { value: 0.0 },
      uScanEnabled: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        vec4 mvPos = viewMatrix * worldPos;
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uAccent;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uHighlight;
      uniform float uDimmed;
      uniform float uScanEnabled;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      void main() {
        float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
        float rim = pow(1.0 - clamp(ndotv, 0.0, 1.0), 1.85);
        float core = 0.24 + 0.22 * ndotv;

        float sweep = 0.0;
        if (uScanEnabled > 0.5) {
          float sweepY = mod(uTime * 0.42, 2.2) - 1.05;
          sweep = exp(-pow((vWorldPos.y - sweepY) * 20.0, 2.0)) * 0.45;
        }

        float pulse = 1.0 + uHighlight * (0.28 + 0.16 * sin(uTime * 4.2));
        float dimFactor = mix(1.0, 0.2, uDimmed);
        vec3 col = mix(uColor, uAccent, rim * 0.35 + uHighlight * 0.2) * (rim * 1.15 + core + sweep) * uIntensity * pulse * dimFactor;
        float alpha = clamp((rim * 0.85 + core * 0.55 + sweep * 0.4) * uOpacity * dimFactor, 0.04, 0.96);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createThermalMaterial(baseHeat: number, isShell = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBaseHeat: { value: baseHeat },
      uIntensity: { value: 1.0 },
      uOpacity: { value: isShell ? 0.56 : 0.94 },
      uHighlight: { value: 0.0 },
      uDimmed: { value: 0.0 },
      uIsShell: { value: isShell ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        vec4 mvPos = viewMatrix * worldPos;
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBaseHeat;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform float uHighlight;
      uniform float uDimmed;
      uniform float uIsShell;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      vec3 thermalRamp(float t) {
        vec3 c0 = vec3(0.024, 0.078, 0.149); // #061426 Deep Navy
        vec3 c1 = vec3(0.000, 0.549, 1.000); // #008CFF Neon Blue
        vec3 c2 = vec3(0.000, 0.898, 1.000); // #00E5FF Electric Cyan
        vec3 c3 = vec3(0.541, 0.361, 1.000); // #8A5CFF Violet
        vec3 c4 = vec3(1.000, 0.239, 0.678); // #FF3DAD Magenta
        vec3 c5 = vec3(1.000, 0.192, 0.345); // #FF3158 Thermal Red
        vec3 c6 = vec3(1.000, 0.549, 0.259); // #FF8C42 Thermal Orange
        vec3 c7 = vec3(1.000, 0.831, 0.361); // #FFD45C Thermal Yellow

        vec3 col = mix(c0, c1, smoothstep(0.00, 0.18, t));
        col = mix(col, c2, smoothstep(0.18, 0.36, t));
        col = mix(col, c3, smoothstep(0.36, 0.54, t));
        col = mix(col, c4, smoothstep(0.54, 0.72, t));
        col = mix(col, c5, smoothstep(0.72, 0.86, t));
        col = mix(col, c6, smoothstep(0.86, 0.94, t));
        col = mix(col, c7, smoothstep(0.94, 1.00, t));
        return col;
      }

      void main() {
        float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
        float rim = pow(1.0 - clamp(ndotv, 0.0, 1.0), 2.1);

        // Smooth anatomical thermal layering without high-frequency stripe artifacts
        float distFromCenter = length(vec2(vWorldPos.x * 1.35, (vWorldPos.y - 0.30) * 0.78));
        float anatomicalGradient = clamp(1.0 - distFromCenter * 0.78, 0.0, 1.0);
        float chestHeadBoost = exp(-pow((vWorldPos.y - 0.38) * 3.0, 2.0)) * 0.24
                             + exp(-pow((vWorldPos.y - 0.76) * 5.0, 2.0)) * 0.20;
        float animatedWave = 0.035 * sin(vWorldPos.y * 4.5 - uTime * 1.5)
                           + 0.025 * cos(vWorldPos.z * 5.0 + uTime * 1.1);

        // Curvature weighting keeps organ cores hotter and edges cooler so 3D depth stays crisp
        float coreFalloff = mix(0.74, 1.04, pow(ndotv, 0.65));
        float baseMix = mix(uBaseHeat * 0.86, anatomicalGradient * 0.64 + chestHeadBoost, uIsShell);
        float heat = clamp((baseMix * coreFalloff + animatedWave + uHighlight * 0.06) * (0.52 + uIntensity * 0.44), 0.0, 1.0);

        vec3 rampColor = thermalRamp(heat);
        vec3 outlineColor = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.48, 0.22), heat);
        float dimFactor = mix(1.0, 0.22, uDimmed);
        float pulse = 1.0 + uHighlight * (0.10 + 0.07 * sin(uTime * 3.8));

        vec3 finalCol = (rampColor * (0.72 + 0.36 * ndotv) + outlineColor * rim * 0.75) * pulse * dimFactor;
        float alpha = clamp((mix(0.92, 0.40 + rim * 0.48, uIsShell)) * uOpacity * dimFactor, 0.06, 0.98);
        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
    transparent: true,
    depthWrite: !isShell,
    side: THREE.DoubleSide,
  });
}

export function createPathwayPulseMaterial(
  baseHex: string,
  pulseHex: string,
  speed = 1.4,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBase: { value: new THREE.Color(baseHex) },
      uPulse: { value: new THREE.Color(pulseHex) },
      uSpeed: { value: speed },
      uOpacity: { value: 0.9 },
      uIntensity: { value: 1.0 },
      uHighlight: { value: 0.0 },
      uDimmed: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormalView = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uBase;
      uniform vec3 uPulse;
      uniform float uSpeed;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uHighlight;
      uniform float uDimmed;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;

      void main() {
        float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
        float rim = pow(1.0 - clamp(ndotv, 0.0, 1.0), 1.6);
        float flow = fract(vUv.x * 2.5 - uTime * uSpeed);
        float packet = exp(-pow((flow - 0.5) * 7.5, 2.0));
        float dimFactor = mix(1.0, 0.18, uDimmed);
        float boost = 1.0 + uHighlight * 0.45;
        vec3 col = mix(uBase, uPulse, packet * 0.85 + rim * 0.35) * (0.65 + packet * 1.45 + rim * 0.6) * uIntensity * boost * dimFactor;
        float alpha = clamp((0.45 + packet * 0.55 + rim * 0.3) * uOpacity * dimFactor, 0.05, 0.98);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
