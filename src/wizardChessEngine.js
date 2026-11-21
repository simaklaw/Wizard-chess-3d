import * as THREE_NS from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { wizardChessAudio } from './wizardChessAudio.ts';
import { getTranslations, getLanguage, setLanguage as setI18nLanguage, subscribeLanguage } from './i18n.ts';
import { insufficientMaterial as coreInsufficientMaterial, positionKey as corePositionKey, legalMoves as coreLegalMoves, moveToSan as coreMoveToSan, squareName as coreSquareName } from './chess/rules.js';
import { searchBestMove as coreSearchBestMove } from './chess/aiSearch.js';
import { emitEngineEvent } from './engineBus.ts';
import { parseNotationToMoves } from './chess/notation.js';
import { TIME_CONTROLS, DEFAULT_TIME_CONTROL, formatClockTime } from './chess/timeControls.js';

/** @type {any} */
const THREE = THREE_NS;
const SkeletonUtils = { clone: cloneSkeleton };

export function initWizardChess() {
    // =========================================================================
    // Constants & Board Coordinates
    // =========================================================================
    const PIECE_TYPES = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
    const BOARD_SQ_SIZE = 0.34;
    const BOARD_SURFACE_Y = 0.775;

    function boardToWorld(r, c) {
      return new THREE.Vector3(
        (c - 3.5) * BOARD_SQ_SIZE,
        BOARD_SURFACE_Y,
        (r - 3.5) * BOARD_SQ_SIZE
      );
    }

    function easeInOutCubic(x) {
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    function easeOutCubic(x) {
      return 1 - Math.pow(1 - x, 3);
    }

    // =========================================================================
    // Scene, Camera, Renderer, and Cathedral Lighting
    // =========================================================================
    const container = document.getElementById('canvas-container') || document.getElementById('viewport-container');
    if (container) container.innerHTML = '';
    const isAutomatedTest = Boolean(
      navigator.webdriver || new URLSearchParams(window.location.search).get('autotest') === '1'
    );
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: isAutomatedTest
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a12);
    scene.fog = new THREE.FogExp2(0x080b14, 0.015);

    // Self-contained Cathedral PMREM Environment (inspired by three-gpu-pathtracer & realism-effects)
    function createCathedralPMREMEnvironment(glRenderer) {
      const pmremGen = new THREE.PMREMGenerator(glRenderer);
      pmremGen.compileEquirectangularShader();
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x161412);
      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      const addPanel = (colorHex, intensity, pos, scl) => {
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(colorHex).multiplyScalar(intensity)
        });
        const m = new THREE.Mesh(boxGeo, mat);
        m.position.fromArray(pos);
        m.scale.fromArray(scl);
        envScene.add(m);
      };
      // Upper Gothic clerestory & Rose Window light panels
      addPanel(0xdce6f7, 2.4, [0, 9.5, -12.0], [10.0, 2.0, 1.5]);
      addPanel(0xffe0b5, 2.2, [0, 9.5, 12.0], [10.0, 2.0, 1.5]);
      addPanel(0xd4deee, 1.8, [-9.0, 6.5, 0.0], [1.2, 4.5, 16.0]);
      addPanel(0xd4deee, 1.8, [9.0, 6.5, 0.0], [1.2, 4.5, 16.0]);
      // Warm twin fire cauldron & limestone floor bounce panels
      addPanel(0xff9438, 3.2, [-4.5, 1.6, 0.0], [2.2, 2.2, 4.0]);
      addPanel(0xff9438, 3.2, [4.5, 1.6, 0.0], [2.2, 2.2, 4.0]);
      addPanel(0x6e5c49, 0.9, [0, -4.0, 0.0], [16.0, 1.0, 24.0]);
      const envTex = pmremGen.fromScene(envScene, 0.04).texture;
      boxGeo.dispose();
      pmremGen.dispose();
      return envTex;
    }

    scene.environment = createCathedralPMREMEnvironment(renderer);
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = 0.24;
    }

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.22, 65);
    camera.position.set(0, 2.22, 2.72);

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.16;
    orbitControls.maxPolarAngle = Math.PI * 0.88;
    orbitControls.minPolarAngle = 0.05;
    orbitControls.minDistance = 0.95;
    orbitControls.maxDistance = 36.0;
    orbitControls.target.set(0, 0.85, -0.15);
    orbitControls.update();

    // =========================================================================
    // Feature 5: Hold Shift + Mouse Drag (Left=Rotate, Right=Pan) Axis Lock (X or Y)
    // =========================================================================
    let isShiftKeyDown = false;
    const shiftDragState = {
      active: false,
      startX: 0,
      startY: 0,
      lockedAxis: null // 'x' | 'y' | null
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') isShiftKeyDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        isShiftKeyDown = false;
        shiftDragState.lockedAxis = null;
      }
    });

    // Capture pointerdown BEFORE OrbitControls so Shift+LeftClick stays ROTATE (instead of OrbitControls' default Shift->PAN swap)
    renderer.domElement.addEventListener(
      'pointerdown',
      (e) => {
        shiftDragState.active = true;
        shiftDragState.startX = e.clientX;
        shiftDragState.startY = e.clientY;
        shiftDragState.lockedAxis = null;
        if (e.shiftKey) {
          isShiftKeyDown = true;
          if (e.button === 0) {
            try {
              Object.defineProperty(e, 'shiftKey', {
                get: () => false,
                configurable: true
              });
            } catch (err) {}
          }
        }
      },
      { capture: true }
    );

    window.addEventListener('pointerup', () => {
      shiftDragState.active = false;
      shiftDragState.lockedAxis = null;
    });

    const origHandleMouseMoveRotate = orbitControls._handleMouseMoveRotate.bind(orbitControls);
    orbitControls._handleMouseMoveRotate = function (event) {
      if (event.shiftKey || isShiftKeyDown) {
        const dx = Math.abs(event.clientX - shiftDragState.startX);
        const dy = Math.abs(event.clientY - shiftDragState.startY);
        if (!shiftDragState.lockedAxis && (dx > 2 || dy > 2)) {
          shiftDragState.lockedAxis = dx >= dy ? 'x' : 'y';
        }
        if (shiftDragState.lockedAxis === 'x') {
          return origHandleMouseMoveRotate({
            clientX: event.clientX,
            clientY: this._rotateStart.y
          });
        } else if (shiftDragState.lockedAxis === 'y') {
          return origHandleMouseMoveRotate({
            clientX: this._rotateStart.x,
            clientY: event.clientY
          });
        }
      } else {
        shiftDragState.lockedAxis = null;
      }
      return origHandleMouseMoveRotate(event);
    };

    const origHandleMouseMovePan = orbitControls._handleMouseMovePan.bind(orbitControls);
    orbitControls._handleMouseMovePan = function (event) {
      if (event.shiftKey || isShiftKeyDown) {
        const dx = Math.abs(event.clientX - shiftDragState.startX);
        const dy = Math.abs(event.clientY - shiftDragState.startY);
        if (!shiftDragState.lockedAxis && (dx > 2 || dy > 2)) {
          shiftDragState.lockedAxis = dx >= dy ? 'x' : 'y';
        }
        if (shiftDragState.lockedAxis === 'x') {
          return origHandleMouseMovePan({
            clientX: event.clientX,
            clientY: this._panStart.y
          });
        } else if (shiftDragState.lockedAxis === 'y') {
          return origHandleMouseMovePan({
            clientX: this._panStart.x,
            clientY: event.clientY
          });
        }
      } else {
        shiftDragState.lockedAxis = null;
      }
      return origHandleMouseMovePan(event);
    };

    // Dramatic Chiaroscuro Cathedral & Board Lighting (restoring original-example 3D stone relief & warm firelight contrast)
    const hemiLight = new THREE.HemisphereLight(0xd8ccb8, 0x261d14, 0.62);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff0d6, 2.55);
    keyLight.position.set(3.8, 8.5, 4.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 22.0;
    const d = 3.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    // Subtle directional rim/fill (kept low so opposing directional lights never cancel normal-map mortar shadows)
    const rimLight = new THREE.DirectionalLight(0xd8cbb8, 0.72);
    rimLight.position.set(-4.5, 6.0, -6.5);
    scene.add(rimLight);

    const southFillLight = new THREE.DirectionalLight(0xffe4c0, 0.52);
    southFillLight.position.set(4.2, 5.8, 7.5);
    scene.add(southFillLight);

    // Twin Flickering Brazier Point Lights (centered at x = +/-3.65, z = 0.00; flanking column bounce is evaluated in shader)
    const brazierCoords = [
      { pos: [-3.65, 1.08, 0.00], baseIntensity: 4.35, dist: 18.0 },
      { pos: [3.65, 1.08, 0.00], baseIntensity: 4.35, dist: 18.0 }
    ];
    const brazierLights = [];
    for (const cfg of brazierCoords) {
      const pLight = new THREE.PointLight(0xff8e32, cfg.baseIntensity, cfg.dist, 1.40);
      pLight.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      pLight.userData.baseIntensity = cfg.baseIntensity;
      scene.add(pLight);
      brazierLights.push(pLight);
    }

    // Realistic Gaseous GLSL Brazier Flames & Soft Warm Firelight Glow (zero bouncing shapes)
    const brazierFireUniforms = [];
    const brazierGlowSprites = [];

    function createSoftGlowTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(128, 128, 2, 128, 128, 128);
      grad.addColorStop(0.0, 'rgba(255, 226, 155, 0.88)');
      grad.addColorStop(0.18, 'rgba(255, 154, 52, 0.50)');
      grad.addColorStop(0.45, 'rgba(255, 92, 16, 0.18)');
      grad.addColorStop(0.75, 'rgba(210, 48, 4, 0.04)');
      grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    // Strip the 14 tiny static icosphere spark balls baked above Opt8_Brazier_Flame_Mid (y > 1.26, height < 0.10)
    // while preserving 100% of the sculpted flame tongues (which start at y = 0.59..0.61)
    function stripIcosphereSparksFromFlameGeometry(geometry) {
      if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
      const pos = geometry.attributes.position;
      if (geometry.index) {
        const idx = geometry.index.array;
        for (let i = 0; i < idx.length; i += 3) {
          const i0 = idx[i];
          const i1 = idx[i + 1];
          const i2 = idx[i + 2];
          const y0 = pos.getY(i0);
          const y1 = pos.getY(i1);
          const y2 = pos.getY(i2);
          const minY = Math.min(y0, y1, y2);
          if (minY > 1.25) {
            idx[i] = 0;
            idx[i + 1] = 0;
            idx[i + 2] = 0;
          }
        }
        geometry.index.needsUpdate = true;
      } else {
        for (let i = 0; i < pos.count; i += 3) {
          const y0 = pos.getY(i);
          const y1 = pos.getY(i + 1);
          const y2 = pos.getY(i + 2);
          if (Math.min(y0, y1, y2) > 1.25) {
            pos.setXYZ(i, 0, 0, 0);
            pos.setXYZ(i + 1, 0, 0, 0);
            pos.setXYZ(i + 2, 0, 0, 0);
          }
        }
        pos.needsUpdate = true;
      }
    }

    // =========================================================================
    // Cathedral Room Boundary Clamping (Floor, Ceiling, Side & End Walls)
    // & Solid Cylindrical Column Collision / Circumferential Sliding Solver
    // =========================================================================
    const CATHEDRAL_BOUNDS = {
      minX: -6.65,
      maxX: 6.65,
      minY: 0.34,
      maxY: 8.85,
      minZ: -18.10,
      maxZ: 18.10
    };

    // 12 freestanding columns spread wider across the nave; the 4 columns closest to the chessboard (z = +/-2.20)
    // have been removed to create a grand 13.70m open Atrium around the altar and centered fire braziers
    const CATHEDRAL_COLUMN_ROWS = [
      { z: -16.65, xAbs: 4.25 },
      { z: -11.85, xAbs: 4.25 },
      { z: -6.85,  xAbs: 4.65 },
      { z: 6.85,   xAbs: 4.65 },
      { z: 11.85,  xAbs: 4.25 },
      { z: 16.65,  xAbs: 4.25 }
    ];
    const CATHEDRAL_SOLID_PILLARS = [
      ...CATHEDRAL_COLUMN_ROWS.flatMap(({ z, xAbs }) => [
        { x: -xAbs, z, r: 0.86, maxY: 9.65, isColumn: true },
        { x: xAbs,  z, r: 0.86, maxY: 9.65, isColumn: true }
      ]),
      { x: -3.65, z: 0.00, r: 0.68, maxY: 1.95, isColumn: false },
      { x: 3.65,  z: 0.00, r: 0.68, maxY: 1.95, isColumn: false }
    ];

    function clampPointToCathedralRoom(pt, isTarget = false) {
      const margin = isTarget ? 0.15 : 0.0;
      pt.x = Math.max(CATHEDRAL_BOUNDS.minX - margin, Math.min(CATHEDRAL_BOUNDS.maxX + margin, pt.x));
      pt.z = Math.max(CATHEDRAL_BOUNDS.minZ - margin, Math.min(CATHEDRAL_BOUNDS.maxZ + margin, pt.z));
      // Account for the sloped side-aisle ceiling vault outside x = +/-4.15
      const aisleDrop = Math.max(0, Math.abs(pt.x) - 4.15) * 0.55;
      const localMaxY = Math.min(CATHEDRAL_BOUNDS.maxY, 9.05 - aisleDrop);
      const localMinY = isTarget ? 0.20 : CATHEDRAL_BOUNDS.minY;
      pt.y = Math.max(localMinY, Math.min(localMaxY, pt.y));
    }

    function enforceCathedralBoundsAndSolidColumns(prevPos, curPos, targetPos) {
      clampPointToCathedralRoom(targetPos, true);
      clampPointToCathedralRoom(curPos, false);

      if (isAnimatingMove) {
        if (Math.abs(curPos.x) < 2.48 && Math.abs(curPos.z) < 2.38) {
          curPos.y = Math.max(curPos.y, BOARD_SURFACE_Y + 0.30);
        }
        return;
      }

      const x0 = prevPos ? prevPos.x : curPos.x;
      const z0 = prevPos ? prevPos.z : curPos.z;
      let x1 = curPos.x;
      let z1 = curPos.z;
      const moveDx = x1 - x0;
      const moveDz = z1 - z0;
      const moveLenSq = moveDx * moveDx + moveDz * moveDz;
      const moveLen = Math.sqrt(moveLenSq);
      const isContinuousStep = Boolean(prevPos) && moveLen > 1e-5 && moveLen < 8.0;

      for (const p of CATHEDRAL_SOLID_PILLARS) {
        if (curPos.y > p.maxY) continue;

        let tClosest = 1.0;
        if (isContinuousStep) {
          tClosest = ((p.x - x0) * moveDx + (p.z - z0) * moveDz) / moveLenSq;
          tClosest = Math.max(0.0, Math.min(1.0, tClosest));
        }
        const cxSeg = x0 + moveDx * tClosest;
        const czSeg = z0 + moveDz * tClosest;
        const dSeg = isContinuousStep ? Math.hypot(cxSeg - p.x, czSeg - p.z) : Infinity;
        const dEnd = Math.hypot(x1 - p.x, z1 - p.z);

        if (dSeg < p.r || dEnd < p.r) {
          if (typeof window.__wizardChessTelemetry === 'object' && window.__wizardChessTelemetry && p.isColumn) {
            window.__wizardChessTelemetry.columnDeflections = (window.__wizardChessTelemetry.columnDeflections || 0) + 1;
          }

          if (isContinuousStep) {
            // Smooth tangential circumferential slide around the column
            const startAng = Math.atan2(z0 - p.z, x0 - p.x);
            const endAng = Math.atan2(z1 - p.z, x1 - p.x);
            let deltaAng = endAng - startAng;
            while (deltaAng > Math.PI) deltaAng -= Math.PI * 2;
            while (deltaAng < -Math.PI) deltaAng += Math.PI * 2;

            // Project step onto unit tangent at startAng; if pushing dead-on into column center, bias toward center aisle
            const tanX = -Math.sin(startAng);
            const tanZ = Math.cos(startAng);
            let tangMove = moveDx * tanX + moveDz * tanZ;
            if (Math.abs(tangMove) < moveLen * 0.18) {
              const aisleSign = (p.x >= 0 ? -1 : 1) * Math.sign(moveDz || 1);
              tangMove = (tangMove >= 0 ? 1 : aisleSign || 1) * moveLen * 0.65;
            }
            const arcStep = Math.sign(deltaAng || tangMove || 1) * Math.max(Math.abs(deltaAng), Math.min(Math.PI * 0.35, Math.abs(tangMove) / p.r));
            const newAng = startAng + arcStep;
            x1 = p.x + Math.cos(newAng) * p.r;
            z1 = p.z + Math.sin(newAng) * p.r;
          } else {
            const radX = x1 - p.x;
            const radZ = z1 - p.z;
            const radLen = Math.hypot(radX, radZ);
            if (radLen > 1e-4) {
              x1 = p.x + (radX / radLen) * p.r;
              z1 = p.z + (radZ / radLen) * p.r;
            } else {
              x1 = p.x + (p.x >= 0 ? -p.r : p.r);
              z1 = p.z;
            }
          }
        }
      }

      // Solid Black Marble Altar (4.40m x 4.20m slab + pedestal) & Chessboard collision
      // Prevents the camera from passing down through either the chessboard OR the surrounding black marble altar rim
      const ALTAR_TOP_Y = 0.722;
      const ALTAR_HALF_X = 2.48; // 2.22m black marble slab half-width + 0.26m camera frustum near-clip margin
      const ALTAR_HALF_Z = 2.38; // 2.12m black marble slab half-depth + 0.26m camera frustum near-clip margin
      const BOARD_HALF_XZ = 1.66;
      if (Math.abs(targetPos.x) < 2.36 && Math.abs(targetPos.z) < 2.26) {
        const minTargetY =
          Math.abs(targetPos.x) < 1.56 && Math.abs(targetPos.z) < 1.56
            ? BOARD_SURFACE_Y + 0.05
            : ALTAR_TOP_Y + 0.05;
        if (targetPos.y < minTargetY) {
          targetPos.y = minTargetY;
        }
      }
      if (Math.abs(x1) < ALTAR_HALF_X && Math.abs(z1) < ALTAR_HALF_Z) {
        const isOverChessboard = Math.abs(x1) < BOARD_HALF_XZ && Math.abs(z1) < BOARD_HALF_XZ;
        const solidAltarTopY = isOverChessboard ? (BOARD_SURFACE_Y + 0.25) : (ALTAR_TOP_Y + 0.28); // 1.035m on board, 1.002m on black marble altar
        if (curPos.y < solidAltarTopY) {
          const wasInsideAltarFootprint =
            Boolean(prevPos) &&
            Math.abs(x0) < ALTAR_HALF_X - 0.005 &&
            Math.abs(z0) < ALTAR_HALF_Z - 0.005;
          const wasAboveAltarSlab =
            wasInsideAltarFootprint ||
            (Boolean(prevPos) && prevPos.y >= ALTAR_TOP_Y - 0.04) ||
            curPos.y >= ALTAR_TOP_Y - 0.10;
          if (wasAboveAltarSlab) {
            curPos.y = Math.max(curPos.y, solidAltarTopY);
          } else {
            const penX = ALTAR_HALF_X - Math.abs(x1);
            const penZ = ALTAR_HALF_Z - Math.abs(z1);
            if (penX < penZ) {
              x1 = (x1 >= 0 ? 1 : -1) * ALTAR_HALF_X;
            } else {
              z1 = (z1 >= 0 ? 1 : -1) * ALTAR_HALF_Z;
            }
          }
        }
      }

      // Solid Marble & Obsidian Chess Pieces collision during manual camera movement
      // (Bypassed when isAnimatingMove is true so automated duel/attack camera choreography never gets pinned between statues)
      if (
        !isAnimatingMove &&
        curPos.y < BOARD_SURFACE_Y + 0.85 &&
        typeof boardState === 'object' &&
        Array.isArray(boardState)
      ) {
        const pieceRad = 0.185;
        for (let r = 0; r < 8; r++) {
          const row = boardState[r];
          if (!row) continue;
          for (let c = 0; c < 8; c++) {
            const pc = row[c];
            if (!pc || !pc.mesh || !pc.mesh.parent) continue;
            const px = pc.mesh.position.x;
            const pz = pc.mesh.position.z;
            const pieceH = (typeof PIECE_HEIGHTS === 'object' && PIECE_HEIGHTS[pc.type]) ? PIECE_HEIGHTS[pc.type] : 0.42;
            const pieceTopY = pc.mesh.position.y + pieceH + 0.10;
            if (curPos.y >= pieceTopY) continue;

            let tPiece = 1.0;
            if (isContinuousStep) {
              tPiece = ((px - x0) * moveDx + (pz - z0) * moveDz) / moveLenSq;
              tPiece = Math.max(0.0, Math.min(1.0, tPiece));
            }
            const cxP = x0 + moveDx * tPiece;
            const czP = z0 + moveDz * tPiece;
            const dSegP = isContinuousStep ? Math.hypot(cxP - px, czP - pz) : Infinity;
            const dEndP = Math.hypot(x1 - px, z1 - pz);

            if (dSegP < pieceRad || dEndP < pieceRad) {
              if (
                prevPos &&
                prevPos.y >= pieceTopY - 0.08 &&
                Math.hypot(x0 - px, z0 - pz) < pieceRad * 0.85
              ) {
                curPos.y = Math.max(curPos.y, pieceTopY);
              } else {
                const radX = x1 - px;
                const radZ = z1 - pz;
                const radLen = Math.hypot(radX, radZ);
                if (radLen > 1e-4) {
                  x1 = px + (radX / radLen) * pieceRad;
                  z1 = pz + (radZ / radLen) * pieceRad;
                } else {
                  x1 = px + pieceRad;
                }
              }
            }
          }
        }
      }

      curPos.x = x1;
      curPos.z = z1;
      clampPointToCathedralRoom(curPos, false);

      // Update minimum column clearance telemetry across all 12 freestanding columns
      if (typeof window.__wizardChessTelemetry === 'object' && window.__wizardChessTelemetry) {
        let minClear = Infinity;
        for (const p of CATHEDRAL_SOLID_PILLARS) {
          if (!p.isColumn) continue;
          const d = Math.hypot(curPos.x - p.x, curPos.z - p.z);
          if (d < minClear) minClear = d;
        }
        window.__wizardChessTelemetry.lastColumnClearance = Number(minClear.toFixed(3));
        if (
          window.__wizardChessTelemetry.minColumnClearance === undefined ||
          minClear < window.__wizardChessTelemetry.minColumnClearance
        ) {
          window.__wizardChessTelemetry.minColumnClearance = Number(minClear.toFixed(3));
        }
      }
    }

    function createSculptedFlameTongueShader(cfg) {
      const uniforms = {
        uTime: { value: 0 },
        uZMin: { value: cfg.zMin },
        uZMax: { value: cfg.zMax },
        uLayerSeed: { value: cfg.layerSeed },
        uStrength: { value: cfg.strength },
        uOpacity: { value: cfg.opacity },
        uBaseColor: { value: new THREE.Color(...cfg.baseColor) },
        uMidColor: { value: new THREE.Color(...cfg.midColor) },
        uTipColor: { value: new THREE.Color(...cfg.tipColor) }
      };
      brazierFireUniforms.push(uniforms);

      return new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          uniform float uTime;
          uniform float uZMin;
          uniform float uZMax;
          uniform float uLayerSeed;
          varying vec3 vLocalPos;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying float vHeightNorm;

          void main() {
            vec3 pos = position;
            float h = clamp((pos.y - uZMin) / max(0.01, uZMax - uZMin), 0.0, 1.0);
            vHeightNorm = h;

            // Each brazier is centered at X = +/- 3.65, Z = 0.65 in local mesh space (world Z = 0.00)
            vec2 bCenter = vec2(sign(pos.x) * 3.65, 0.65);
            vec2 relXZ = vec2(pos.x, pos.z) - bCenter;

            // Distinct phase per sculpted tongue & fire layer so all 27 tongues dance independently
            float tonguePhase = relXZ.x * 14.0 + relXZ.y * 12.0 + uLayerSeed * 1.9;
            float sway = pow(h, 1.05);

            // Multi-frequency upward-propagating lateral flame wave (pinned at h = 0 in the logs)
            float waveX = sin(pos.y * 4.6 - uTime * 6.4 + tonguePhase) * 0.088
                        + cos(pos.y * 8.2 - uTime * 9.8 + tonguePhase * 1.35) * 0.048;
            float waveZ = cos(pos.y * 4.3 - uTime * 5.9 + tonguePhase * 1.15) * 0.088
                        + sin(pos.y * 7.8 - uTime * 9.1 + tonguePhase * 0.85) * 0.048;

            // Swirling thermal vortex twist + radial breathing around each brazier bowl
            float twistAngle = sin(uTime * 4.2 + pos.y * 4.5 + uLayerSeed) * 0.30 * sway;
            float cA = cos(twistAngle);
            float sA = sin(twistAngle);
            vec2 twistedXZ = vec2(relXZ.x * cA - relXZ.y * sA, relXZ.x * sA + relXZ.y * cA);
            float radialPulse = 1.0 + sin(uTime * 5.2 - h * 4.0 + tonguePhase) * 0.14 * sway;

            pos.x = bCenter.x + twistedXZ.x * radialPulse + waveX * sway;
            pos.z = bCenter.y + twistedXZ.y * radialPulse + waveZ * sway;

            // Active vertical flame-tongue licking (base h = 0 stays strictly anchored at uZMin)
            float lickStretch = 1.0 + (
              sin(uTime * 5.8 + tonguePhase * 1.3) * 0.22 +
              cos(uTime * 9.2 - tonguePhase * 0.9) * 0.12
            ) * smoothstep(0.05, 0.85, h);
            pos.y = uZMin + (pos.y - uZMin) * lickStretch;

            vLocalPos = pos;
            vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
            vWorldPos = worldPosition.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uZMin;
          uniform float uZMax;
          uniform float uLayerSeed;
          uniform float uStrength;
          uniform float uOpacity;
          uniform vec3 uBaseColor;
          uniform vec3 uMidColor;
          uniform vec3 uTipColor;
          varying vec3 vLocalPos;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying float vHeightNorm;

          float hash3(vec3 p) {
            p = fract(p * vec3(443.897, 441.423, 437.195));
            p += dot(p, p.yzx + 19.19);
            return fract((p.x + p.y) * p.z);
          }

          float noise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(
                mix(hash3(i + vec3(0.0, 0.0, 0.0)), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x),
                f.y
              ),
              mix(
                mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x),
                f.y
              ),
              f.z
            );
          }

          void main() {
            float h = clamp(vHeightNorm, 0.0, 1.0);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 N = normalize(vWorldNormal);

            // Real-time port of Cycles LayerWeight.Facing^2.4 gaseous feathering
            float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
            float powFacing = pow(facing, 2.25);

            // Fast upward-convecting 3D flame turbulence that actively carves the flame tips
            float n1 = noise3(vec3(vLocalPos.x * 5.4, vLocalPos.y * 4.8 - uTime * 6.8, vLocalPos.z * 5.4 + uLayerSeed));
            float n2 = noise3(vec3(vLocalPos.x * 10.2 + 1.9, vLocalPos.y * 8.5 - uTime * 10.5, vLocalPos.z * 10.2 - uLayerSeed));
            float shimmer = mix(n1, n2, 0.45);

            // Dynamic tip erosion so flame tongues visibly lick up and recede
            float erodedH = clamp(h + (shimmer - 0.48) * 0.42 * smoothstep(0.08, 0.85, h), 0.0, 1.0);

            // Combine eroded height and (1.0 - facing) so grazing edges shift toward fiery orange-crimson
            float heatCoord = clamp(erodedH + (1.0 - facing) * 0.36 + (shimmer - 0.5) * 0.22, 0.0, 1.0);
            vec3 col = mix(uBaseColor, uMidColor, smoothstep(0.0, 0.45, heatCoord));
            col = mix(col, uTipColor, smoothstep(0.45, 0.90, heatCoord));

            float zAlpha = mix(0.96, 0.72, smoothstep(0.0, 0.68, erodedH)) * (1.0 - smoothstep(0.64, 0.98, erodedH));
            float baseSoft = smoothstep(0.0, 0.06, h);
            float flickerPulse = 0.76 + 0.48 * shimmer;
            float alpha = clamp(zAlpha * baseSoft * powFacing * uOpacity * flickerPulse, 0.0, 1.0);
            if (alpha < 0.004) discard;

            gl_FragColor = vec4(col * uStrength, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
    }

    function createCharredEmberLogsShader() {
      const uniforms = {
        uTime: { value: 0 }
      };
      brazierFireUniforms.push(uniforms);

      return new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec3 vLocalPos;
          varying vec3 vWorldNormal;
          void main() {
            vLocalPos = position;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec3 vLocalPos;
          varying vec3 vWorldNormal;

          float hash3(vec3 p) {
            p = fract(p * vec3(443.897, 441.423, 437.195));
            p += dot(p, p.yzx + 19.19);
            return fract((p.x + p.y) * p.z);
          }

          float noise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(
                mix(hash3(i + vec3(0.0, 0.0, 0.0)), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x),
                f.y
              ),
              mix(
                mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x),
                f.y
              ),
              f.z
            );
          }

          void main() {
            // Dark charred timber bark (#0B0807) fissured with glowing incandescent 2200K orange cracks & glowing coal bed base
            float nCrack = noise3(vLocalPos * 18.0);
            float nFine = noise3(vLocalPos * 38.0 + vec3(0.0, uTime * 0.25, 0.0));
            float pulse = 0.88 + 0.12 * sin(uTime * 2.3 + vLocalPos.x * 4.0 + vLocalPos.z * 4.0);

            // Lower coal cone (y < 0.59) vs upper charred logs (y >= 0.59)
            float isCoalBed = 1.0 - smoothstep(0.56, 0.61, vLocalPos.y);
            float crackMask = smoothstep(0.68, 0.88, nCrack * 0.7 + nFine * 0.3);
            float underGlow = clamp(-vWorldNormal.y * 0.45 + 0.35, 0.0, 1.0) * smoothstep(0.72, 0.56, vLocalPos.y);

            vec3 charBark = vec3(0.035, 0.025, 0.020);
            vec3 emberOrange = vec3(1.0, 0.36, 0.04) * 1.45 * pulse;
            vec3 hotCoal = vec3(1.0, 0.58, 0.12) * 1.65 * pulse;

            float emberWeight = clamp(isCoalBed * (0.45 + 0.55 * nFine) + crackMask * 0.85 + underGlow * 0.45, 0.0, 1.0);
            vec3 col = mix(charBark, emberOrange, emberWeight);
            col = mix(col, hotCoal, smoothstep(0.72, 0.96, emberWeight));

            gl_FragColor = vec4(col, 1.0);
          }
        `
      });
    }

    function createBrazierWarmGlowHalos() {
      const glowTex = createSoftGlowTexture();
      const brazierCenters = [
        { x: -3.65, y: 0.56, z: 0.00, seed: 1.3 },
        { x: 3.65, y: 0.56, z: 0.00, seed: 5.8 }
      ];

      for (const b of brazierCenters) {
        // Layer 1: Inner warm hearth core glow halo centered in the flame body
        const coreGlowMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xffb866,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const coreSprite = new THREE.Sprite(coreGlowMat);
        coreSprite.position.set(b.x, b.y + 0.28, b.z);
        coreSprite.scale.set(1.15, 1.25, 1.0);
        coreSprite.userData = { baseOpacity: 0.42, seed: b.seed };
        scene.add(coreSprite);
        brazierGlowSprites.push(coreSprite);

        // Layer 2: Wide, soft atmospheric warm glow halo bathing the surrounding air & ironwork
        const haloGlowMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xff8524,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const haloSprite = new THREE.Sprite(haloGlowMat);
        haloSprite.position.set(b.x, b.y + 0.38, b.z);
        haloSprite.scale.set(2.45, 2.30, 1.0);
        haloSprite.userData = { baseOpacity: 0.28, seed: b.seed + 2.1 };
        scene.add(haloSprite);
        brazierGlowSprites.push(haloSprite);
      }
    }

    createBrazierWarmGlowHalos();

    // Consolidated Window Point Lights (4 side-aisle + 2 end-wall lights instead of 22 separate PointLights;
    // fine local window & column raking relief is evaluated analytically in applyCathedralStoneRealismShader)
    for (const wz of [-8.8, 8.2]) {
      for (const sideSign of [-1, 1]) {
        const winLight = new THREE.PointLight(0x90beff, 4.2, 16.5, 1.35);
        winLight.position.set(sideSign * 5.3, 4.1, wz);
        scene.add(winLight);
      }
    }
    const northWinLight = new THREE.PointLight(0x9bc4ff, 6.4, 20.0, 1.30);
    northWinLight.position.set(0, 5.2, -18.2);
    scene.add(northWinLight);

    const southWinLight = new THREE.PointLight(0xffb85c, 6.4, 20.0, 1.30);
    southWinLight.position.set(0, 5.2, 18.2);
    scene.add(southWinLight);

    // Impact Flash Light (kept visible=true with intensity=0 when idle so Three.js never recompiles shaders mid-attack!)
    const impactFlashLight = new THREE.PointLight(0xffb74d, 0, 6.0, 1.5);
    impactFlashLight.visible = true;
    scene.add(impactFlashLight);

    // =========================================================================
    // Materials for White & Black Sculpted Stone Chess Pieces
    // =========================================================================
    const whitePieceMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd0,
      roughness: 0.34,
      metalness: 0.06
    });

    const blackPieceMat = new THREE.MeshStandardMaterial({
      color: 0x222630,
      roughness: 0.28,
      metalness: 0.24
    });

    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.26,
      metalness: 0.86
    });

    const forgedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xdce4ee,
      roughness: 0.20,
      metalness: 0.88,
      emissive: 0x222832,
      emissiveIntensity: 0.25
    });

    // =========================================================================
    // Asset Loading (Cathedral GLB + 12 Rigged Piece GLBs)
    // =========================================================================
    const gltfLoader = new GLTFLoader();
    const pieceTemplates = {};
    const activeMixers = [];
    const shatterDebris = [];
    const activeArcaneParticles = [];
    const activeRuneCircles = [];
    const activeShockwaves = [];
    const activeDissolvingPieces = [];
    const clock = new THREE.Clock();

    const boardGroup = new THREE.Group();
    scene.add(boardGroup);
    const squareHighlightsGroup = new THREE.Group();
    scene.add(squareHighlightsGroup);
    const lastMoveHighlightsGroup = new THREE.Group();
    scene.add(lastMoveHighlightsGroup);

    const hintHighlightsGroup = new THREE.Group();
    scene.add(hintHighlightsGroup);
    const checkLaserGroup = new THREE.Group();
    scene.add(checkLaserGroup);
    let checkLaserAlertLight = null;
    let activeCheckBeams = [];
    const boardSquareMeshes = [];
    const boardFrameMeshes = [];
    const cathedralAltarMeshes = [];

    // =========================================================================
    // Gothic Stone Board Textures: Polished Obsidian, Weathered Abbey, Mossy Ruin
    // =========================================================================
    const BOARD_STONE_LOOKS = {
      obsidian: {
        id: 'obsidian',
        name: 'Polished Obsidian',
        lightColor: 0xdfb743,
        darkColor: 0x090b10,
        lightRoughness: 0.16,
        darkRoughness: 0.08,
        lightMetalness: 0.82,
        darkMetalness: 0.24,
        frameColor: 0xe5ba3c,
        frameRoughness: 0.20,
        frameMetalness: 0.92
      },
      weathered_abbey: {
        id: 'weathered_abbey',
        name: 'Weathered Abbey',
        lightColor: 0xd6cbbe,
        darkColor: 0x22252c,
        lightRoughness: 0.58,
        darkRoughness: 0.68,
        lightMetalness: 0.03,
        darkMetalness: 0.04,
        frameColor: 0x9e7c3e,
        frameRoughness: 0.52,
        frameMetalness: 0.72
      },
      mossy_ruin: {
        id: 'mossy_ruin',
        name: 'Mossy Ruin',
        lightColor: 0xadbba6,
        darkColor: 0x161e18,
        lightRoughness: 0.78,
        darkRoughness: 0.84,
        lightMetalness: 0.02,
        darkMetalness: 0.02,
        frameColor: 0x6e7855,
        frameRoughness: 0.65,
        frameMetalness: 0.58
      }
    };

    let currentBoardStoneLook = 'obsidian';
    try {
      const savedLook = localStorage.getItem('wizardChess_boardStone');
      if (savedLook && BOARD_STONE_LOOKS[savedLook]) {
        currentBoardStoneLook = savedLook;
      }
    } catch (e) {}

    // Procedural texture cache for board tiles
    const proceduralBoardTextureCache = {};

    function createProceduralTileMaps(presetKey) {
      if (proceduralBoardTextureCache[presetKey]) {
        return proceduralBoardTextureCache[presetKey];
      }

      const size = 256;
      const lightCanvas = document.createElement('canvas');
      lightCanvas.width = size;
      lightCanvas.height = size;
      const lCtx = lightCanvas.getContext('2d');

      const darkCanvas = document.createElement('canvas');
      darkCanvas.width = size;
      darkCanvas.height = size;
      const dCtx = darkCanvas.getContext('2d');

      const normalCanvas = document.createElement('canvas');
      normalCanvas.width = size;
      normalCanvas.height = size;
      const nCtx = normalCanvas.getContext('2d');

      if (presetKey === 'obsidian') {
        // Polished Obsidian & Radiant Gold:
        // Light squares: Luminous polished gold with subtle gold/amber marbling
        const goldGrad = lCtx.createLinearGradient(0, 0, size, size);
        goldGrad.addColorStop(0.0, '#f5d76e');
        goldGrad.addColorStop(0.35, '#dfb743');
        goldGrad.addColorStop(0.70, '#c79a2a');
        goldGrad.addColorStop(1.0, '#eac352');
        lCtx.fillStyle = goldGrad;
        lCtx.fillRect(0, 0, size, size);

        // Dark squares: Deep jet-black mirror obsidian
        dCtx.fillStyle = '#090b10';
        dCtx.fillRect(0, 0, size, size);

        const drawVeins = (ctx, veinColor, count) => {
          ctx.strokeStyle = veinColor;
          ctx.lineWidth = 1.2;
          ctx.lineCap = 'round';
          for (let i = 0; i < count; i++) {
            ctx.beginPath();
            let x = Math.random() * size;
            let y = Math.random() * size;
            ctx.moveTo(x, y);
            for (let step = 0; step < 5; step++) {
              x += (Math.random() - 0.5) * 60;
              y += (Math.random() - 0.3) * 50;
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        };
        drawVeins(lCtx, 'rgba(255, 248, 200, 0.45)', 6);
        drawVeins(lCtx, 'rgba(175, 125, 20, 0.35)', 4);
        drawVeins(dCtx, 'rgba(218, 175, 60, 0.22)', 4);

        nCtx.fillStyle = 'rgb(128, 128, 255)';
        nCtx.fillRect(0, 0, size, size);
        for (let i = 0; i < 300; i++) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          nCtx.fillStyle = Math.random() > 0.5 ? 'rgba(135, 125, 255, 0.12)' : 'rgba(122, 132, 255, 0.12)';
          nCtx.fillRect(x, y, 2, 2);
        }
      } else if (presetKey === 'weathered_abbey') {
        // Weathered Abbey: Authentic gothic chiseled flagstone with mortar bevel & micro-stipples
        lCtx.fillStyle = '#d6cbbe';
        lCtx.fillRect(0, 0, size, size);
        dCtx.fillStyle = '#22252c';
        dCtx.fillRect(0, 0, size, size);

        const applyMortarEdge = (ctx, darkTone) => {
          ctx.strokeStyle = darkTone;
          ctx.lineWidth = 6;
          ctx.strokeRect(2, 2, size - 4, size - 4);
          ctx.strokeStyle = darkTone;
          ctx.lineWidth = 0.8;
          for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            let x = Math.random() * size;
            let y = Math.random() * size;
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 35, y + (Math.random() - 0.5) * 35);
            ctx.stroke();
          }
        };
        applyMortarEdge(lCtx, 'rgba(80, 70, 60, 0.22)');
        applyMortarEdge(dCtx, 'rgba(10, 12, 16, 0.45)');

        nCtx.fillStyle = 'rgb(128, 128, 255)';
        nCtx.fillRect(0, 0, size, size);
        nCtx.strokeStyle = 'rgb(90, 90, 240)';
        nCtx.lineWidth = 4;
        nCtx.strokeRect(2, 2, size - 4, size - 4);
        for (let i = 0; i < 800; i++) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          nCtx.fillStyle = Math.random() > 0.5 ? 'rgba(145, 145, 255, 0.25)' : 'rgba(110, 110, 240, 0.25)';
          nCtx.fillRect(x, y, 3, 3);
        }
      } else {
        // Mossy Ruin: Overgrown dark granite with lush organic green moss clusters around borders
        lCtx.fillStyle = '#adbba6';
        lCtx.fillRect(0, 0, size, size);
        dCtx.fillStyle = '#161e18';
        dCtx.fillRect(0, 0, size, size);

        const drawMossPatches = (ctx, mossBase, mossHighlight) => {
          ctx.fillStyle = mossBase;
          for (let i = 0; i < 28; i++) {
            const rad = 6 + Math.random() * 18;
            const nearEdge = Math.random() > 0.35;
            const x = nearEdge ? (Math.random() > 0.5 ? Math.random() * 32 : size - Math.random() * 32) : Math.random() * size;
            const y = nearEdge ? (Math.random() > 0.5 ? Math.random() * 32 : size - Math.random() * 32) : Math.random() * size;
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = mossHighlight;
            ctx.beginPath();
            ctx.arc(x + 2, y + 2, rad * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = mossBase;
          }
        };
        drawMossPatches(lCtx, 'rgba(56, 85, 46, 0.45)', 'rgba(92, 130, 72, 0.55)');
        drawMossPatches(dCtx, 'rgba(42, 68, 36, 0.55)', 'rgba(78, 115, 60, 0.65)');

        nCtx.fillStyle = 'rgb(128, 128, 255)';
        nCtx.fillRect(0, 0, size, size);
        for (let i = 0; i < 900; i++) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          nCtx.fillStyle = Math.random() > 0.5 ? 'rgba(155, 135, 255, 0.32)' : 'rgba(105, 120, 240, 0.32)';
          nCtx.fillRect(x, y, 4, 4);
        }
      }

      const lightTex = new THREE.CanvasTexture(lightCanvas);
      const darkTex = new THREE.CanvasTexture(darkCanvas);
      const normalTex = new THREE.CanvasTexture(normalCanvas);
      lightTex.wrapS = lightTex.wrapT = THREE.RepeatWrapping;
      darkTex.wrapS = darkTex.wrapT = THREE.RepeatWrapping;
      normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;

      const cacheObj = { lightTex, darkTex, normalTex };
      proceduralBoardTextureCache[presetKey] = cacheObj;
      return cacheObj;
    }

    function applyBoardStoneTexture(presetKey) {
      const cfg = BOARD_STONE_LOOKS[presetKey] || BOARD_STONE_LOOKS.obsidian;
      currentBoardStoneLook = cfg.id;

      try {
        localStorage.setItem('wizardChess_boardStone', currentBoardStoneLook);
      } catch (e) {}

      const { lightTex, darkTex, normalTex } = createProceduralTileMaps(currentBoardStoneLook);

      for (const mesh of boardSquareMeshes) {
        if (!mesh || !mesh.userData) continue;
        const isLight = (mesh.userData.r + mesh.userData.c) % 2 === 0;
        mesh.material.color.setHex(isLight ? cfg.lightColor : cfg.darkColor);
        mesh.material.roughness = isLight ? cfg.lightRoughness : cfg.darkRoughness;
        mesh.material.metalness = isLight ? cfg.lightMetalness : cfg.darkMetalness;
        mesh.material.map = isLight ? lightTex : darkTex;
        mesh.material.normalMap = normalTex;
        if (mesh.material.normalScale) {
          const ns = currentBoardStoneLook === 'obsidian' ? 0.35 : 0.85;
          mesh.material.normalScale.set(ns, ns);
        }
        mesh.material.needsUpdate = true;
      }

      for (const bar of boardFrameMeshes) {
        if (!bar || !bar.material) continue;
        bar.material.color.setHex(cfg.frameColor);
        bar.material.roughness = cfg.frameRoughness;
        bar.material.metalness = cfg.frameMetalness;
        bar.material.needsUpdate = true;
      }

      for (const altarMesh of cathedralAltarMeshes) {
        if (!altarMesh || !altarMesh.material) continue;
        const mats = Array.isArray(altarMesh.material) ? altarMesh.material : [altarMesh.material];
        for (const m of mats) {
          if (!m) continue;
          if (currentBoardStoneLook === 'obsidian') {
            m.color.setHex(0x101318);
            m.roughness = 0.12;
            m.metalness = 0.20;
          } else if (currentBoardStoneLook === 'weathered_abbey') {
            m.color.setHex(0x2a2d35);
            m.roughness = 0.65;
            m.metalness = 0.05;
          } else {
            m.color.setHex(0x1a221c);
            m.roughness = 0.82;
            m.metalness = 0.03;
          }
          m.needsUpdate = true;
        }
      }

      emitEngineEvent('boardStoneChanged', { texture: currentBoardStoneLook });

      return currentBoardStoneLook;
    }

    function buildChessBoardGrid() {
      const tileH = 0.036;
      const sqGeo = new THREE.BoxGeometry(BOARD_SQ_SIZE * 0.985, tileH, BOARD_SQ_SIZE * 0.985);

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const isLight = (r + c) % 2 === 0;
          const sqMat = new THREE.MeshStandardMaterial({
            roughness: 0.38,
            metalness: 0.06
          });
          const sqMesh = new THREE.Mesh(sqGeo, sqMat);
          const pos = boardToWorld(r, c);
          sqMesh.position.set(pos.x, BOARD_SURFACE_Y - tileH * 0.5, pos.z);
          sqMesh.receiveShadow = true;
          sqMesh.userData = { r, c, isSquare: true };
          boardGroup.add(sqMesh);
          boardSquareMeshes.push(sqMesh);
        }
      }

      // Sculpted Golden Border Frame around the 8x8 tiles on top of the Obsidian Altar
      const halfB = 4.0 * BOARD_SQ_SIZE;
      const rimW = 0.06;
      const rimH = 0.042;
      const horizGeo = new THREE.BoxGeometry(halfB * 2 + rimW * 2, rimH, rimW);
      const vertGeo = new THREE.BoxGeometry(rimW, rimH, halfB * 2);
      for (const s of [-1, 1]) {
        const hMat = goldTrimMat.clone();
        const hBar = new THREE.Mesh(horizGeo, hMat);
        hBar.position.set(0, BOARD_SURFACE_Y - rimH * 0.45, s * (halfB + rimW * 0.5));
        hBar.receiveShadow = true;
        boardGroup.add(hBar);
        boardFrameMeshes.push(hBar);

        const vMat = goldTrimMat.clone();
        const vBar = new THREE.Mesh(vertGeo, vMat);
        vBar.position.set(s * (halfB + rimW * 0.5), BOARD_SURFACE_Y - rimH * 0.45, 0);
        vBar.receiveShadow = true;
        boardGroup.add(vBar);
        boardFrameMeshes.push(vBar);
      }

      // Apply initial stone texture
      applyBoardStoneTexture(currentBoardStoneLook);
    }

    buildChessBoardGrid();

    // =========================================================================
    // Native Baked Wall/Column Stone (Original Ashlar) & Floor Stone (Abbey Flagstone)
    // =========================================================================
    const WALL_STONE_LOOKS = [
      {
        name: 'Original Ashlar',
        fullName: 'Original Ashlar',
        useOriginalBaked: true,
        roughness: 0.78,
        normalScale: 1.18,
        colNormalScale: 1.06
      }
    ];

    const FLOOR_STONE_LOOKS = [
      {
        name: 'Abbey Flagstone',
        fullName: 'Abbey Flagstone',
        useOriginalBaked: true,
        roughness: 0.80,
        metalness: 0.02,
        normalScale: 1.18
      }
    ];

    let currentWallStoneLookIdx = 0;
    let currentFloorStoneLookIdx = 0;
    const cathedralWallMats = [];
    const cathedralColumnMats = [];
    const cathedralFloorMats = [];

    // Precomputed 128x128 tileable micro-chisel grain DataTexture (replaces 32 per-pixel 3D hashes every frame)
    const stoneMicroGrainTex = (() => {
      const size = 128;
      const data = new Uint8Array(size * size * 4);
      const fract = (v) => v - Math.floor(v);
      const hash2 = (x, y, s) => fract(Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453);
      const smoothNoise = (u, v, period, seed) => {
        const gx = u * period;
        const gy = v * period;
        const x0 = Math.floor(gx) % period;
        const y0 = Math.floor(gy) % period;
        const x1 = (x0 + 1) % period;
        const y1 = (y0 + 1) % period;
        const fx = gx - Math.floor(gx);
        const fy = gy - Math.floor(gy);
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const n00 = hash2(x0, y0, seed);
        const n10 = hash2(x1, y0, seed);
        const n01 = hash2(x0, y1, seed);
        const n11 = hash2(x1, y1, seed);
        return (n00 + (n10 - n00) * sx) * (1 - sy) + (n01 + (n11 - n01) * sx) * sy;
      };
      for (let y = 0; y < size; y++) {
        const v = y / size;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const mG1 = smoothNoise(u, v, 24, 1.7);
          const mG2 = smoothNoise(u, v, 64, 7.3);
          const idx = (y * size + x) * 4;
          data[idx] = Math.max(0, Math.min(255, Math.round(mG1 * 255)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(mG2 * 255)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round((0.5 + (mG1 - mG2) * 0.7) * 255)));
          data[idx + 3] = 255;
        }
      }
      const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      return tex;
    })();

    // =========================================================================
    // Realism Stone Shader Enhancement (inspired by 0beqz/realism-effects HBAO/HBIL
    // & gkjohnson/three-gpu-pathtracer Cavity Micro-Occlusion + Specular Occlusion)
    // =========================================================================
    function applyCathedralStoneRealismShader(mat, isFloor = false) {
      if (!mat || mat.userData.hasRealismStoneShader) return;
      mat.userData.hasRealismStoneShader = true;
      mat.customProgramCacheKey = () => (isFloor ? 'cathedral-floor-realism-v3' : 'cathedral-stone-realism-v3');

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uCavityStrength = { value: isFloor ? 0.58 : 0.72 };
        shader.uniforms.uMicroDetailStrength = { value: isFloor ? 0.14 : 0.18 };
        shader.uniforms.uFireBounceStrength = { value: isFloor ? 0.16 : 0.24 };
        shader.uniforms.uMicroGrainMap = { value: stoneMicroGrainTex };

        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
          varying vec3 vStoneWorldPos;`
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vStoneWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
          varying vec3 vStoneWorldPos;
          uniform float uCavityStrength;
          uniform float uMicroDetailStrength;
          uniform float uFireBounceStrength;
          uniform sampler2D uMicroGrainMap;`
        );

        // Extract normal-map slope magnitude for Mortar/Crevice Cavity AO & Specular Micro-Occlusion,
        // plus precomputed tileable micro-chisel grain lookup (zero per-pixel 3D hash loops!).
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `float stoneCavityAO = 1.0;
          #include <normal_fragment_maps>
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec2 rawNrmXY = texture2D(normalMap, vNormalMapUv).xy * 2.0 - 1.0;
            float slopeSq = dot(rawNrmXY, rawNrmXY);
            stoneCavityAO = clamp(1.0 - slopeSq * uCavityStrength, 0.36, 1.0);
          #endif
          vec2 microUv = (vStoneWorldPos.xz + vStoneWorldPos.xy * 0.618) * 0.85;
          vec3 mgSample = texture2D(uMicroGrainMap, microUv).rgb - 0.5;
          float mG1 = mgSample.r;
          float mG2 = mgSample.g;
          vec3 microPerturb = vec3(mG1, mG2, mgSample.b) * uMicroDetailStrength;
          normal = normalize(normal + microPerturb * 0.22);
          diffuseColor.rgb *= mix(0.92, 1.07, clamp(0.5 + (mG1 * 0.65 + mG2 * 0.35), 0.0, 1.0));
          diffuseColor.rgb *= mix(1.0, stoneCavityAO, 0.68);
          roughnessFactor = clamp(roughnessFactor + (1.0 - stoneCavityAO) * 0.34 - mG1 * 0.06, 0.14, 0.99);`
        );

        // Add Horizon-Based Indirect Bounce (HBIL) from the twin fire cauldrons & upper lancet windows,
        // and apply Specular Micro-Occlusion in mortar crevices so grooves never have plastic shine.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          reflectedLight.directDiffuse *= mix(1.0, stoneCavityAO, 0.45);
          reflectedLight.indirectDiffuse *= stoneCavityAO;
          reflectedLight.directSpecular *= stoneCavityAO * stoneCavityAO;
          reflectedLight.indirectSpecular *= stoneCavityAO * stoneCavityAO;

          // Physical multi-bounce warm firelight GI from the twin atrium braziers & flanking columns
          vec3 toBrazierL = vec3(-3.65, 1.35, 0.0) - vStoneWorldPos;
          vec3 toBrazierR = vec3(3.65, 1.35, 0.0) - vStoneWorldPos;
          float distSqL = dot(toBrazierL, toBrazierL) + 2.6;
          float distSqR = dot(toBrazierR, toBrazierR) + 2.6;
          vec3 wNormal = inverseTransformDirection(normal, viewMatrix);
          float bounceL = max(0.0, dot(wNormal, normalize(toBrazierL)) * 0.65 + 0.35) / distSqL;
          float bounceR = max(0.0, dot(wNormal, normalize(toBrazierR)) * 0.65 + 0.35) / distSqR;
          vec3 fireBounceGI = vec3(1.0, 0.54, 0.20) * (bounceL + bounceR) * 5.2 * uFireBounceStrength * stoneCavityAO;

          // Analytic raking window-sill & end-wall grazing light (replaces 14 static PointLights at zero BRDF cost)
          vec3 toSideWin = vec3(sign(vStoneWorldPos.x) * 6.8, 3.8, vStoneWorldPos.z) - vStoneWorldPos;
          float sideWinDistSq = dot(toSideWin, toSideWin) + 3.2;
          float sideWinGraze = max(0.0, dot(wNormal, normalize(toSideWin)) * 0.75 + 0.25) / sideWinDistSq;
          vec3 windowGrazeGI = vec3(0.84, 0.89, 0.96) * sideWinGraze * 0.95 * stoneCavityAO;
          reflectedLight.indirectDiffuse += (fireBounceGI + windowGrazeGI) * diffuseColor.rgb;`
        );
      };
      mat.needsUpdate = true;
    }

    function setWallStoneLook() {
      currentWallStoneLookIdx = 0;
      const cfg = WALL_STONE_LOOKS[0];

      for (const mat of cathedralWallMats) {
        mat.map = mat.userData.origMap || mat.map;
        mat.normalMap = mat.userData.origNormalMap || mat.normalMap;
        mat.roughnessMap = mat.userData.origRoughnessMap || mat.roughnessMap;
        mat.emissiveMap = mat.userData.origEmissiveMap || null;
        mat.emissiveIntensity = 0.08;
        mat.roughness = cfg.roughness;
        mat.metalness = 0.02;
        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.45;
        if (mat.color) mat.color.setRGB(1, 1, 1);
        if (mat.normalScale) mat.normalScale.set(cfg.normalScale, cfg.normalScale);
        mat.needsUpdate = true;
      }

      for (const mat of cathedralColumnMats) {
        mat.map = mat.userData.origMap || mat.map;
        mat.normalMap = mat.userData.origNormalMap || mat.normalMap;
        mat.roughnessMap = mat.userData.origRoughnessMap || mat.roughnessMap;
        mat.emissiveMap = mat.userData.origEmissiveMap || null;
        mat.emissiveIntensity = 0.08;
        mat.roughness = cfg.roughness;
        mat.metalness = 0.02;
        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.48;
        if (mat.color) mat.color.setRGB(1, 1, 1);
        if (mat.normalScale) mat.normalScale.set(cfg.colNormalScale, cfg.colNormalScale);
        mat.needsUpdate = true;
      }

      return { index: 0, name: cfg.name, fullName: cfg.fullName };
    }

    function setFloorStoneLook() {
      currentFloorStoneLookIdx = 0;
      const cfg = FLOOR_STONE_LOOKS[0];

      for (const mat of cathedralFloorMats) {
        mat.map = mat.userData.origMap || mat.map;
        mat.normalMap = mat.userData.origNormalMap || mat.normalMap;
        mat.roughnessMap = mat.userData.origRoughnessMap || mat.roughnessMap;
        mat.emissiveMap = mat.userData.origEmissiveMap || null;
        mat.emissiveIntensity = 0.06;
        mat.roughness = cfg.roughness;
        mat.metalness = cfg.metalness;
        if (mat.color) mat.color.setRGB(1, 1, 1);
        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.36;
        if (mat.normalScale) mat.normalScale.set(cfg.normalScale, cfg.normalScale);
        mat.needsUpdate = true;
      }

      return { index: 0, name: cfg.name, fullName: cfg.fullName };
    }

    function nextWallStoneLook() {
      return setWallStoneLook(0);
    }
    function prevWallStoneLook() {
      return setWallStoneLook(0);
    }
    function nextFloorStoneLook() {
      return setFloorStoneLook(0);
    }
    function prevFloorStoneLook() {
      return setFloorStoneLook(0);
    }

    async function loadAllAssets() {
      const loaderBar = document.getElementById('loader-bar');
      const loaderText = document.getElementById('loader-text');
      const totalItems = PIECE_TYPES.length + 1;

      async function loadGltfModel(baseName) {
        let arrayBuffer = null;
        try {
          const resB64 = await fetch(`./assets/glb/${baseName}.glb.gz.b64`);
          if (resB64.ok) {
            const b64Text = (await resB64.text()).trim();
            if (b64Text.length > 64) {
              const binStr = atob(b64Text);
              const gzBytes = new Uint8Array(binStr.length);
              for (let i = 0; i < binStr.length; i++) {
                gzBytes[i] = binStr.charCodeAt(i);
              }
              const ds = new DecompressionStream('gzip');
              const stream = new Blob([gzBytes]).stream().pipeThrough(ds);
              arrayBuffer = await new Response(stream).arrayBuffer();
            }
          }
        } catch (e) {}

        if (!arrayBuffer) {
          const resGlb = await fetch(`./assets/glb/${baseName}.glb`);
          if (!resGlb.ok) throw new Error(`Failed to fetch ${baseName}`);
          arrayBuffer = await resGlb.arrayBuffer();
        }

        return new Promise((resolve, reject) => {
          gltfLoader.parse(arrayBuffer, './assets/glb/', (gltf) => resolve(gltf), (err) => reject(err));
        });
      }
      let loadedCount = 0;

      function bumpProgress(label) {
        loadedCount++;
        const pct = Math.min(100, Math.round((loadedCount / totalItems) * 100));
        if (loaderBar) loaderBar.style.width = `${pct}%`;
        if (loaderText) loaderText.textContent = label;
      }

      // Instantiate custom GLSL shaders for the 3 sculpted brazier flame layers & charred ember logs
      const flameCoreShader = createSculptedFlameTongueShader({
        baseColor: [1.0, 0.96, 0.72],
        midColor: [1.0, 0.64, 0.12],
        tipColor: [1.0, 0.36, 0.03],
        strength: 1.85,
        opacity: 0.92,
        zMin: 0.60,
        zMax: 1.64,
        layerSeed: 0.0
      });
      const flameMidShader = createSculptedFlameTongueShader({
        baseColor: [1.0, 0.78, 0.25],
        midColor: [1.0, 0.40, 0.04],
        tipColor: [0.92, 0.16, 0.01],
        strength: 1.35,
        opacity: 0.82,
        zMin: 0.60,
        zMax: 1.52,
        layerSeed: 2.1
      });
      const flameOuterShader = createSculptedFlameTongueShader({
        baseColor: [1.0, 0.45, 0.06],
        midColor: [0.88, 0.18, 0.015],
        tipColor: [0.45, 0.03, 0.002],
        strength: 0.95,
        opacity: 0.68,
        zMin: 0.60,
        zMax: 1.36,
        layerSeed: 4.4
      });
      const charredEmberLogsShader = createCharredEmberLogsShader();

      // 1. Load Native Full-Height Cathedral Environment (shifted by z = -0.65 so the Obsidian Altar is centered at 0, 0.7215, 0)
      const maxAniso = renderer.capabilities.getMaxAnisotropy() || 8;
      await new Promise((resolve) => {
        loadGltfModel('option8_cathedral').then(
          (gltf) => {
            const cathedralRoot = gltf.scene;
            cathedralRoot.position.set(0, 0, -0.65);

            cathedralRoot.traverse((child) => {
              if (!child.isMesh) return;
              child.receiveShadow = true;
              const meshName = child.name || '';
              const mNameFirst = (Array.isArray(child.material) ? child.material[0]?.name : child.material?.name) || '';

              if (meshName.includes('Brazier_Flame_Core') || mNameFirst.includes('Flame_Core')) {
                child.material = flameCoreShader;
                child.castShadow = false;
                child.receiveShadow = false;
                child.renderOrder = 12;
                return;
              }
              if (meshName.includes('Brazier_Flame_Mid') || mNameFirst.includes('Flame_Mid')) {
                stripIcosphereSparksFromFlameGeometry(child.geometry);
                child.material = flameMidShader;
                child.castShadow = false;
                child.receiveShadow = false;
                child.renderOrder = 11;
                return;
              }
              if (meshName.includes('Brazier_Flame_Outer') || mNameFirst.includes('Flame_Outer')) {
                child.material = flameOuterShader;
                child.castShadow = false;
                child.receiveShadow = false;
                child.renderOrder = 10;
                return;
              }
              if (meshName.includes('Embers_Logs') || mNameFirst.includes('Ember')) {
                child.material = charredEmberLogsShader;
                child.castShadow = false;
                child.receiveShadow = false;
                return;
              }

              const isShadowCasterProp =
                meshName.includes('Obsidian_Altar') ||
                meshName.includes('Altar_Golden_Runes');
              if (meshName.includes('Obsidian_Altar') || meshName.includes('Altar')) {
                if (!cathedralAltarMeshes.includes(child)) cathedralAltarMeshes.push(child);
              }

              const mats = Array.isArray(child.material) ? child.material : [child.material];
              for (const mat of mats) {
                if (!mat) continue;
                const mName = mat.name || '';
                const isAmberGlass =
                  mName.includes('Amber') ||
                  mName.includes('Narthex_Amber') ||
                  meshName.includes('Narthex_Amber');
                const isGlass =
                  isAmberGlass ||
                  mName.includes('Glass') ||
                  mName.includes('Lancet') ||
                  mName.includes('Rose') ||
                  meshName.includes('Glass') ||
                  meshName.includes('Window');
                const isRay = mName.includes('GodRay') || meshName.includes('GodRay');

                for (const texKey of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
                  if (mat[texKey]) {
                    mat[texKey].anisotropy = maxAniso;
                    mat[texKey].needsUpdate = true;
                  }
                }

                // Preserve native 1024x1024 GLB-baked textures before any look switching
                if (!mat.userData.origCaptured) {
                  mat.userData.origCaptured = true;
                  mat.userData.origMap = mat.map || null;
                  mat.userData.origNormalMap = mat.normalMap || null;
                  mat.userData.origRoughnessMap = mat.roughnessMap || null;
                  mat.userData.origEmissiveMap = mat.emissiveMap || null;
                }

                if (mat.normalMap && mat.normalScale) {
                  const isDoorMat = mName.includes('Oak') || mName.includes('Door') || meshName.includes('Door');
                  const nScale = isDoorMat ? 1.05 : 1.15;
                  mat.normalScale.set(nScale, nScale);
                }

                if (isAmberGlass) {
                  mat.vertexColors = false;
                  mat.color = new THREE.Color(0xffe6b8);
                  mat.emissive = new THREE.Color(0xffa033);
                  mat.emissiveIntensity = 2.45;
                  mat.roughness = 0.15;
                  mat.metalness = 0.0;
                  mat.side = THREE.DoubleSide;
                  child.castShadow = false;
                } else if (isGlass) {
                  mat.vertexColors = false;
                  mat.color = new THREE.Color(0xdbeeff);
                  mat.emissive = new THREE.Color(0x68a8ff);
                  mat.emissiveIntensity = 2.65;
                  mat.roughness = 0.15;
                  mat.metalness = 0.0;
                  mat.side = THREE.DoubleSide;
                  child.castShadow = false;
                } else if (isRay) {
                  child.visible = false;
                  child.castShadow = false;
                  child.receiveShadow = false;
                } else {
                  if (mat.map) {
                    mat.vertexColors = true;
                  }
                  child.castShadow = isShadowCasterProp;

                  // Register Wall, Column/Arch/Plinth, and Floor stone materials for live 6-look switching & Realism Shader
                  if (mName.includes('Floor') || mName.includes('Flagstone') || meshName.includes('Floor')) {
                    applyCathedralStoneRealismShader(mat, true);
                    if (!cathedralFloorMats.includes(mat)) cathedralFloorMats.push(mat);
                  } else if (
                    mName.includes('Column_Stone') ||
                    mName.includes('Tracery') ||
                    meshName.includes('Plinth') ||
                    meshName.includes('Tracery')
                  ) {
                    applyCathedralStoneRealismShader(mat, false);
                    if (!cathedralColumnMats.includes(mat)) cathedralColumnMats.push(mat);
                  } else if (
                    mName.includes('Gothic_Ashlar') ||
                    mName.includes('Ashlar') ||
                    mName.includes('Vault') ||
                    meshName.includes('Cathedral_Stone')
                  ) {
                    applyCathedralStoneRealismShader(mat, false);
                    if (!cathedralWallMats.includes(mat)) cathedralWallMats.push(mat);
                  }
                }
                mat.needsUpdate = true;
              }
            });

            // Initialize default Look 1/6 (Original Ashlar & Abbey Flagstone) on Wall/Column Stone and Floor Stone
            setWallStoneLook(0);
            setFloorStoneLook(0);
            applyBoardStoneTexture(currentBoardStoneLook);
            scene.add(cathedralRoot);

            bumpProgress('Cathedral Architecture Loaded...');
            resolve();
          },
          (err) => {
            console.warn('Cathedral GLB load warning:', err);
            bumpProgress('Cathedral Loaded');
            resolve();
          }
        );
      });

      // 2. Load 6 Sculpted & Rigged Chess Piece Models (shared between White & Black with PBR materials)
      for (const type of PIECE_TYPES) {
        await new Promise((resolve) => {
          loadGltfModel(`${type}_white`).then(
            (gltf) => {
              const toRemove = [];
              gltf.scene.traverse((child) => {
                const nm = child.name || '';
                if (nm.includes('Icosphere') || nm.includes('glTF_not_exported')) {
                  child.visible = false;
                  toRemove.push(child);
                }
              });
              for (const rem of toRemove) {
                if (rem.parent) rem.parent.remove(rem);
              }

              const tpl = {
                scene: gltf.scene,
                animations: gltf.animations || []
              };
              pieceTemplates[`${type}_w`] = tpl;
              pieceTemplates[`${type}_b`] = tpl;
              bumpProgress(`Summoned ${type.toUpperCase()} Statue...`);
              resolve();
            },
            (err) => {
              console.warn(`Piece load warning (${type}):`, err);
              bumpProgress(`Loaded ${type}`);
              resolve();
            }
          );
        });
      }

      document.getElementById('loading-overlay')?.classList.add('hidden');
    }

    // =========================================================================
    // Chess Game State, Complete Move Rules, and AI Engine
    // =========================================================================
    let boardState = Array.from({ length: 8 }, () => Array(8).fill(null));
    let currentTurn = 'w';
    let selectedSquare = null;
    let validMoves = [];
    let isAnimatingMove = false;
    let gameOver = false;
    let capturedByWhite = 0;
    let capturedByBlack = 0;

    // Mode & Player Configuration
    let gameMode = 'single'; // 'single' | 'multi'
    let playerColor = 'w';   // 'w' | 'b' | 'spectator'
    let promotionPreference = 'queen'; // 'queen' | 'rook' | 'knight' | 'bishop' (UI setting)
    const PROMO_CORE_CHAR = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };
    const PROMO_CORE_TO_TYPE = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
    let aiAutoPlay = true;
    let aiTimer = null;


    // Camera Animation & Telemetry State
    const cameraTelemetry = {
      lastAttackSamples: [],
      attackCount: 0,
      maxStepDelta: 0,
      columnDeflections: 0,
      minColumnClearance: Infinity,
      lastColumnClearance: Infinity
    };
    window.__wizardChessTelemetry = cameraTelemetry;

    let activeCamTransition = null; // { startPos, endPos, startTarget, endTarget, elapsed, duration }

    function flushOrbitControlsDamping() {
      const wasDamping = orbitControls.enableDamping;
      orbitControls.enableDamping = false;
      orbitControls.update();
      enforceCathedralBoundsAndSolidColumns(null, camera.position, orbitControls.target);
      camera.lookAt(orbitControls.target);
      orbitControls.enableDamping = wasDamping;
    }

    function smoothCameraTo(targetPos, targetLookAt, duration = 0.75) {
      flushOrbitControlsDamping();
      const clampedPos = targetPos.clone();
      const clampedLook = targetLookAt.clone();
      enforceCathedralBoundsAndSolidColumns(clampedPos, clampedPos, clampedLook);
      activeCamTransition = {
        startPos: camera.position.clone(),
        endPos: clampedPos,
        startTarget: orbitControls.target.clone(),
        endTarget: clampedLook,
        elapsed: 0,
        duration: Math.max(0.05, duration)
      };
    }

    function setCameraForSide(color, immediate = false) {
      // White sits at +Z looking toward -Z (across the Obsidian Altar down the Cathedral Nave & Rose Window)
      // Black sits at -Z looking toward +Z (across the Obsidian Altar toward the South Narthex Royal Amber Triptych)
      const zSign = color === 'b' ? -1 : 1;
      const desiredPos = new THREE.Vector3(0, 2.22, zSign * 2.72);
      const desiredTarget = new THREE.Vector3(0, 0.85, zSign * -0.15);
      if (immediate) {
        activeCamTransition = null;
        camera.position.copy(desiredPos);
        orbitControls.target.copy(desiredTarget);
        flushOrbitControlsDamping();
      } else {
        smoothCameraTo(desiredPos, desiredTarget, 0.8);
      }
    }

    function instantiatePiece(type, color, r, c) {
      const tpl = pieceTemplates[`${type}_${color}`];
      let root;
      let mixer = null;
      const actions = {};

      if (tpl && tpl.scene) {
        root = SkeletonUtils.clone(tpl.scene);
        const primaryMat = color === 'w' ? whitePieceMat : blackPieceMat;
        root.traverse((child) => {
          const nm = child.name || '';
          if (nm.includes('Icosphere') || nm.includes('glTF_not_exported')) {
            child.visible = false;
            return;
          }
          if (child.isMesh) {
            const mName = child.material?.name || '';
            if (mName.includes('Gold') || mName.includes('Trim') || mName.includes('Bronze') || mName.includes('Glow')) {
              child.material = goldTrimMat;
            } else if (mName.includes('Steel')) {
              child.material = forgedSteelMat;
            } else {
              child.material = primaryMat;
            }
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        mixer = new THREE.AnimationMixer(root);
        for (const clip of tpl.animations) {
          actions[clip.name] = mixer.clipAction(clip);
        }
        activeMixers.push(mixer);
      } else {
        root = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.14, 0.42, 16),
          color === 'w' ? whitePieceMat : blackPieceMat
        );
      }

      const worldPos = boardToWorld(r, c);
      root.position.copy(worldPos);
      const scale = BOARD_SQ_SIZE;
      root.scale.set(scale, scale, scale);
      // White (at +Z, r=6,7) faces -Z (Math.PI); Black (at -Z, r=0,1) faces +Z (0)
      root.rotation.y = color === 'w' ? Math.PI : 0;
      scene.add(root);

      const pieceObj = {
        type,
        color,
        r,
        c,
        mesh: root,
        mixer,
        actions,
        currentAction: null,
        hasMoved: false
      };

      root.traverse((child) => {
        child.userData.piece = pieceObj;
      });

      playPieceClip(pieceObj, 'Idle', true, 0);
      return pieceObj;
    }

    // Exact per-piece Attack keyframe synchronization (24 fps Blender clips, zero overhead suspension freeze):
    // - All 6 pieces wind up smoothly through Frame 8..10 (0.29s..0.38s), launch their weapon strike at Frame 9..10 (0.35s..0.38s),
    //   make physical weapon contact at Frame 15 (0.58s..0.60s), and drive through the opponent at Frame 19.5..20 (0.76s..0.79s) before shatter burst!
    const ATTACK_SYNC_PROFILES = {
      pawn:   { timeScale: 1.45, swingStartClip: 0.36, contactClip: 0.60, blowClip: 0.78, maxLunge: 0.095 },
      king:   { timeScale: 1.40, swingStartClip: 0.34, contactClip: 0.56, blowClip: 0.75, maxLunge: 0.080 },
      queen:  { timeScale: 1.35, swingStartClip: 0.34, contactClip: 0.62, blowClip: 0.80, maxLunge: 0.075 },
      rook:   { timeScale: 1.35, swingStartClip: 0.32, contactClip: 0.54, blowClip: 0.75, maxLunge: 0.090 },
      knight: { timeScale: 1.35, swingStartClip: 0.32, contactClip: 0.56, blowClip: 0.74, maxLunge: 0.080 },
      bishop: { timeScale: 1.55, swingStartClip: 0.28, contactClip: 0.48, blowClip: 0.68, maxLunge: 0.110 }
    };

    function playPieceClip(piece, clipKeyword, loop = true, fadeSeconds = 0.18) {
      if (!piece || !piece.actions) return;
      const lowerKw = clipKeyword.toLowerCase();
      const key = Object.keys(piece.actions).find((k) =>
        k.toLowerCase().includes(lowerKw)
      );
      if (!key) return;
      const nextAction = piece.actions[key];
      const isIdle = lowerKw.includes('idle');
      const isAttack = lowerKw.includes('attack');
      if (piece.currentAction && piece.currentAction !== nextAction) {
        piece.currentAction.fadeOut(fadeSeconds);
      }
      nextAction.reset();
      nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      nextAction.clampWhenFinished = !loop;
      if (isAttack) {
        const prof = ATTACK_SYNC_PROFILES[piece.type] || ATTACK_SYNC_PROFILES.queen;
        nextAction.timeScale = prof.timeScale;
      } else {
        // Deliberate, weighty stone stride and idle breathing (another 10% slower than 0.90)
        nextAction.timeScale = 0.81;
      }
      if (isIdle && (!fadeSeconds || fadeSeconds <= 0.01)) {
        // Stagger initial idle phase per board square so the 32 pieces breathe organically out of lockstep
        nextAction.time = ((piece.r * 5 + piece.c * 3) % 16) * 0.11;
      }
      nextAction.fadeIn(fadeSeconds).play();
      piece.currentAction = nextAction;
      if (piece.mixer) {
        piece.mixer.update(0.016);
      }
      renderer.shadowMap.needsUpdate = true;
    }

    function clearAllPieces() {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (boardState[r][c] && boardState[r][c].mesh) {
            scene.remove(boardState[r][c].mesh);
          }
          boardState[r][c] = null;
        }
      }
      activeMixers.length = 0;
      clearAllArcaneEffects();
    }

    // Scripted Chess Notation & Step-Through Choreography State (Features 3a, 3b, 3c)
    let scriptedGameActive = false;
    let scriptDeviated = false;
    let scriptMoves = [];
    let scriptCursor = 0;
    let moveHistory = [];
    let preMoveHighlightTask = null;
    let activeDuelSavedCam = null;
    let checkmateState = {
      active: false,
      bannerVisible: false,
      defeatedColor: null,
      winnerColor: null,
      kingFallAngleDeg: 0,
      phase: 'none'
    };

    function clearCheckmateSequence() {
      checkmateState.active = false;
      checkmateState.bannerVisible = false;
      checkmateState.defeatedColor = null;
      checkmateState.winnerColor = null;
      checkmateState.kingFallAngleDeg = 0;
      checkmateState.phase = 'none';
      const overlay = document.getElementById('checkmate-overlay');
      if (overlay) {
        overlay.classList.remove('visible');
      }
    }

    let enPassantTarget = null;
    const moveHistoryNotation = [];

    function updateMoveHistoryDOM() {
      try {
        emitEngineEvent('historyChanged', { history: moveHistoryNotation.map(r => ({ ...r })) });
      } catch (e) {}

      const container = document.getElementById('move-history-list');
      const badge = document.getElementById('history-count-badge');
      if (badge) {
        let totalPlies = 0;
        for (const row of moveHistoryNotation) {
          if (row.white) totalPlies++;
          if (row.black) totalPlies++;
        }
        badge.textContent = String(totalPlies);
      }

      if (!container) return;

      if (moveHistoryNotation.length === 0) {
        const t = getTranslations();
        container.innerHTML = `<div class="history-empty">${t.moveHistoryEmpty}</div>`;
        return;
      }

      let html = '<div class="history-table">';
      for (const row of moveHistoryNotation) {
        html += `<div class="history-row">
          <span class="history-num">${row.moveNumber}.</span>
          <span class="history-white">${row.white}</span>
          <span class="history-black">${row.black || ''}</span>
        </div>`;
      }
      html += '</div>';
      container.innerHTML = html;
      container.scrollTop = container.scrollHeight;
    }

    function recordMoveNotation(color, san, fromR, fromC, toR, toC) {
      if (color === 'w') {
        moveHistoryNotation.push({
          moveNumber: moveHistoryNotation.length + 1,
          white: san,
          black: ''
        });
      } else {
        if (moveHistoryNotation.length > 0) {
          moveHistoryNotation[moveHistoryNotation.length - 1].black = san;
        } else {
          moveHistoryNotation.push({
            moveNumber: 1,
            white: '...',
            black: san
          });
        }
      }
      updateMoveHistoryDOM();
    }

    function captureBoardSnapshot() {
      return {
        currentTurn,
        gameOver,
        capturedByWhite,
        capturedByBlack,
        scriptCursor,
        scriptedGameActive,
        scriptDeviated,
        clockWhiteSeconds,
        clockBlackSeconds,
        isClockRunning,
        clockFlagFallen,
        enPassantTarget: enPassantTarget ? { ...enPassantTarget } : null,
        cells: boardState.map((row) =>
          row.map((p) => (p ? { type: p.type, color: p.color, hasMoved: Boolean(p.hasMoved) } : null))
        )
      };
    }

    function restoreBoardSnapshot(snap) {
      if (!snap) return false;
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      preMoveHighlightTask = null;
      activeMoveTweens.length = 0;
      clearCheckmateSequence();
      clearAllArcaneEffects();
      impactFlashLight.intensity = 0;
      impactFlashLight.visible = false;
      if (activeDuelSavedCam) {
        camera.position.copy(activeDuelSavedCam.pos);
        orbitControls.target.copy(activeDuelSavedCam.target);
        activeDuelSavedCam = null;
      }
      orbitControls.enabled = true;
      orbitControls.update();

      clearAllPieces();
      clearSquareHighlights();
      selectedSquare = null;
      validMoves = [];
      isAnimatingMove = false;
      currentTurn = snap.currentTurn;
      gameOver = snap.gameOver;
      capturedByWhite = snap.capturedByWhite;
      capturedByBlack = snap.capturedByBlack;
      enPassantTarget = snap.enPassantTarget ? { ...snap.enPassantTarget } : null;
      if (typeof snap.scriptCursor === 'number') {
        scriptCursor = snap.scriptCursor;
      }
      if (typeof snap.scriptedGameActive === 'boolean') {
        scriptedGameActive = snap.scriptedGameActive;
      }
      if (typeof snap.scriptDeviated === 'boolean') {
        scriptDeviated = snap.scriptDeviated;
      }
      if (typeof snap.clockWhiteSeconds === 'number') {
        clockWhiteSeconds = snap.clockWhiteSeconds;
      }
      if (typeof snap.clockBlackSeconds === 'number') {
        clockBlackSeconds = snap.clockBlackSeconds;
      }
      if (typeof snap.isClockRunning === 'boolean') {
        isClockRunning = snap.isClockRunning;
      }
      if (typeof snap.clockFlagFallen === 'boolean') {
        clockFlagFallen = snap.clockFlagFallen;
      }

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const cell = snap.cells[r][c];
          if (cell) {
            const inst = instantiatePiece(cell.type, cell.color, r, c);
            inst.hasMoved = Boolean(cell.hasMoved);
            boardState[r][c] = inst;
          }
        }
      }

      renderer.shadowMap.needsUpdate = true;
      updateTurnUI();
      updateClockDOM();
      clearCheckLaserBeams();
      if (typeof updateScriptBarUI === 'function') updateScriptBarUI();
      return true;
    }

    // =========================================================================
    // Saved Game Persistence (localStorage): auto-save after every move,
    // auto-restore on startup, cleared on explicit new games.
    // =========================================================================
    const SAVED_GAME_KEY = 'wizardChess_savedGame_v1';

    function serializeGame() {
      return {
        version: 1,
        savedAt: Date.now(),
        variant: currentVariant,
        chess960LayoutIndex: currentChess960Layout ? currentChess960Layout.layoutIndex : null,
        playerColor,
        timeControl: currentTimeControl,
        difficulty: currentDifficulty,
        repetitionCounts: { ...repetitionCounts },
        moveHistoryNotation: moveHistoryNotation.map((row) => ({ ...row })),
        moveHistory: moveHistory.map((entry) => ({
          move: entry.move ? { ...entry.move } : null,
          san: entry.san || '',
          snapshot: entry.snapshot,
          snapshotAfter: entry.snapshotAfter,
          positionKeyAfter: entry.positionKeyAfter || null
        })),
        liveSnapshot: captureBoardSnapshot()
      };
    }

    // =========================================================================
    // Hint: quick main-thread search for the current player's best move
    // =========================================================================
    let hintTimer = null;
    const hintTileTexture = (() => {
      const size = 128;
      const cvs = document.createElement('canvas');
      cvs.width = size;
      cvs.height = size;
      const ctx = cvs.getContext('2d');
      ctx.fillStyle = 'rgba(78, 168, 222, 0.30)';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(140, 210, 255, 0.92)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, size - 6, size - 6);
      ctx.fillStyle = 'rgba(190, 230, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 10, 0, Math.PI * 2);
      ctx.fill();
      const tex = new THREE.CanvasTexture(cvs);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    })();

    function clearHintHighlight() {
      if (hintTimer) {
        clearTimeout(hintTimer);
        hintTimer = null;
      }
      while (hintHighlightsGroup.children.length > 0) {
        const mesh = hintHighlightsGroup.children[0];
        hintHighlightsGroup.remove(mesh);
        if (mesh.material) mesh.material.dispose();
      }
    }

    function showHintHighlight(fromR, fromC, toR, toC) {
      clearHintHighlight();
      if ([fromR, fromC, toR, toC].some((v) => v == null || v < 0 || v > 7)) return;
      const sqSize = BOARD_SQ_SIZE * 0.97;
      const geo = new THREE.PlaneGeometry(sqSize, sqSize);
      geo.rotateX(-Math.PI / 2);
      const spots = [[fromC, fromR, 0.8], [toC, toR, 0.94]];
      for (const [cc, rr, opacity] of spots) {
        const pos = boardToWorld(rr, cc);
        const mat = new THREE.MeshBasicMaterial({
          map: hintTileTexture,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, BOARD_SURFACE_Y + 0.006, pos.z);
        hintHighlightsGroup.add(mesh);
      }
      hintTimer = setTimeout(clearHintHighlight, 6000);
    }

    function getBestHintMove() {
      if (gameOver || isAnimatingMove || scriptedGameActive || previewingPly !== null) return null;
      const state = buildCoreState(currentTurn);
      let result = null;
      try {
        result = coreSearchBestMove(state, { depth: 3, jitter: 0, nodeLimit: 200000 });
      } catch (e) {
        return null;
      }
      const chosen = coreMoveToEngineMove(result && result.move);
      if (!chosen || !isEngineLegalMove(currentTurn, chosen)) return null;
      const legal = coreLegalMoves(state);
      const coreMove = legal.find((m) =>
        m.from.r === chosen.fromR && m.from.c === chosen.fromC &&
        m.to.r === chosen.toR && m.to.c === chosen.toC &&
        (!chosen.promotion || m.promotion === chosen.promotion)
      );
      let san = null;
      try {
        if (coreMove) san = coreMoveToSan(state, coreMove, legal);
      } catch (e) {}
      showHintHighlight(chosen.fromR, chosen.fromC, chosen.toR, chosen.toC);
      return {
        from: coreSquareName(chosen.fromR, chosen.fromC),
        to: coreSquareName(chosen.toR, chosen.toC),
        san: san,
        score: typeof (result && result.score) === 'number' ? result.score : 0
      };
    }

    function saveGameToStorage() {
      try {
        if (scriptedGameActive) return false;
        if (moveHistory.length === 0) {
          clearSavedGame();
          return false;
        }
        localStorage.setItem(SAVED_GAME_KEY, JSON.stringify(serializeGame()));
        return true;
      } catch (e) {
        return false;
      }
    }

    function clearSavedGame() {
      try {
        localStorage.removeItem(SAVED_GAME_KEY);
      } catch (e) {}
    }

    function hasSavedGame() {
      try {
        return Boolean(localStorage.getItem(SAVED_GAME_KEY));
      } catch (e) {
        return false;
      }
    }

    // =========================================================================
    // PGN Export: standard game download with headers, movetext and result
    // =========================================================================
    function getGameResult() {
      if (!gameOver) return '*';
      if (checkmateState.winnerColor === 'w') return '1-0';
      if (checkmateState.winnerColor === 'b') return '0-1';
      return '1/2-1/2';
    }

    function chess960StartFen() {
      if (!currentChess960Layout || !Array.isArray(currentChess960Layout.row)) return null;
      const CHAR = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };
      const backLower = currentChess960Layout.row.map((t) => CHAR[t] || '?').join('');
      if (backLower.indexOf('?') !== -1) return null;
      return backLower + '/pppppppp/8/8/8/8/PPPPPPPP/' + backLower.toUpperCase() + ' w AHah - 0 1';
    }

    function getGamePgn() {
      const result = getGameResult();
      const lines = [];
      lines.push('[Event "Wizard Chess 3D"]');
      lines.push('[Site "simaklaw.github.io/Wizard-chess-3d"]');
      const d = new Date();
      const pad2 = (n) => String(n).padStart(2, '0');
      lines.push('[Date "' + d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()) + '"]');
      const aiName = 'AI (' + currentDifficulty + ')';
      lines.push('[White "' + (playerColor === 'w' ? 'Player' : aiName) + '"]');
      lines.push('[Black "' + (playerColor === 'b' ? 'Player' : aiName) + '"]');
      if (currentVariant === 'chess960') {
        lines.push('[Variant "Chess960"]');
        const fen = chess960StartFen();
        if (fen) {
          lines.push('[SetUp "1"]');
          lines.push('[FEN "' + fen + '"]');
        }
      }
      lines.push('[Result "' + result + '"]');

      const words = [];
      for (const row of moveHistoryNotation) {
        if (row.white) words.push(row.moveNumber + '. ' + row.white);
        if (row.black) words.push(String(row.black));
      }
      words.push(result);

      const bodyLines = [];
      let line = '';
      for (const w of words) {
        if (line && (line + ' ' + w).length > 80) {
          bodyLines.push(line);
          line = w;
        } else {
          line = line ? line + ' ' + w : w;
        }
      }
      if (line) bodyLines.push(line);

      return lines.join('\n') + '\n\n' + (bodyLines.join('\n') || result) + '\n';
    }

    function restoreSavedGame() {
      let data = null;
      try {
        data = JSON.parse(localStorage.getItem(SAVED_GAME_KEY) || 'null');
      } catch (e) {
        data = null;
      }
      if (!data || data.version !== 1 || !Array.isArray(data.moveHistory) || data.moveHistory.length === 0) {
        return false;
      }
      const valid = data.moveHistory.every((entry) =>
        entry && entry.move && entry.snapshot && entry.snapshotAfter &&
        Array.isArray(entry.snapshot.cells) && Array.isArray(entry.snapshotAfter.cells)
      );
      if (!valid) return false;

      currentVariant = data.variant === 'chess960' ? 'chess960' : 'standard';
      if (currentVariant === 'chess960') {
        const idx = typeof data.chess960LayoutIndex === 'number' ? data.chess960LayoutIndex : -1;
        currentChess960Layout = generateChess960BackRow(idx);
      } else {
        currentChess960Layout = null;
      }
      playerColor = data.playerColor === 'b' ? 'b' : 'w';
      if (data.timeControl && TIME_CONTROLS[data.timeControl]) {
        currentTimeControl = data.timeControl;
      }
      if (typeof data.difficulty === 'string') {
        currentDifficulty = data.difficulty;
      }

      moveHistory = data.moveHistory.map((entry) => ({ ...entry }));
      moveHistoryNotation.length = 0;
      for (const row of (Array.isArray(data.moveHistoryNotation) ? data.moveHistoryNotation : [])) {
        moveHistoryNotation.push({ moveNumber: row.moveNumber, white: row.white, black: row.black });
      }
      repetitionCounts = (data.repetitionCounts && typeof data.repetitionCounts === 'object')
        ? { ...data.repetitionCounts }
        : {};
      previewingPly = null;
      liveGameSnapshot = null;
      scriptCursor = 0;
      scriptedGameActive = false;
      scriptDeviated = false;

      const snap = (data.liveSnapshot && Array.isArray(data.liveSnapshot.cells))
        ? data.liveSnapshot
        : moveHistory[moveHistory.length - 1].snapshotAfter;
      restoreBoardSnapshot(snap);
      updateMoveHistoryDOM();
      try {
        emitEngineEvent('historyChanged', { history: moveHistoryNotation.map((row) => ({ ...row })) });
      } catch (e) {}
      try {
        emitEngineEvent('previewChanged', { previewingPly: null, totalPlies: moveHistory.length });
      } catch (e) {}

      const lastEntry = moveHistory[moveHistory.length - 1];
      if (lastEntry && lastEntry.move) {
        updateLastMoveHighlight(lastEntry.move.fromR, lastEntry.move.fromC, lastEntry.move.toR, lastEntry.move.toC);
      }

      const viewSide = playerColor === 'b' ? 'b' : 'w';
      playerCamSide = viewSide;
      setActiveCamButton('btn-cam-player');
      setCameraForSide(viewSide, false);

      try {
        emitEngineEvent('savedGameRestored', {
          variant: currentVariant,
          timeControl: currentTimeControl,
          difficulty: currentDifficulty,
          playerColor
        });
      } catch (e) {}

      if (!activeCathedralTour) {
        startMatchClocks();
      }
      maybeScheduleAIMove();
      return true;
    }

    // =========================================================================
    // Interactive Move History Position Preview & Undo
    // =========================================================================
    let previewingPly = null;
    let liveGameSnapshot = null;

    function previewHistoryPly(plyIndex) {
      if (isAnimatingMove) return false;
      if (typeof plyIndex !== 'number' || plyIndex < 0 || plyIndex >= moveHistory.length) {
        return returnToLiveGame();
      }

      if (previewingPly === null) {
        liveGameSnapshot = captureBoardSnapshot();
      }

      previewingPly = plyIndex;
      const entry = moveHistory[plyIndex];
      if (entry && entry.snapshotAfter) {
        restoreBoardSnapshot(entry.snapshotAfter);
        if (entry.move) {
          updateLastMoveHighlight(entry.move.fromR, entry.move.fromC, entry.move.toR, entry.move.toC);
        }
      }

      try {
        emitEngineEvent('previewChanged', {
          previewingPly,
          totalPlies: moveHistory.length,
          move: entry ? entry.move : null,
          san: entry ? entry.san : ''
        });
      } catch (e) {}

      return true;
    }

    function returnToLiveGame() {
      if (previewingPly === null) return false;
      previewingPly = null;
      if (liveGameSnapshot) {
        restoreBoardSnapshot(liveGameSnapshot);
        liveGameSnapshot = null;
      }

      if (moveHistory.length > 0) {
        const lastEntry = moveHistory[moveHistory.length - 1];
        if (lastEntry && lastEntry.move) {
          updateLastMoveHighlight(lastEntry.move.fromR, lastEntry.move.fromC, lastEntry.move.toR, lastEntry.move.toC);
        }
      } else {
        clearLastMoveHighlight();
      }

      try {
        emitEngineEvent('previewChanged', { previewingPly: null, totalPlies: moveHistory.length });
      } catch (e) {}

      return true;
    }

    // =========================================================================
    // Draw Rules: Threefold Repetition, Fifty-Move Rule, Insufficient Material
    // (backed by the pure rules core in src/chess/rules.js)
    // =========================================================================
    let repetitionCounts = {};

    const ENGINE_TYPE_TO_CORE = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

    function toCoreBoard() {
      return boardState.map((row) => row.map((p) => (p ? { type: ENGINE_TYPE_TO_CORE[p.type], color: p.color } : null)));
    }

    function buildCoreState(turn = currentTurn) {
      const castling = { w: {}, b: {} };
      for (const color of ['w', 'b']) {
        const home = color === 'w' ? 7 : 0;
        for (let c = 0; c < 8; c++) {
          const p = boardState[home][c];
          if (p && !p.hasMoved && (p.type === 'k' || p.type === 'r')) {
            castling[color][c] = true;
          }
        }
      }
      return {
        board: toCoreBoard(),
        turn,
        castling,
        ep: enPassantTarget ? { r: enPassantTarget.r, c: enPassantTarget.c } : null
      };
    }

    function getHalfmoveClock() {
      let n = 0;
      for (let i = moveHistory.length - 1; i >= 0; i--) {
        const m = moveHistory[i] && moveHistory[i].move;
        if (!m) break;
        if (m.pieceType === 'pawn' || m.capture) break;
        n++;
      }
      return n;
    }

    function getDrawMessage() {
      const t = getTranslations();
      if (coreInsufficientMaterial({ board: toCoreBoard() })) return t.drawInsufficientMaterial;
      if (getHalfmoveClock() >= 100) return t.drawFiftyMoveRule;
      const key = corePositionKey(buildCoreState());
      if ((repetitionCounts[key] || 0) >= 3) return t.drawThreefoldRepetition;
      return null;
    }

    function undoChessMove() {
      if (previewingPly !== null) {
        returnToLiveGame();
      }
      if (isAnimatingMove || moveHistory.length === 0) return false;
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      clearCheckLaserBeams();

      let pliesToUndo = 1;
      if (gameMode === 'single' && currentTurn === playerColor && moveHistory.length >= 2) {
        pliesToUndo = 2;
      }

      let targetSnapshot = null;
      for (let i = 0; i < pliesToUndo; i++) {
        if (moveHistory.length === 0) break;
        const popped = moveHistory.pop();
        targetSnapshot = popped.snapshot;
        if (popped.positionKeyAfter) {
          repetitionCounts[popped.positionKeyAfter] = Math.max(0, (repetitionCounts[popped.positionKeyAfter] || 1) - 1);
        }

        if (moveHistoryNotation.length > 0) {
          const lastRow = moveHistoryNotation[moveHistoryNotation.length - 1];
          if (lastRow.black) {
            lastRow.black = '';
          } else {
            moveHistoryNotation.pop();
          }
        }
      }

      if (targetSnapshot) {
        restoreBoardSnapshot(targetSnapshot);
        if (gameOver) {
          gameOver = false;
          clearCheckmateSequence();
        }
        if (moveHistory.length > 0) {
          const lastEntry = moveHistory[moveHistory.length - 1];
          if (lastEntry && lastEntry.move) {
            updateLastMoveHighlight(lastEntry.move.fromR, lastEntry.move.fromC, lastEntry.move.toR, lastEntry.move.toC);
          } else {
            clearLastMoveHighlight();
          }
        } else {
          clearLastMoveHighlight();
        }
        updateMoveHistoryDOM();
        saveGameToStorage();
        wizardChessAudio.playPiecePlacement(boardToWorld(3, 3), 'pawn');
        return true;
      }
      return false;
    }

    // =========================================================================
    // Game Variants: Fischer Random Chess (Chess960) Generator
    // =========================================================================
    let currentVariant = 'standard'; // 'standard' | 'chess960'
    let currentChess960Layout = null;

    function generateChess960BackRow(layoutIndex = -1) {
      if (layoutIndex < 0 || layoutIndex > 959) {
        layoutIndex = Math.floor(Math.random() * 960);
      }
      let id = layoutIndex;
      const row = new Array(8).fill(null);

      // 1. Dark-square bishop (squares 0, 2, 4, 6)
      const bDarkSquares = [0, 2, 4, 6];
      const b1 = id % 4;
      id = Math.floor(id / 4);
      row[bDarkSquares[b1]] = 'bishop';

      // 2. Light-square bishop (squares 1, 3, 5, 7)
      const bLightSquares = [1, 3, 5, 7];
      const b2 = id % 4;
      id = Math.floor(id / 4);
      row[bLightSquares[b2]] = 'bishop';

      // 3. Queen on one of remaining 6 empty squares
      const qPos = id % 6;
      id = Math.floor(id / 6);
      let emptyCount = 0;
      for (let i = 0; i < 8; i++) {
        if (!row[i]) {
          if (emptyCount === qPos) {
            row[i] = 'queen';
            break;
          }
          emptyCount++;
        }
      }

      // 4. Knights on two of remaining 5 empty squares (10 pairs)
      const knightPairs = [
        [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 2], [1, 3], [1, 4],
        [2, 3], [2, 4],
        [3, 4]
      ];
      const kPair = knightPairs[id];
      let emptyIndices = [];
      for (let i = 0; i < 8; i++) {
        if (!row[i]) emptyIndices.push(i);
      }
      row[emptyIndices[kPair[0]]] = 'knight';
      row[emptyIndices[kPair[1]]] = 'knight';

      // 5. Remaining 3 squares: Rook, King, Rook in that exact order (King is strictly between Rooks)
      emptyIndices = [];
      for (let i = 0; i < 8; i++) {
        if (!row[i]) emptyIndices.push(i);
      }
      row[emptyIndices[0]] = 'rook';
      row[emptyIndices[1]] = 'king';
      row[emptyIndices[2]] = 'rook';

      return { layoutIndex, row };
    }

    // =========================================================================
    // Chess Clocks & Disciplines (Bullet, Blitz, Rapid, Classical, Untimed)
    // TIME_CONTROLS / formatClockTime live in ./chess/timeControls.js (pure module).
    // =========================================================================
    let currentTimeControl = DEFAULT_TIME_CONTROL;
    let clockWhiteSeconds = 600;
    let clockBlackSeconds = 600;
    let isClockRunning = false;
    let clockFlagFallen = false;
    let lastTickSecondW = -1;
    let lastTickSecondB = -1;

    function updateClockDOM() {
      const wEl = document.getElementById('clock-time-w');
      const bEl = document.getElementById('clock-time-b');
      const slotW = document.getElementById('clock-slot-w');
      const slotB = document.getElementById('clock-slot-b');
      if (wEl) wEl.textContent = formatClockTime(clockWhiteSeconds);
      if (bEl) bEl.textContent = formatClockTime(clockBlackSeconds);
      if (slotW && slotB) {
        slotW.classList.toggle('active', currentTurn === 'w' && isClockRunning && !gameOver);
        slotB.classList.toggle('active', currentTurn === 'b' && isClockRunning && !gameOver);
        slotW.classList.toggle('low-time', clockWhiteSeconds <= 30 && clockWhiteSeconds > 10);
        slotW.classList.toggle('critical', clockWhiteSeconds <= 10 && clockWhiteSeconds > 0);
        slotB.classList.toggle('low-time', clockBlackSeconds <= 30 && clockBlackSeconds > 10);
        slotB.classList.toggle('critical', clockBlackSeconds <= 10 && clockBlackSeconds > 0);
      }
    }

    function stepChessClocks(dt) {
      if (gameOver || !isClockRunning || currentTimeControl === 'untimed') return;
      if (currentTurn === 'w') {
        clockWhiteSeconds = Math.max(0, clockWhiteSeconds - dt);
        const wholeSec = Math.floor(clockWhiteSeconds);
        if (wholeSec <= 10 && wholeSec !== lastTickSecondW && wholeSec > 0) {
          lastTickSecondW = wholeSec;
          wizardChessAudio.playClockTick(wholeSec <= 5);
        }
        if (clockWhiteSeconds <= 0 && !clockFlagFallen) {
          clockFlagFallen = true;
          triggerTimeoutVictory('b');
        }
      } else {
        clockBlackSeconds = Math.max(0, clockBlackSeconds - dt);
        const wholeSec = Math.floor(clockBlackSeconds);
        if (wholeSec <= 10 && wholeSec !== lastTickSecondB && wholeSec > 0) {
          lastTickSecondB = wholeSec;
          wizardChessAudio.playClockTick(wholeSec <= 5);
        }
        if (clockBlackSeconds <= 0 && !clockFlagFallen) {
          clockFlagFallen = true;
          triggerTimeoutVictory('w');
        }
      }
      updateClockDOM();
    }

    function triggerTimeoutVictory(winnerColor) {
      gameOver = true;
      isClockRunning = false;
      const t = getTranslations();
      const turnText = document.getElementById('turn-text');
      if (turnText) {
        turnText.textContent = winnerColor === 'w' ? t.timeOutWhiteWins : t.timeOutBlackWins;
      }
      triggerCheckmateSequence(winnerColor === 'w' ? 'b' : 'w', winnerColor);
    }

    function resetChessClocks() {
      const cfg = TIME_CONTROLS[currentTimeControl] || TIME_CONTROLS.rapid_10_0;
      clockWhiteSeconds = cfg.initialSeconds;
      clockBlackSeconds = cfg.initialSeconds;
      isClockRunning = false;
      clockFlagFallen = false;
      lastTickSecondW = -1;
      lastTickSecondB = -1;
      updateClockDOM();
    }

    function setTimeControl(presetKey) {
      if (!TIME_CONTROLS[presetKey]) return;
      currentTimeControl = presetKey;
      resetChessClocks();
    }

    function startMatchClocks() {
      if (currentTimeControl !== 'untimed' && !gameOver) {
        isClockRunning = true;
        updateClockDOM();
      }
    }

    // =========================================================================
    // Cathedral Fly-Through Cinematic Tour & Move 1 Launch
    // =========================================================================
    let activeCathedralTour = null;
    const _tourPosTemp = new THREE.Vector3();
    const _tourLookTemp = new THREE.Vector3();

    function startCathedralTour(onComplete) {
      if (isAnimatingMove) return false;
      if (activeCamTransition) activeCamTransition = null;

      const wasClockRunning = isClockRunning;
      isClockRunning = false;
      updateClockDOM();

      const zSign = playerColor === 'b' ? -1 : 1;
      const finalPlayerPos = new THREE.Vector3(0, 2.22, zSign * 2.72);
      const finalPlayerLook = new THREE.Vector3(0, 0.85, zSign * -0.15);

      // Stately 7.5s Catmull-Rom nave fly-through:
      // P0: High vault vista near cathedral stained glass windows overlooking the grand nave
      // P1: Mid-nave gentle glide between gothic stone colonnades and lantern chandeliers
      // P2: Sweeping approach past flickering stone braziers towards the altar and chessboard
      // P3: Low-angle dramatic entry framing the opposing army
      // P4: Sharp kinetic snap dive into player battle command perspective
      const posPoints = [
        new THREE.Vector3(0.0, 7.20, -13.0 * zSign),
        new THREE.Vector3(0.38 * zSign, 5.40, -8.0 * zSign),
        new THREE.Vector3(-0.25 * zSign, 3.80, -3.2 * zSign),
        new THREE.Vector3(0.12 * zSign, 2.85, 0.8 * zSign),
        finalPlayerPos
      ];

      const lookPoints = [
        new THREE.Vector3(0.0, 3.20, -2.5 * zSign),
        new THREE.Vector3(0.0, 2.20, -0.5 * zSign),
        new THREE.Vector3(0.0, 1.25, 0.0),
        new THREE.Vector3(0.0, 0.95, -0.1 * zSign),
        finalPlayerLook
      ];

      const posCurve = new THREE.CatmullRomCurve3(posPoints, false, 'centripetal');
      const lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'centripetal');

      orbitControls.enabled = false;
      posCurve.getPoint(0, _tourPosTemp);
      lookCurve.getPoint(0, _tourLookTemp);
      camera.position.copy(_tourPosTemp);
      orbitControls.target.copy(_tourLookTemp);
      camera.lookAt(orbitControls.target);

      activeCathedralTour = {
        elapsed: 0,
        duration: 7.5,
        posCurve,
        lookCurve,
        wasClockRunning,
        onComplete
      };

      try {
      emitEngineEvent('tourStarted', {});
      } catch (e) {}

      return true;
    }

    function stepCathedralTour(dt) {
      if (!activeCathedralTour) return;
      activeCathedralTour.elapsed += dt;
      const progress = Math.min(1, activeCathedralTour.elapsed / activeCathedralTour.duration);

      // Two-phase cinematic trajectory:
      // Phase 1 (0% - 80% / 0s - 6.0s): Smooth, stately cruise along the cathedral nave from high lancet windows past pillars & braziers
      // Phase 2 (80% - 100% / 6.0s - 7.5s): Dramatic kinetic acceleration dive sweeping directly into the player's battle view
      let u = 0;
      if (progress <= 0.80) {
        const norm = progress / 0.80;
        // Stately smoothstep glide covering the first 70% of the nave
        u = 0.70 * (norm * norm * (3 - 2 * norm));
      } else {
        const norm = (progress - 0.80) / 0.20;
        // Dynamic cubic ease-out dive onto the board for the final 30%
        const diveEase = 1 - Math.pow(1 - norm, 3);
        u = 0.70 + 0.30 * diveEase;
      }
      u = Math.max(0, Math.min(1, u));

      activeCathedralTour.posCurve.getPoint(u, _tourPosTemp);
      activeCathedralTour.lookCurve.getPoint(u, _tourLookTemp);

      camera.position.copy(_tourPosTemp);
      orbitControls.target.copy(_tourLookTemp);
      camera.lookAt(orbitControls.target);

      if (progress >= 1) {
        endCathedralTour(false);
      }
    }

    function endCathedralTour(immediate = false) {
      if (!activeCathedralTour) return;
      const tour = activeCathedralTour;
      activeCathedralTour = null;

      const zSign = playerColor === 'b' ? -1 : 1;
      const finalPlayerPos = new THREE.Vector3(0, 2.22, zSign * 2.72);
      const finalPlayerLook = new THREE.Vector3(0, 0.85, zSign * -0.15);

      camera.position.copy(finalPlayerPos);
      orbitControls.target.copy(finalPlayerLook);
      camera.lookAt(orbitControls.target);
      orbitControls.enabled = true;
      orbitControls.update();

      // Resonant landing tactile thud
      wizardChessAudio.playPiecePlacement(boardToWorld(3, 3), 'king');

      // Start chess clocks for move 1!
      startMatchClocks();

      setActiveCamButton('btn-cam-player');
      updateOrbitControlsLock('player');

      if (typeof tour.onComplete === 'function') {
        try {
          tour.onComplete();
        } catch (e) {}
      }

      try {
      emitEngineEvent('tourFinished', { openMenu: true, immediate });
      } catch (e) {}
    }

    function resetChessBoard(orientCamera = true, preserveScript = false) {
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      preMoveHighlightTask = null;
      activeMoveTweens.length = 0;
      clearCheckmateSequence();
      clearCheckLaserBeams();
      resetChessClocks();
      if (activeDuelSavedCam) {
        camera.position.copy(activeDuelSavedCam.pos);
        orbitControls.target.copy(activeDuelSavedCam.target);
        activeDuelSavedCam = null;
      }
      orbitControls.enabled = true;
      clearAllPieces();
      clearSquareHighlights();
      selectedSquare = null;
      validMoves = [];
      currentTurn = 'w';
      isAnimatingMove = false;
      gameOver = false;
      enPassantTarget = null;
      capturedByWhite = 0;
      capturedByBlack = 0;
      previewingPly = null;
      liveGameSnapshot = null;
      clearLastMoveHighlight();
      moveHistory = [];
      moveHistoryNotation.length = 0;
      updateMoveHistoryDOM();
      try {
        emitEngineEvent('previewChanged', { previewingPly: null, totalPlies: 0 });
      } catch (e) {}
      scriptDeviated = false;
      if (!preserveScript) {
        scriptCursor = 0;
      }

      let backRow = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
      if (currentVariant === 'chess960') {
        if (!currentChess960Layout) {
          currentChess960Layout = generateChess960BackRow();
        }
        backRow = currentChess960Layout.row;
      }

      for (let c = 0; c < 8; c++) {
        boardState[7][c] = instantiatePiece(backRow[c], 'w', 7, c);
        boardState[6][c] = instantiatePiece('pawn', 'w', 6, c);
        boardState[1][c] = instantiatePiece('pawn', 'b', 1, c);
        boardState[0][c] = instantiatePiece(backRow[c], 'b', 0, c);
      }

      repetitionCounts = {};
      const initialPositionKey = corePositionKey(buildCoreState('w'));
      repetitionCounts[initialPositionKey] = 1;

      if (orientCamera) {
        const viewSide = playerColor === 'b' ? 'b' : 'w';
        playerCamSide = viewSide;
        setActiveCamButton('btn-cam-player');
        setCameraForSide(viewSide, false);
      }

      renderer.shadowMap.needsUpdate = true;
      updateTurnUI();
      if (typeof updateScriptBarUI === 'function') updateScriptBarUI();
      if (!activeCathedralTour) {
        startMatchClocks();
      }
      maybeScheduleAIMove();
    }

    // =========================================================================
    // Legal Chess Move Generation (Including Check Filtering)
    // =========================================================================
    function getPseudoMovesForPiece(r, c, board = boardState) {
      const piece = board[r][c];
      if (!piece) return [];
      const moves = [];
      const { type, color } = piece;
      const dir = color === 'w' ? -1 : 1;

      const inBounds = (nr, nc) => nr >= 0 && nr < 8 && nc >= 0 && nc < 8;
      const addMove = (nr, nc) => {
        if (!inBounds(nr, nc)) return false;
        const target = board[nr][nc];
        if (!target) {
          moves.push({ r: nr, c: nc, capture: false });
          return true;
        } else if (target.color !== color) {
          moves.push({ r: nr, c: nc, capture: true });
          return false;
        }
        return false;
      };

      if (type === 'pawn') {
        if (inBounds(r + dir, c) && !board[r + dir][c]) {
          moves.push({ r: r + dir, c, capture: false });
          const startRow = color === 'w' ? 6 : 1;
          if (r === startRow && !board[r + dir * 2][c]) {
            moves.push({ r: r + dir * 2, c, capture: false });
          }
        }
        for (const dc of [-1, 1]) {
          if (inBounds(r + dir, c + dc)) {
            const target = board[r + dir][c + dc];
            if (target && target.color !== color) {
              moves.push({ r: r + dir, c: c + dc, capture: true });
            } else if (
              !target &&
              enPassantTarget &&
              enPassantTarget.r === r + dir &&
              enPassantTarget.c === c + dc &&
              enPassantTarget.color !== color
            ) {
              moves.push({
                r: r + dir,
                c: c + dc,
                capture: true,
                isEnPassant: true,
                capturedPawnR: enPassantTarget.pawnR,
                capturedPawnC: enPassantTarget.pawnC
              });
            }
          }
        }
      } else if (type === 'knight') {
        const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of jumps) addMove(r + dr, c + dc);
      } else if (type === 'king') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr !== 0 || dc !== 0) addMove(r + dr, c + dc);
          }
        }
      } else {
        const dirs = [];
        if (type === 'rook' || type === 'queen') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
        if (type === 'bishop' || type === 'queen') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
        for (const [dr, dc] of dirs) {
          for (let step = 1; step < 8; step++) {
            if (!addMove(r + dr * step, c + dc * step)) break;
          }
        }
      }
      return moves;
    }

    function doesPieceAttackSquare(piece, fromR, fromC, targetR, targetC, board = boardState) {
      if (!piece || (fromR === targetR && fromC === targetC)) return false;
      const { type, color } = piece;

      if (type === 'pawn') {
        const dir = color === 'w' ? -1 : 1;
        // Pawns strictly attack only diagonally forward
        return targetR === fromR + dir && (targetC === fromC - 1 || targetC === fromC + 1);
      }

      if (type === 'knight') {
        const dr = Math.abs(targetR - fromR);
        const dc = Math.abs(targetC - fromC);
        return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
      }

      if (type === 'king') {
        return Math.max(Math.abs(targetR - fromR), Math.abs(targetC - fromC)) === 1;
      }

      if (type === 'bishop' || type === 'rook' || type === 'queen') {
        const dr = targetR - fromR;
        const dc = targetC - fromC;
        const absDr = Math.abs(dr);
        const absDc = Math.abs(dc);

        const isDiagonal = absDr === absDc && absDr > 0;
        const isStraight = (dr === 0 && absDc > 0) || (dc === 0 && absDr > 0);

        if (type === 'bishop' && !isDiagonal) return false;
        if (type === 'rook' && !isStraight) return false;
        if (type === 'queen' && !isDiagonal && !isStraight) return false;

        const stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
        const stepC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);

        let curR = fromR + stepR;
        let curC = fromC + stepC;
        while (curR !== targetR || curC !== targetC) {
          if (curR < 0 || curR >= 8 || curC < 0 || curC >= 8) return false;
          if (board[curR][curC]) return false; // Intervening piece blocks attack path
          curR += stepR;
          curC += stepC;
        }
        return true;
      }

      return false;
    }

    function isKingInCheck(color, board = boardState) {
      let kingR = -1;
      let kingC = -1;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.color === color && p.type === 'king') {
            kingR = r;
            kingC = c;
            break;
          }
        }
        if (kingR !== -1) break;
      }
      if (kingR === -1) return true;
      const oppColor = color === 'w' ? 'b' : 'w';
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.color === oppColor) {
            if (doesPieceAttackSquare(p, r, c, kingR, kingC, board)) {
              return true;
            }
          }
        }
      }
      return false;
    }

    function getCheckAttackers(color, board = boardState) {
      let kingR = -1;
      let kingC = -1;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.color === color && p.type === 'king') {
            kingR = r;
            kingC = c;
            break;
          }
        }
        if (kingR !== -1) break;
      }
      if (kingR === -1) return [];
      const oppColor = color === 'w' ? 'b' : 'w';
      const attackers = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.color === oppColor) {
            if (doesPieceAttackSquare(p, r, c, kingR, kingC, board)) {
              attackers.push({ r, c, piece: p });
            }
          }
        }
      }
      return attackers;
    }

    // =========================================================================
    // King Check Threat VFX: Pulsing Crimson Flame Aura & Ascending Ember Sparks
    // =========================================================================
    let activeKingThreatAura = null;

    function createFlameAuraTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 256, 0, 0);
      grad.addColorStop(0.0, 'rgba(255, 10, 45, 0.95)');
      grad.addColorStop(0.25, 'rgba(255, 65, 0, 0.88)');
      grad.addColorStop(0.65, 'rgba(255, 140, 0, 0.55)');
      grad.addColorStop(0.90, 'rgba(180, 0, 30, 0.20)');
      grad.addColorStop(1.0, 'rgba(40, 0, 10, 0.0)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 256);

      ctx.fillStyle = 'rgba(255, 230, 150, 0.35)';
      for (let i = 0; i < 8; i++) {
        const x = 16 + i * 14;
        ctx.beginPath();
        ctx.moveTo(x, 256);
        ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 20, 140, x + (Math.random() - 0.5) * 10, 30);
        ctx.lineTo(x + 4, 30);
        ctx.quadraticCurveTo(x + 4 + (Math.random() - 0.5) * 15, 140, x + 6, 256);
        ctx.fill();
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    function createEmberSparkTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      const radGrad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      radGrad.addColorStop(0.0, 'rgba(255, 255, 220, 1.0)');
      radGrad.addColorStop(0.2, 'rgba(255, 180, 40, 0.95)');
      radGrad.addColorStop(0.5, 'rgba(255, 50, 20, 0.75)');
      radGrad.addColorStop(0.85, 'rgba(180, 0, 30, 0.25)');
      radGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, 64, 64);

      return new THREE.CanvasTexture(canvas);
    }

    const flameAuraTexture = createFlameAuraTexture();
    const emberSparkTexture = createEmberSparkTexture();

    function createKingThreatAura(kWorld) {
      const auraGroup = new THREE.Group();
      checkLaserGroup.add(auraGroup);

      // 1. Outer Pulsing Crimson Flame Aura Cylinder
      const flameGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.65, 24, 1, true);
      const flameMat = new THREE.MeshBasicMaterial({
        map: flameAuraTexture,
        color: 0xff1e3a,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const flameMesh = new THREE.Mesh(flameGeo, flameMat);
      flameMesh.position.set(kWorld.x, BOARD_SURFACE_Y + 0.32, kWorld.z);
      auraGroup.add(flameMesh);

      // 2. Inner Counter-Rotating Fiery Orange Flame Cylinder
      const innerFlameGeo = new THREE.CylinderGeometry(0.12, 0.17, 0.58, 20, 1, true);
      const innerFlameMat = new THREE.MeshBasicMaterial({
        map: flameAuraTexture,
        color: 0xff4800,
        transparent: true,
        opacity: 0.68,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const innerFlameMesh = new THREE.Mesh(innerFlameGeo, innerFlameMat);
      innerFlameMesh.position.set(kWorld.x, BOARD_SURFACE_Y + 0.29, kWorld.z);
      auraGroup.add(innerFlameMesh);

      // 3. Ground Runic Threat Sigil Flare Ring
      const sigilGeo = new THREE.RingGeometry(0.165, 0.25, 36);
      sigilGeo.rotateX(-Math.PI / 2);
      const sigilMat = new THREE.MeshBasicMaterial({
        color: 0xff002b,
        transparent: true,
        opacity: 0.70,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sigilMesh = new THREE.Mesh(sigilGeo, sigilMat);
      sigilMesh.position.set(kWorld.x, BOARD_SURFACE_Y + 0.014, kWorld.z);
      auraGroup.add(sigilMesh);

      // 4. Ascending Ember Sparks Particle System (36 particles)
      const emberCount = 36;
      const emberPositions = new Float32Array(emberCount * 3);
      const emberColors = new Float32Array(emberCount * 3);
      const emberData = [];

      for (let i = 0; i < emberCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.06 + Math.random() * 0.15;
        const y = BOARD_SURFACE_Y + 0.02 + Math.random() * 0.55;

        emberPositions[i * 3 + 0] = kWorld.x + Math.cos(angle) * radius;
        emberPositions[i * 3 + 1] = y;
        emberPositions[i * 3 + 2] = kWorld.z + Math.sin(angle) * radius;

        emberColors[i * 3 + 0] = 1.0;
        emberColors[i * 3 + 1] = 0.2 + Math.random() * 0.55;
        emberColors[i * 3 + 2] = 0.02 + Math.random() * 0.08;

        emberData.push({
          angle,
          radius,
          y,
          vy: 0.25 + Math.random() * 0.35,
          vTheta: (Math.random() > 0.5 ? 1 : -1) * (1.8 + Math.random() * 2.5),
          age: Math.random() * 1.5,
          lifespan: 1.4 + Math.random() * 1.2
        });
      }

      const emberGeo = new THREE.BufferGeometry();
      emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
      emberGeo.setAttribute('color', new THREE.BufferAttribute(emberColors, 3));

      const emberMat = new THREE.PointsMaterial({
        size: 0.038,
        vertexColors: true,
        map: emberSparkTexture,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const emberPoints = new THREE.Points(emberGeo, emberMat);
      auraGroup.add(emberPoints);

      activeKingThreatAura = {
        auraGroup,
        kWorld,
        flameMesh,
        innerFlameMesh,
        sigilMesh,
        emberPoints,
        emberGeo,
        emberPositions,
        emberData,
        emberCount
      };

      return activeKingThreatAura;
    }

    function stepKingThreatAura(dt, elapsed) {
      if (!activeKingThreatAura) return;
      const {
        kWorld,
        flameMesh,
        innerFlameMesh,
        sigilMesh,
        emberGeo,
        emberPositions,
        emberData,
        emberCount
      } = activeKingThreatAura;

      flameMesh.rotation.y += dt * 1.4;
      const pulseScale = 1.0 + Math.sin(elapsed * 11.0) * 0.08;
      flameMesh.scale.set(pulseScale, 1.0 + Math.sin(elapsed * 8.0) * 0.04, pulseScale);
      flameMesh.material.opacity = 0.72 + Math.sin(elapsed * 13.0) * 0.18;

      innerFlameMesh.rotation.y -= dt * 2.1;
      innerFlameMesh.material.opacity = 0.60 + Math.sin(elapsed * 16.0 + 1.2) * 0.20;

      sigilMesh.rotation.z += dt * 0.5;
      sigilMesh.material.opacity = 0.55 + Math.sin(elapsed * 7.0) * 0.22;

      for (let i = 0; i < emberCount; i++) {
        const d = emberData[i];
        d.age += dt;
        d.y += d.vy * dt;
        d.angle += d.vTheta * dt;

        if (d.y > BOARD_SURFACE_Y + 0.68 || d.age > d.lifespan) {
          d.y = BOARD_SURFACE_Y + 0.02 + Math.random() * 0.04;
          d.age = 0;
          d.angle = Math.random() * Math.PI * 2;
          d.radius = 0.05 + Math.random() * 0.15;
          d.vy = 0.25 + Math.random() * 0.35;
        }

        emberPositions[i * 3 + 0] = kWorld.x + Math.cos(d.angle) * d.radius;
        emberPositions[i * 3 + 1] = d.y;
        emberPositions[i * 3 + 2] = kWorld.z + Math.sin(d.angle) * d.radius;
      }
      emberGeo.attributes.position.needsUpdate = true;
    }

    function clearCheckLaserBeams() {
      while (checkLaserGroup.children.length > 0) {
        checkLaserGroup.remove(checkLaserGroup.children[0]);
      }
      if (checkLaserAlertLight) {
        scene.remove(checkLaserAlertLight);
        checkLaserAlertLight = null;
      }
      activeKingThreatAura = null;
      activeCheckBeams = [];
    }

    function showCheckLaserBeams(color, attackers) {
      clearCheckLaserBeams();
      if (!attackers || attackers.length === 0) return;

      let kingR = -1;
      let kingC = -1;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = boardState[r][c];
          if (p && p.color === color && p.type === 'king') {
            kingR = r;
            kingC = c;
            break;
          }
        }
      }
      if (kingR === -1) return;

      const kWorld = boardToWorld(kingR, kingC);
      const kTarget = new THREE.Vector3(kWorld.x, BOARD_SURFACE_Y + 0.36, kWorld.z);

      // Warning crimson rune circle beneath the endangered King
      const warningRingGeo = new THREE.RingGeometry(0.12, 0.165, 36);
      warningRingGeo.rotateX(-Math.PI / 2);
      const warningRingMat = new THREE.MeshBasicMaterial({
        color: 0xff1028,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88
      });
      const warningRing = new THREE.Mesh(warningRingGeo, warningRingMat);
      warningRing.position.set(kWorld.x, BOARD_SURFACE_Y + 0.012, kWorld.z);
      checkLaserGroup.add(warningRing);

      // Add dynamic pulsating crimson alert point light
      checkLaserAlertLight = new THREE.PointLight(0xff1234, 3.8, 2.4);
      checkLaserAlertLight.position.copy(kTarget);
      scene.add(checkLaserAlertLight);

      // Attach 3D Pulsing Crimson Flame Threat Aura & Ascending Ember Sparks
      createKingThreatAura(kWorld);

      for (const att of attackers) {
        const aWorld = boardToWorld(att.r, att.c);
        const aOrigin = new THREE.Vector3(aWorld.x, BOARD_SURFACE_Y + 0.28, aWorld.z);

        const delta = new THREE.Vector3().subVectors(kTarget, aOrigin);
        const dist = delta.length();
        if (dist < 0.01) continue;

        const dir = delta.clone().normalize();
        const mid = new THREE.Vector3().addVectors(aOrigin, kTarget).multiplyScalar(0.5);

        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

        // 1. High-intensity concentrated crimson beam core
        const coreGeo = new THREE.CylinderGeometry(0.013, 0.013, dist, 12);
        const coreMat = new THREE.MeshBasicMaterial({
          color: 0xff1e38,
          transparent: true,
          opacity: 0.94
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.copy(mid);
        coreMesh.quaternion.copy(quat);
        checkLaserGroup.add(coreMesh);

        // 2. Outer glowing additive blooming aura
        const haloGeo = new THREE.CylinderGeometry(0.040, 0.040, dist, 12);
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0xff0038,
          transparent: true,
          opacity: 0.44,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const haloMesh = new THREE.Mesh(haloGeo, haloMat);
        haloMesh.position.copy(mid);
        haloMesh.quaternion.copy(quat);
        checkLaserGroup.add(haloMesh);

        activeCheckBeams.push({ core: coreMesh, halo: haloMesh, ring: warningRing });
      }
    }


    function getLegalMovesForPiece(r, c) {
      const piece = boardState[r][c];
      if (!piece) return [];
      const pseudo = getPseudoMovesForPiece(r, c, boardState);
      const legal = [];
      for (const m of pseudo) {
        const savedTarget = boardState[m.r][m.c];
        let savedEpPawn = null;
        if (m.isEnPassant) {
          savedEpPawn = boardState[m.capturedPawnR][m.capturedPawnC];
          boardState[m.capturedPawnR][m.capturedPawnC] = null;
        }
        boardState[m.r][m.c] = piece;
        boardState[r][c] = null;
        const inCheck = isKingInCheck(piece.color, boardState);
        boardState[r][c] = piece;
        boardState[m.r][m.c] = savedTarget;
        if (m.isEnPassant) {
          boardState[m.capturedPawnR][m.capturedPawnC] = savedEpPawn;
        }
        if (!inCheck) legal.push(m);
      }

      // Castling (Kingside O-O to c=6, Queenside O-O-O to c=2)
      const homeRow = piece.color === 'w' ? 7 : 0;
      if (
        piece.type === 'king' &&
        !piece.hasMoved &&
        r === homeRow &&
        c === 4 &&
        !isKingInCheck(piece.color, boardState)
      ) {
        // Kingside (O-O: King e->g [4->6], Rook h->f [7->5])
        const kRook = boardState[homeRow][7];
        if (
          kRook &&
          kRook.type === 'rook' &&
          kRook.color === piece.color &&
          !kRook.hasMoved &&
          !boardState[homeRow][5] &&
          !boardState[homeRow][6]
        ) {
          boardState[homeRow][5] = piece;
          boardState[homeRow][4] = null;
          const checkF = isKingInCheck(piece.color, boardState);
          boardState[homeRow][6] = piece;
          boardState[homeRow][5] = null;
          const checkG = isKingInCheck(piece.color, boardState);
          boardState[homeRow][4] = piece;
          boardState[homeRow][6] = null;
          if (!checkF && !checkG) {
            legal.push({ r: homeRow, c: 6, capture: false, castle: 'k', rookFromC: 7, rookToC: 5 });
          }
        }
        // Queenside (O-O-O: King e->c [4->2], Rook a->d [0->3])
        const qRook = boardState[homeRow][0];
        if (
          qRook &&
          qRook.type === 'rook' &&
          qRook.color === piece.color &&
          !qRook.hasMoved &&
          !boardState[homeRow][1] &&
          !boardState[homeRow][2] &&
          !boardState[homeRow][3]
        ) {
          boardState[homeRow][3] = piece;
          boardState[homeRow][4] = null;
          const checkD = isKingInCheck(piece.color, boardState);
          boardState[homeRow][2] = piece;
          boardState[homeRow][3] = null;
          const checkC = isKingInCheck(piece.color, boardState);
          boardState[homeRow][4] = piece;
          boardState[homeRow][2] = null;
          if (!checkD && !checkC) {
            legal.push({ r: homeRow, c: 2, capture: false, castle: 'q', rookFromC: 0, rookToC: 3 });
          }
        }
      }

      return legal;
    }

    function getAllLegalMoves(color) {
      const all = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = boardState[r][c];
          if (p && p.color === color) {
            const moves = getLegalMovesForPiece(r, c);
            for (const m of moves) {
              all.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, capture: m.capture });
            }
          }
        }
      }
      return all;
    }

    // =========================================================================
    // Square Highlights & Last Move Markers
    // =========================================================================
    const lastMoveTileTexture = (() => {
      const size = 128;
      const cvs = document.createElement('canvas');
      cvs.width = size;
      cvs.height = size;
      const ctx = cvs.getContext('2d');

      // Warm translucent amber/gold surface wash
      ctx.fillStyle = 'rgba(223, 183, 67, 0.28)';
      ctx.fillRect(0, 0, size, size);

      // Radiant gold perimeter border
      ctx.strokeStyle = 'rgba(250, 220, 110, 0.90)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, size - 6, size - 6);

      // Subtle gothic corner brackets
      ctx.fillStyle = 'rgba(255, 245, 175, 0.98)';
      const corner = 14;
      ctx.fillRect(3, 3, corner, 4);
      ctx.fillRect(3, 3, 4, corner);
      ctx.fillRect(size - 3 - corner, 3, corner, 4);
      ctx.fillRect(size - 7, 3, 4, corner);
      ctx.fillRect(3, size - 7, corner, 4);
      ctx.fillRect(3, size - 3 - corner, 4, corner);
      ctx.fillRect(size - 3 - corner, size - 7, corner, 4);
      ctx.fillRect(size - 7, size - 3 - corner, 4, corner);

      const tex = new THREE.CanvasTexture(cvs);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    })();

    function clearLastMoveHighlight() {
      while (lastMoveHighlightsGroup.children.length > 0) {
        lastMoveHighlightsGroup.remove(lastMoveHighlightsGroup.children[0]);
      }
    }

    function updateLastMoveHighlight(fromR, fromC, toR, toC) {
      clearLastMoveHighlight();
      if (fromR == null || fromC == null || toR == null || toC == null) return;
      if (fromR < 0 || fromR > 7 || fromC < 0 || fromC > 7) return;
      if (toR < 0 || toR > 7 || toC < 0 || toC > 7) return;

      const sqSize = BOARD_SQ_SIZE * 0.97;
      const geo = new THREE.PlaneGeometry(sqSize, sqSize);
      geo.rotateX(-Math.PI / 2);

      // Source square (from)
      const fromPos = boardToWorld(fromR, fromC);
      const fromMat = new THREE.MeshBasicMaterial({
        map: lastMoveTileTexture,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const fromMesh = new THREE.Mesh(geo, fromMat);
      fromMesh.position.set(fromPos.x, BOARD_SURFACE_Y + 0.005, fromPos.z);
      lastMoveHighlightsGroup.add(fromMesh);

      // Target square (to)
      const toPos = boardToWorld(toR, toC);
      const toMat = new THREE.MeshBasicMaterial({
        map: lastMoveTileTexture,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const toMesh = new THREE.Mesh(geo, toMat);
      toMesh.position.set(toPos.x, BOARD_SURFACE_Y + 0.005, toPos.z);
      lastMoveHighlightsGroup.add(toMesh);
    }

    function clearSquareHighlights() {
      while (squareHighlightsGroup.children.length > 0) {
        squareHighlightsGroup.remove(squareHighlightsGroup.children[0]);
      }
    }

    function showSquareHighlights(r, c, moves) {
      clearSquareHighlights();

      // Selected piece square highlight ring
      const selGeo = new THREE.RingGeometry(0.115, 0.155, 32);
      selGeo.rotateX(-Math.PI / 2);
      const selMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e, side: THREE.DoubleSide });
      const selMesh = new THREE.Mesh(selGeo, selMat);
      const selPos = boardToWorld(r, c);
      selMesh.position.set(selPos.x, BOARD_SURFACE_Y + 0.01, selPos.z);
      squareHighlightsGroup.add(selMesh);

      // Soft luminous disc beneath selected piece
      const selDiscGeo = new THREE.CircleGeometry(0.115, 24);
      selDiscGeo.rotateX(-Math.PI / 2);
      const selDiscMat = new THREE.MeshBasicMaterial({
        color: 0xdfb743,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide
      });
      const selDiscMesh = new THREE.Mesh(selDiscGeo, selDiscMat);
      selDiscMesh.position.set(selPos.x, BOARD_SURFACE_Y + 0.008, selPos.z);
      squareHighlightsGroup.add(selDiscMesh);

      for (const m of moves) {
        const pos = boardToWorld(m.r, m.c);
        if (m.capture) {
          // Capture target: striking ruby danger ring + threat disc
          const capGeo = new THREE.RingGeometry(0.12, 0.165, 32);
          capGeo.rotateX(-Math.PI / 2);
          const capMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
          const capMesh = new THREE.Mesh(capGeo, capMat);
          capMesh.position.set(pos.x, BOARD_SURFACE_Y + 0.012, pos.z);
          squareHighlightsGroup.add(capMesh);

          const capDiscGeo = new THREE.CircleGeometry(0.118, 24);
          capDiscGeo.rotateX(-Math.PI / 2);
          const capDiscMat = new THREE.MeshBasicMaterial({
            color: 0xb91c1c,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide
          });
          const capDiscMesh = new THREE.Mesh(capDiscGeo, capDiscMat);
          capDiscMesh.position.set(pos.x, BOARD_SURFACE_Y + 0.011, pos.z);
          squareHighlightsGroup.add(capDiscMesh);
        } else {
          // Quiet move: luminous sapphire bead with soft outer halo
          const dotGeo = new THREE.CircleGeometry(0.045, 24);
          dotGeo.rotateX(-Math.PI / 2);
          const dotMat = new THREE.MeshBasicMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide
          });
          const dotMesh = new THREE.Mesh(dotGeo, dotMat);
          dotMesh.position.set(pos.x, BOARD_SURFACE_Y + 0.011, pos.z);
          squareHighlightsGroup.add(dotMesh);

          const haloGeo = new THREE.RingGeometry(0.045, 0.08, 24);
          haloGeo.rotateX(-Math.PI / 2);
          const haloMat = new THREE.MeshBasicMaterial({
            color: 0x0284c7,
            transparent: true,
            opacity: 0.60,
            side: THREE.DoubleSide
          });
          const haloMesh = new THREE.Mesh(haloGeo, haloMat);
          haloMesh.position.set(pos.x, BOARD_SURFACE_Y + 0.010, pos.z);
          squareHighlightsGroup.add(haloMesh);
        }
      }
    }

    // =========================================================================
    // Arcane Dissolve & Sacred Runic VFX Engine
    // =========================================================================
    // Procedural 512x512 Sacred Altar Runic Summoning Seal
    const arcaneRuneTexture = (() => {
      const size = 512;
      const cvs = document.createElement('canvas');
      cvs.width = size;
      cvs.height = size;
      const ctx = cvs.getContext('2d');
      const c = size / 2;
      ctx.clearRect(0, 0, size, size);

      // Ethereal golden ambient radial glow
      const glow = ctx.createRadialGradient(c, c, size * 0.15, c, c, size * 0.495);
      glow.addColorStop(0, 'rgba(255, 225, 110, 0.35)');
      glow.addColorStop(0.45, 'rgba(218, 165, 32, 0.22)');
      glow.addColorStop(0.85, 'rgba(180, 110, 15, 0.08)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.495, 0, Math.PI * 2);
      ctx.fill();

      // Outer sacred boundary rings with warm golden bloom
      ctx.strokeStyle = '#ffe484';
      ctx.shadowColor = '#f5c040';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.418, 0, Math.PI * 2);
      ctx.stroke();

      // Outer radial calendar / astrological tick marks
      for (let i = 0; i < 48; i++) {
        const angle = (i / 48) * Math.PI * 2;
        const r1 = i % 4 === 0 ? size * 0.395 : size * 0.422;
        const r2 = size * 0.446;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(angle) * r1, c + Math.sin(angle) * r1);
        ctx.lineTo(c + Math.cos(angle) * r2, c + Math.sin(angle) * r2);
        ctx.stroke();
      }

      // Middle inscribed arcane circle
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.33, 0, Math.PI * 2);
      ctx.stroke();

      // 12 Ancient Gothic Runes around the circle
      ctx.fillStyle = '#fff4bc';
      ctx.font = 'bold 22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const runes = ['᚛', '᚜', 'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᛝ'];
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const rx = c + Math.cos(angle) * (size * 0.374);
        const ry = c + Math.sin(angle) * (size * 0.374);
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillText(runes[i], 0, 0);
        ctx.restore();
      }

      // 8-Pointed Arcane Octagram / Star of Sanctum
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#ffd766';
      for (const offset of [0, Math.PI / 4]) {
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = offset + (i / 4) * Math.PI * 2;
          const x = c + Math.cos(a) * (size * 0.285);
          const y = c + Math.sin(a) * (size * 0.285);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // Inner sacred sanctum circle
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.13, 0, Math.PI * 2);
      ctx.stroke();

      // Central glowing runic node
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c, c, 5.5, 0, Math.PI * 2);
      ctx.fill();

      const tex = new THREE.CanvasTexture(cvs);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    })();

    // Procedural 128x128 Radiant Arcane Spark & Ember Texture
    const arcaneSparkTexture = (() => {
      const size = 128;
      const cvs = document.createElement('canvas');
      cvs.width = size;
      cvs.height = size;
      const ctx = cvs.getContext('2d');
      const c = size / 2;

      const grad = ctx.createRadialGradient(c, c, 0, c, c, size * 0.49);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.16, 'rgba(255, 230, 120, 0.95)');
      grad.addColorStop(0.42, 'rgba(245, 165, 35, 0.60)');
      grad.addColorStop(0.72, 'rgba(215, 80, 10, 0.20)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c, c, size * 0.49, 0, Math.PI * 2);
      ctx.fill();

      // Incandescent 4-point lens glint
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(c - 20, c);
      ctx.lineTo(c + 20, c);
      ctx.moveTo(c, c - 20);
      ctx.lineTo(c, c + 20);
      ctx.stroke();

      const tex = new THREE.CanvasTexture(cvs);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    })();

    // Shared Additive Sprite Materials for Particle Vortex
    const sparkMatGold = new THREE.SpriteMaterial({
      map: arcaneSparkTexture,
      color: 0xffdf78,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sparkMatAmber = new THREE.SpriteMaterial({
      map: arcaneSparkTexture,
      color: 0xff9924,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sparkMatCore = new THREE.SpriteMaterial({
      map: arcaneSparkTexture,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sparkMatAzure = new THREE.SpriteMaterial({
      map: arcaneSparkTexture,
      color: 0x82c8ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const runePlaneGeo = new THREE.PlaneGeometry(BOARD_SQ_SIZE * 1.95, BOARD_SQ_SIZE * 1.95);
    runePlaneGeo.rotateX(-Math.PI / 2);

    function spawnArcaneRuneCircle(worldPos) {
      const mat = new THREE.MeshBasicMaterial({
        map: arcaneRuneTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(runePlaneGeo, mat);
      mesh.position.set(worldPos.x, BOARD_SURFACE_Y + 0.003, worldPos.z);
      mesh.scale.set(0.35, 1, 0.35);
      scene.add(mesh);

      activeRuneCircles.push({
        mesh,
        mat,
        life: 1.5,
        maxLife: 1.5
      });
    }

    function spawnContactSparks(contactPos, dirX, dirZ) {
      const count = 14;
      for (let i = 0; i < count; i++) {
        const spMat = i % 3 === 0 ? sparkMatCore : (i % 2 === 0 ? sparkMatGold : sparkMatAmber);
        const sprite = new THREE.Sprite(spMat);
        sprite.position.copy(contactPos);
        const sz = 0.028 + Math.random() * 0.038;
        sprite.scale.set(sz, sz, 1);
        scene.add(sprite);

        // Sparks spray perpendicular and away from the cut
        const sprayAngle = Math.atan2(dirZ, dirX) + (Math.random() - 0.5) * Math.PI * 0.85;
        const spd = 0.85 + Math.random() * 1.45;
        activeArcaneParticles.push({
          sprite,
          pos: contactPos.clone(),
          origin: contactPos.clone(),
          angle: sprayAngle,
          radius: 0,
          radiusSpeed: spd * 0.5,
          vortexSpeed: (Math.random() - 0.5) * 4.0,
          velY: 0.45 + Math.random() * 0.85,
          buoyancy: -2.8, // Sparks arc downward
          life: 0.42 + Math.random() * 0.28,
          maxLife: 0.70,
          baseScale: sz,
          baseOpacity: 0.95,
          twinkleRate: 14
        });
      }
    }

    function spawnArcaneDissolveVFX(worldPos, color) {
      const emberCount = 55;
      const stardustCount = 30;

      // 1. Swirling Ascending Arcane Embers
      for (let i = 0; i < emberCount; i++) {
        const isCore = i < 8;
        const isAzure = color === 'b' ? (i % 5 === 0) : (i % 8 === 0);
        const mat = isCore ? sparkMatCore : (isAzure ? sparkMatAzure : (i % 2 === 0 ? sparkMatGold : sparkMatAmber));
        const sprite = new THREE.Sprite(mat);

        // Stagger emission vertically along piece statue silhouette
        const heightOffset = Math.random() * 0.44;
        const startPos = new THREE.Vector3(
          worldPos.x + (Math.random() - 0.5) * 0.08,
          BOARD_SURFACE_Y + heightOffset,
          worldPos.z + (Math.random() - 0.5) * 0.08
        );
        sprite.position.copy(startPos);
        const sz = 0.026 + Math.random() * 0.046;
        sprite.scale.set(sz, sz, 1);
        scene.add(sprite);

        const initAngle = Math.random() * Math.PI * 2;
        const initRadius = 0.02 + Math.random() * 0.08;
        const vortexDir = (i % 2 === 0 ? 1 : -1) * (2.2 + Math.random() * 3.4);
        const lifeDuration = 1.45 + Math.random() * 0.95;

        activeArcaneParticles.push({
          sprite,
          pos: startPos.clone(),
          origin: new THREE.Vector3(worldPos.x, BOARD_SURFACE_Y, worldPos.z),
          angle: initAngle,
          radius: initRadius,
          radiusSpeed: 0.04 + Math.random() * 0.09,
          vortexSpeed: vortexDir,
          velY: 0.42 + Math.random() * 0.72,
          buoyancy: 0.18 + Math.random() * 0.32, // Upward buoyancy into cathedral vault
          life: lifeDuration,
          maxLife: lifeDuration,
          baseScale: sz,
          baseOpacity: 0.92,
          twinkleRate: 10 + Math.random() * 8
        });
      }

      // 2. High-Altitude Floating Arcane Stardust
      for (let i = 0; i < stardustCount; i++) {
        const mat = (i % 3 === 0) ? sparkMatGold : (i % 2 === 0 ? sparkMatAzure : sparkMatAmber);
        const sprite = new THREE.Sprite(mat);
        const h = 0.15 + Math.random() * 0.48;
        const startPos = new THREE.Vector3(
          worldPos.x + (Math.random() - 0.5) * 0.14,
          BOARD_SURFACE_Y + h,
          worldPos.z + (Math.random() - 0.5) * 0.14
        );
        sprite.position.copy(startPos);
        const sz = 0.016 + Math.random() * 0.025;
        sprite.scale.set(sz, sz, 1);
        scene.add(sprite);

        const lifeDuration = 1.8 + Math.random() * 0.8;
        activeArcaneParticles.push({
          sprite,
          pos: startPos.clone(),
          origin: new THREE.Vector3(worldPos.x, BOARD_SURFACE_Y, worldPos.z),
          angle: Math.random() * Math.PI * 2,
          radius: 0.06 + Math.random() * 0.16,
          radiusSpeed: 0.02 + Math.random() * 0.04,
          vortexSpeed: (Math.random() - 0.5) * 2.2,
          velY: 0.55 + Math.random() * 0.65,
          buoyancy: 0.22,
          life: lifeDuration,
          maxLife: lifeDuration,
          baseScale: sz,
          baseOpacity: 0.85,
          twinkleRate: 12
        });
      }
    }

    function animateDefenderDissolve(capturedPiece) {
      if (!capturedPiece || !capturedPiece.mesh) return;
      const rootMesh = capturedPiece.mesh;
      const clonedMaterials = [];

      rootMesh.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          const newMats = mats.map((m) => {
            const cMat = m.clone();
            cMat.transparent = true;
            cMat.opacity = 1.0;
            if ('emissive' in cMat) {
              cMat.emissive = new THREE.Color(0xff8811);
              cMat.emissiveIntensity = 1.4;
            }
            clonedMaterials.push(cMat);
            return cMat;
          });
          child.material = Array.isArray(child.material) ? newMats : newMats[0];
        }
      });

      activeDissolvingPieces.push({
        mesh: rootMesh,
        mixer: capturedPiece.mixer,
        materials: clonedMaterials,
        elapsed: 0,
        duration: 0.32,
        startY: rootMesh.position.y
      });
    }

    const shockwaveRingGeo = new THREE.RingGeometry(0.04, 0.16, 48);
    shockwaveRingGeo.rotateX(-Math.PI / 2);

    function spawnKineticShockwave(worldPos) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe680,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(shockwaveRingGeo, mat);
      mesh.position.set(worldPos.x, BOARD_SURFACE_Y + 0.004, worldPos.z);
      mesh.scale.set(0.25, 1, 0.25);
      scene.add(mesh);

      activeShockwaves.push({
        mesh,
        mat,
        life: 0.32,
        maxLife: 0.32
      });
    }

    function applyBlazingFractures(capturedPiece) {
      if (!capturedPiece || !capturedPiece.mesh) return;
      // Strictly clone materials per defender mesh so shared board piece materials are never mutated!
      capturedPiece.mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          const clonedMats = mats.map((m) => {
            const cMat = m.clone();
            cMat.transparent = true;
            cMat.opacity = 1.0;
            if ('emissive' in cMat) {
              cMat.emissive = new THREE.Color(0xffbb33);
              cMat.emissiveIntensity = 2.4;
            }
            return cMat;
          });
          child.material = Array.isArray(child.material) ? clonedMats : clonedMats[0];
        }
      });

      // Strict safeguard: ensure shared singleton materials maintain true stone look with zero emissive glow
      if (whitePieceMat && whitePieceMat.emissive) {
        whitePieceMat.emissive.setHex(0x000000);
        whitePieceMat.emissiveIntensity = 0;
      }
      if (blackPieceMat && blackPieceMat.emissive) {
        blackPieceMat.emissive.setHex(0x000000);
        blackPieceMat.emissiveIntensity = 0;
      }
    }

    function clearAllArcaneEffects() {
      for (const rc of activeRuneCircles) {
        if (rc.mesh) scene.remove(rc.mesh);
        if (rc.mat) rc.mat.dispose();
      }
      activeRuneCircles.length = 0;

      for (const sw of activeShockwaves) {
        if (sw.mesh) scene.remove(sw.mesh);
        if (sw.mat) sw.mat.dispose();
      }
      activeShockwaves.length = 0;

      for (const p of activeArcaneParticles) {
        if (p.sprite) scene.remove(p.sprite);
      }
      activeArcaneParticles.length = 0;

      for (const dp of activeDissolvingPieces) {
        if (dp.mesh) scene.remove(dp.mesh);
        if (dp.materials) {
          for (const m of dp.materials) m.dispose();
        }
      }
      activeDissolvingPieces.length = 0;

      for (const d of shatterDebris) {
        if (d.mesh) scene.remove(d.mesh);
      }
      shatterDebris.length = 0;

      if (whitePieceMat && whitePieceMat.emissive) {
        whitePieceMat.emissive.setHex(0x000000);
        whitePieceMat.emissiveIntensity = 0;
      }
      if (blackPieceMat && blackPieceMat.emissive) {
        blackPieceMat.emissive.setHex(0x000000);
        blackPieceMat.emissiveIntensity = 0;
      }
    }

    // Preserved for backward compatibility with checkmate & testing hooks
    function spawnStoneShatter(worldPos, color) {
      spawnKineticShockwave(worldPos);
      spawnArcaneRuneCircle(worldPos);
      spawnArcaneDissolveVFX(worldPos, color);
      impactFlashLight.position.set(worldPos.x, worldPos.y + 0.35, worldPos.z);
      impactFlashLight.color.setHex(0xffdf78);
      impactFlashLight.intensity = 8.0;
    }

    // =========================================================================
    // Concrete 3D Piece Dimensions & Anti-Clipping Collision Constants
    // =========================================================================
    const PIECE_HEIGHTS = {
      pawn: 0.36,
      rook: 0.46,
      knight: 0.50,
      bishop: 0.51,
      queen: 0.55,
      king: 0.59
    };
    const MIN_PIECE_SEP = 0.318; // Stone pedestal diameter is ~0.29m; 0.318m enforces a solid concrete gap
    const MELEE_STANDOFF = 0.36; // Optimal melee standoff (1.06 squares) so sword blades visibly bridge the gap and cleave into defender before burst

    // =========================================================================
    // Smooth Attack Camera & Move Execution Choreography
    // =========================================================================
    function executeChessMove(fromR, fromC, toR, toC, options = {}) {
      const piece = boardState[fromR]?.[fromC];
      if (!piece || isAnimatingMove || gameOver) return false;
      if (piece.color !== currentTurn) return false;
      clearHintHighlight();

      // Pre-move snapshot of the core state — used for SAN generation after
      // the board has been mutated by the animation callback.
      const coreStateBefore = buildCoreState(currentTurn);

      const targetOnDest = boardState[toR]?.[toC];
      // Strictly forbid friendly fire (a piece can never move onto or attack a piece of the same color)
      if (targetOnDest && targetOnDest.color === piece.color) {
        return false;
      }

      const legalForPiece = getLegalMovesForPiece(fromR, fromC);
      if (!legalForPiece.some((m) => m.r === toR && m.c === toC)) {
        return false;
      }

      if (preMoveHighlightTask) {
        preMoveHighlightTask = null;
      }

      const isEnPassant = Boolean(
        piece.type === 'pawn' &&
        enPassantTarget &&
        enPassantTarget.r === toR &&
        enPassantTarget.c === toC &&
        !targetOnDest
      );
      const captured = isEnPassant
        ? boardState[enPassantTarget.pawnR][enPassantTarget.pawnC]
        : targetOnDest;
      const isCapture = Boolean(captured);

      // Save board state snapshot (including pre-move scriptCursor & scriptDeviated) so Left Arrow / [ can step backward & re-record
      moveHistory.push({
        snapshot: captureBoardSnapshot(),
        move: {
          color: piece.color,
          pieceType: piece.type,
          fromR,
          fromC,
          toR,
          toC,
          capture: isCapture,
          isEnPassant,
          promotion: options.promotion || promotionPreference
        }
      });

      // Advance scriptCursor if executing a scripted move or a manual move matching the script;
      // otherwise mark scriptDeviated = true and exit scriptedGameActive so the user takes over cleanly
      if (options.fromScript) {
        scriptCursor = Math.min(scriptMoves.length, scriptCursor + 1);
      } else if (!scriptDeviated && scriptCursor < scriptMoves.length) {
        const expected = scriptMoves[scriptCursor];
        if (
          expected &&
          expected.fromR === fromR &&
          expected.fromC === fromC &&
          expected.toR === toR &&
          expected.toC === toC
        ) {
          scriptCursor = Math.min(scriptMoves.length, scriptCursor + 1);
        } else {
          scriptDeviated = true;
          scriptedGameActive = false;
        }
      } else if (scriptMoves.length > 0) {
        scriptDeviated = true;
        scriptedGameActive = false;
      }
      if (typeof updateScriptBarUI === 'function') updateScriptBarUI();

      isAnimatingMove = true;
      activeCamTransition = null;
      clearSquareHighlights();
      clearCheckLaserBeams();
      selectedSquare = null;
      validMoves = [];

      const startPos = boardToWorld(fromR, fromC);
      const endPos = boardToWorld(toR, toC);
      const dx = endPos.x - startPos.x;
      const dz = endPos.z - startPos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const dirX = dx / dist;
      const dirZ = dz / dist;
      const moveHeading = Math.atan2(dx, dz);
      piece.mesh.rotation.y = moveHeading;
      playPieceClip(piece, 'Move', true, 0.10);

      // Detect Castling (King moves 2 files horizontally: e1->g1/c1 or e8->g8/c8) and animate the Rook simultaneously
      const isCastling = piece.type === 'king' && fromR === toR && Math.abs(toC - fromC) === 2;
      const castleRookFromC = isCastling ? (toC > fromC ? 7 : 0) : -1;
      const castleRookToC = isCastling ? (toC > fromC ? 5 : 3) : -1;
      const castleRook = isCastling ? boardState[fromR][castleRookFromC] : null;
      const castleRookStartPos = castleRook ? boardToWorld(fromR, castleRookFromC) : null;
      const castleRookEndPos = castleRook ? boardToWorld(fromR, castleRookToC) : null;
      if (castleRook && castleRook.mesh) {
        const rDx = castleRookEndPos.x - castleRookStartPos.x;
        const rDz = castleRookEndPos.z - castleRookStartPos.z;
        castleRook.mesh.rotation.y = Math.atan2(rDx, rDz);
        playPieceClip(castleRook, 'Move', true, 0.10);
      }

      // Defending enemy statue turns to face the incoming attacker shield-to-shield
      if (isCapture && captured && captured.mesh) {
        captured.mesh.rotation.y = Math.atan2(-dx, -dz);
      }

      // Full Concrete Standoff Distance for Melee Strike (0.36m for multi-square captures, scaled to 0.76*dist for 1-square captures so attacker always steps forward)
      const stopOffset = isCapture ? Math.min(MELEE_STANDOFF, dist * 0.76) : 0;
      const strikePos = new THREE.Vector3(
        endPos.x - dirX * stopOffset,
        BOARD_SURFACE_Y,
        endPos.z - dirZ * stopOffset
      );

      // Collect all bystander pieces (both friendly and enemy) on the board for concrete collision avoidance
      const bystanders = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const other = boardState[r][c];
          if (other && other !== piece && other !== captured && other.mesh) {
            bystanders.push({
              piece: other,
              homePos: boardToWorld(r, c),
              height: PIECE_HEIGHTS[other.type] || 0.45
            });
          }
        }
      }

      // Pre-analyze Knight path vs bystanders so Knights cleanly skirt single blockers or vault high over walls
      const segDx = (isCapture ? strikePos.x : endPos.x) - startPos.x;
      const segDz = (isCapture ? strikePos.z : endPos.z) - startPos.z;
      const segLen = Math.hypot(segDx, segDz) || 0.001;
      const segUx = segDx / segLen;
      const segUz = segDz / segLen;
      const segPerpX = -segUz;
      const segPerpZ = segUx;

      let knightLateralSign = 0;
      let knightVaultPeak = 0;
      if (piece.type === 'knight') {
        let blockedPosSide = false;
        let blockedNegSide = false;
        let maxBlockerHeight = 0;
        for (const b of bystanders) {
          const relX = b.homePos.x - startPos.x;
          const relZ = b.homePos.z - startPos.z;
          const proj = relX * segUx + relZ * segUz;
          if (proj > 0.04 && proj < segLen - 0.04) {
            const signedPerp = relX * segPerpX + relZ * segPerpZ;
            if (Math.abs(signedPerp) < MIN_PIECE_SEP) {
              if (signedPerp >= 0) blockedPosSide = true;
              if (signedPerp <= 0) blockedNegSide = true;
              if (b.height > maxBlockerHeight) maxBlockerHeight = b.height;
            }
          }
        }
        if (blockedPosSide && !blockedNegSide) {
          knightLateralSign = -1; // Skirt cleanly around the open -perp channel
        } else if (blockedNegSide && !blockedPosSide) {
          knightLateralSign = 1;  // Skirt cleanly around the open +perp channel
        } else if (blockedPosSide && blockedNegSide) {
          // Solid wall of pieces across both L-channels: vault high above the tallest blocker's crown/helmet
          knightVaultPeak = maxBlockerHeight + 0.09;
        }
      }

      function resetBystandersToHome() {
        for (const b of bystanders) {
          b.piece.mesh.position.copy(b.homePos);
        }
      }

      // Concrete 3D Trajectory Solver: enforces zero mesh intersection against all friendly & enemy bystanders
      const isDiagonalSlide =
        Math.abs(toR - fromR) === Math.abs(toC - fromC) &&
        Math.abs(toR - fromR) >= 1 &&
        piece.type !== 'knight';

      function applyConcreteTrajectory(u, fromVec, toVec) {
        const ease = isCapture ? (0.28 * u + 0.72 * easeInOutCubic(u)) : easeInOutCubic(u);
        let bx = fromVec.x + (toVec.x - fromVec.x) * ease;
        let bz = fromVec.z + (toVec.z - fromVec.z) * ease;
        let by = BOARD_SURFACE_Y;

        const archSin = Math.sin(u * Math.PI);

        if (piece.type === 'knight') {
          if (isCapture) {
            // Knight leaps high in a majestic parabolic arc during capture approach
            by = BOARD_SURFACE_Y + archSin * 0.42;
            piece.mesh.rotation.x = -archSin * 0.22;
          } else if (knightLateralSign !== 0) {
            // Curve horizontally through the open L-corridor
            bx += segPerpX * knightLateralSign * 0.165 * archSin;
            bz += segPerpZ * knightLateralSign * 0.165 * archSin;
            by = BOARD_SURFACE_Y + archSin * 0.06;
          } else if (knightVaultPeak > 0) {
            // Broad, high stone-steed vault that clears the full height of blocking pieces
            by = BOARD_SURFACE_Y + Math.pow(archSin, 0.65) * knightVaultPeak;
          } else {
            by = BOARD_SURFACE_Y + archSin * 0.06;
          }
        }

        // Check every bystander (friendly or enemy) for concrete 3D non-penetration
        const effectiveMinSep = isDiagonalSlide ? 0.262 : MIN_PIECE_SEP;
        for (const b of bystanders) {
          const hx = b.homePos.x;
          const hz = b.homePos.z;
          const dHomeX = bx - hx;
          const dHomeZ = bz - hz;
          const dHome = Math.hypot(dHomeX, dHomeZ);

          // If the moving piece is already vertically above this bystander's top + 2.5cm margin, no horizontal push needed
          if (by >= BOARD_SURFACE_Y + b.height + 0.025) {
            b.piece.mesh.position.copy(b.homePos);
            continue;
          }

          // When squeezing diagonally between adjacent pieces, bystanders subtly yield outward within their square
          if (dHome < 0.36 && dHome > 0.001 && knightVaultPeak === 0) {
            const yieldProx = Math.max(0, (0.36 - dHome) / 0.36) * archSin;
            const yieldDist = Math.min(0.068, yieldProx * 0.082);
            b.piece.mesh.position.set(
              hx - (dHomeX / dHome) * yieldDist,
              BOARD_SURFACE_Y,
              hz - (dHomeZ / dHome) * yieldDist
            );
          } else {
            b.piece.mesh.position.copy(b.homePos);
          }

          // Hard concrete cylinder separation against bystander's instantaneous position
          const curBx = b.piece.mesh.position.x;
          const curBz = b.piece.mesh.position.z;
          const sepX = bx - curBx;
          const sepZ = bz - curBz;
          const sepDist = Math.hypot(sepX, sepZ);

          if (sepDist < effectiveMinSep) {
            if (piece.type === 'knight' && knightVaultPeak > 0) {
              // Ensure Knight pedestal bottom clears the blocker's crown/helmet
              by = Math.max(by, BOARD_SURFACE_Y + b.height + 0.03);
            } else if (sepDist > 0.0001) {
              const push = effectiveMinSep - sepDist;
              bx += (sepX / sepDist) * push;
              bz += (sepZ / sepDist) * push;
            } else {
              bx += segPerpX * effectiveMinSep;
              bz += segPerpZ * effectiveMinSep;
            }
          }
        }

        piece.mesh.position.set(bx, by, bz);
      }

      // Save Player Camera State for Smooth Eased Entry & Return
      const savedCamPos = camera.position.clone();
      const savedTarget = orbitControls.target.clone();

      // Calculate Optimal Unobstructed 3/4 Duel Camera Angle
      const midPoint = new THREE.Vector3(
        (strikePos.x + endPos.x) * 0.5,
        BOARD_SURFACE_Y + 0.32,
        (strikePos.z + endPos.z) * 0.5
      );

      // Score both perpendicular sides for foreground bystander occlusion across both mid and close camera poses
      const perpA = new THREE.Vector3(-dirZ, 0, dirX);
      const perpB = new THREE.Vector3(dirZ, 0, -dirX);
      const camFromMid = new THREE.Vector3().subVectors(savedCamPos, midPoint);
      const prefPerp = camFromMid.dot(perpA) >= 0 ? perpA : perpB;
      const altPerp = prefPerp === perpA ? perpB : perpA;

      function scoreDuelPerpOcclusion(perpVec) {
        let penalty = 0;
        const probes = [
          { perpMul: 1.24, dirMul: -0.34 },
          { perpMul: 0.92, dirMul: 0.14 }
        ];
        for (const pr of probes) {
          const camX = midPoint.x + perpVec.x * pr.perpMul + dirX * pr.dirMul;
          const camZ = midPoint.z + perpVec.z * pr.perpMul + dirZ * pr.dirMul;
          const rayX = midPoint.x - camX;
          const rayZ = midPoint.z - camZ;
          const rayLenSq = Math.max(0.0001, rayX * rayX + rayZ * rayZ);
          for (const b of bystanders) {
            const bPos = b.piece && b.piece.mesh ? b.piece.mesh.position : b.homePos;
            if (!bPos) continue;
            const px = bPos.x - camX;
            const pz = bPos.z - camZ;
            const t = (px * rayX + pz * rayZ) / rayLenSq;
            if (t > 0.10 && t < 0.98) {
              const cx = camX + rayX * t;
              const cz = camZ + rayZ * t;
              const distB = Math.hypot(bPos.x - cx, bPos.z - cz);
              if (distB < 0.44) {
                penalty += (0.44 - distB) * 12.0;
              }
            }
          }
        }
        return penalty;
      }

      const chosenPerp =
        scoreDuelPerpOcclusion(prefPerp) > scoreDuelPerpOcclusion(altPerp) + 0.25 ? altPerp : prefPerp;

      // Continuous Quadratic Bezier 3/4 orbit-and-dolly arc (savedCamPos -> duelCamMid -> duelCamClose)
      // so the attack camera glides in a single unbroken C-infinity sweep across approach + strike without ever stalling at tApproach
      const duelCamMid = new THREE.Vector3(
        midPoint.x + chosenPerp.x * 1.34 - dirX * 0.44,
        BOARD_SURFACE_Y + 0.96,
        midPoint.z + chosenPerp.z * 1.34 - dirZ * 0.44
      );
      const duelCamClose = new THREE.Vector3(
        midPoint.x + chosenPerp.x * 0.92 + dirX * 0.18,
        BOARD_SURFACE_Y + 0.74,
        midPoint.z + chosenPerp.z * 0.92 + dirZ * 0.18
      );
      const duelTargetStart = new THREE.Vector3(
        strikePos.x + dirX * 0.10,
        BOARD_SURFACE_Y + 0.34,
        strikePos.z + dirZ * 0.10
      );
      const duelTargetEnd = new THREE.Vector3(
        endPos.x - dirX * 0.05,
        BOARD_SURFACE_Y + 0.30,
        endPos.z - dirZ * 0.05
      );

      function evalQuadraticBezier(outVec, p0, p1, p2, t) {
        const inv = 1 - t;
        const c0 = inv * inv;
        const c1 = 2 * inv * t;
        const c2 = t * t;
        outVec.set(
          c0 * p0.x + c1 * p1.x + c2 * p2.x,
          c0 * p0.y + c1 * p1.y + c2 * p2.y,
          c0 * p0.z + c1 * p1.z + c2 * p2.z
        );
      }

      if (isCapture) {
        activeDuelSavedCam = {
          pos: savedCamPos.clone(),
          target: savedTarget.clone()
        };
        orbitControls.enabled = false;
        cameraTelemetry.lastAttackSamples = [];
        cameraTelemetry.attackCount += 1;
        cameraTelemetry.maxStepDelta = 0;
        cameraTelemetry.minCombatSeparation = Infinity;
      } else {
        cameraTelemetry.lastSpaceMoveSamples = [];
      }

      // Distance-scaled piece movement duration (slowed by ~12-18% + scaled per square so 4-5 space Bishop/Rook/Queen glides feel weighty and unhurried):
      // - 1 square move: 0.64s
      // - 4-5 square move: 1.10s - 1.29s
      const squaresMoved = Math.max(1, Math.hypot(toR - fromR, toC - fromC));
      const stdMoveDuration = Number((0.64 + Math.max(0, squaresMoved - 1) * 0.14).toFixed(3));
      const atkProfile = ATTACK_SYNC_PROFILES[piece.type] || ATTACK_SYNC_PROFILES.queen;
      const SWING_START_CLIP_TIME = atkProfile.swingStartClip;
      const CONTACT_CLIP_TIME = atkProfile.contactClip; // Weapon physically strikes defender, triggering flash & flinch
      const BLOW_CLIP_TIME = atkProfile.blowClip;       // After visible weapon impact, defender explodes into stone shards
      const tApproach = isCapture
        ? Number((0.38 + Math.max(0, squaresMoved - 1) * 0.08).toFixed(3))
        : stdMoveDuration;
      const tContact = isCapture ? (tApproach + CONTACT_CLIP_TIME / atkProfile.timeScale) : stdMoveDuration;
      const tImpact = isCapture ? (tApproach + BLOW_CLIP_TIME / atkProfile.timeScale) : stdMoveDuration;
      const tStrikeDone = isCapture ? Number((tImpact + 0.24).toFixed(3)) : stdMoveDuration;
      // Snappy, distance-aware post-attack camera return (~0.65s - 0.85s)
      const camReturnDist = savedCamPos.distanceTo(duelCamClose);
      const returnDuration = isCapture ? Number((0.65 + Math.min(0.20, camReturnDist * 0.06)).toFixed(3)) : 0;
      const totalDuration = isCapture ? Number((tStrikeDone + returnDuration).toFixed(3)) : stdMoveDuration;

      if (!isCapture) {
        cameraTelemetry.lastSpaceMoveDuration = stdMoveDuration;
        cameraTelemetry.lastSquaresMoved = Number(squaresMoved.toFixed(3));
      } else {
        cameraTelemetry.lastCaptureTiming = {
          pieceType: piece.type,
          squaresMoved: Number(squaresMoved.toFixed(3)),
          tApproach: Number(tApproach.toFixed(3)),
          tContact: Number(tContact.toFixed(3)),
          tImpact: Number(tImpact.toFixed(3)),
          tStrikeDone: Number(tStrikeDone.toFixed(3)),
          returnDuration: Number(returnDuration.toFixed(3)),
          totalDuration: Number(totalDuration.toFixed(3))
        };
      }

      let elapsed = 0;
      let attackAnimStarted = false;
      let defenderFlinchTriggered = false;
      let shatterTriggered = false;
      let rookRumblePlayed = false;
      let hitStopElapsed = 0;
      const HIT_STOP_TOTAL = 0.05;
      let hitStopActive = false;
      let impactActualTime = tImpact;
      const postShatterPiecePos = strikePos.clone();
      const postStrikePiecePos = strikePos.clone();
      let prevCamPos = camera.position.clone();
      let prevPiecePos = piece.mesh.position.clone();

      function finishMove() {
        resetBystandersToHome();
        boardState[fromR][fromC] = null;
        boardState[toR][toC] = piece;
        piece.r = toR;
        piece.c = toC;
        piece.hasMoved = true;

        if (isCastling && castleRook) {
          boardState[fromR][castleRookFromC] = null;
          boardState[fromR][castleRookToC] = castleRook;
          castleRook.r = fromR;
          castleRook.c = castleRookToC;
          castleRook.hasMoved = true;
          if (castleRook.mesh) {
            castleRook.mesh.position.copy(castleRookEndPos);
            castleRook.mesh.rotation.y = castleRook.color === 'w' ? Math.PI : 0;
          }
          playPieceClip(castleRook, 'Idle', true, 0.18);
          wizardChessAudio.playPiecePlacement(castleRookEndPos, 'rook');
        }

        // Pawn Promotion (piece type from options.promotion or the UI preference)
        if (piece.type === 'pawn' && (toR === 0 || toR === 7)) {
          scene.remove(piece.mesh);
          const promoType = options.promotion || promotionPreference;
          const promoted = instantiatePiece(promoType, piece.color, toR, toC);
          promoted.hasMoved = true;
          boardState[toR][toC] = promoted;
          wizardChessAudio.playPiecePlacement(endPos, promoType);
        } else {
          piece.mesh.position.copy(endPos);
          piece.mesh.rotation.x = 0;
          piece.mesh.rotation.z = 0;
          piece.mesh.rotation.y = piece.color === 'w' ? Math.PI : 0;
          playPieceClip(piece, 'Idle', true, 0.18);
          if (!isCapture) {
            wizardChessAudio.playPiecePlacement(endPos, piece.type);
          }
        }

        if (isCapture) {
          if (piece.color === 'w') capturedByWhite += 1;
          else capturedByBlack += 1;
          activeDuelSavedCam = null;
          camera.position.copy(savedCamPos);
          orbitControls.target.copy(savedTarget);
          orbitControls.enabled = true;
          orbitControls.update();
        }

        if (currentTimeControl !== 'untimed') {
          const inc = TIME_CONTROLS[currentTimeControl]?.increment || 0;
          if (piece.color === 'w') clockWhiteSeconds += inc;
          else clockBlackSeconds += inc;
          isClockRunning = true;
          updateClockDOM();
        }

        if (isEnPassant && enPassantTarget) {
          boardState[enPassantTarget.pawnR][enPassantTarget.pawnC] = null;
        }

        if (piece.type === 'pawn' && Math.abs(toR - fromR) === 2) {
          enPassantTarget = {
            r: (fromR + toR) / 2,
            c: toC,
            pawnR: toR,
            pawnC: toC,
            color: piece.color
          };
        } else {
          enPassantTarget = null;
        }

        const nextTurn = piece.color === 'w' ? 'b' : 'w';
        // SAN comes from the pure rules core — single source of truth for
        // disambiguation, promotions, castling and +/# suffixes.
        let san = null;
        if (coreStateBefore) {
          const promoType = options.promotion || promotionPreference;
          const promoChar = PROMO_CORE_CHAR[promoType] || 'q';
          const coreMove = coreLegalMoves(coreStateBefore).find((m) =>
            m.from.r === fromR && m.from.c === fromC &&
            m.to.r === toR && m.to.c === toC &&
            (!m.promotion || m.promotion === promoChar)
          );
          if (coreMove) {
            san = coreMoveToSan(coreStateBefore, coreMove);
          }
        }
        if (!san) {
          // Defensive fallback (should not happen for legal moves): coordinate notation
          const sanFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
          san = `${sanFiles[fromC]}${8 - fromR}${isCapture ? 'x' : ''}${sanFiles[toC]}${8 - toR}`;
        }
        if (moveHistory.length > 0) {
          const curEntry = moveHistory[moveHistory.length - 1];
          curEntry.san = san;
          curEntry.snapshotAfter = captureBoardSnapshot();
          curEntry.positionKeyAfter = corePositionKey(buildCoreState(nextTurn));
          repetitionCounts[curEntry.positionKeyAfter] = (repetitionCounts[curEntry.positionKeyAfter] || 0) + 1;
        }
        updateLastMoveHighlight(fromR, fromC, toR, toC);
        recordMoveNotation(piece.color, san, fromR, fromC, toR, toC);

        currentTurn = nextTurn;
        isAnimatingMove = false;
        updateTurnUI();
        saveGameToStorage();
        maybeScheduleAIMove();
      }

      function stepMove(dt) {
        let simDt = dt;
        if (isCapture && hitStopActive) {
          hitStopElapsed += dt;
          if (hitStopElapsed < HIT_STOP_TOTAL) {
            simDt = dt * 0.12; // Cinematic slow-motion dilation during weapon impact
          } else {
            hitStopActive = false;
          }
        }
        elapsed += simDt;

        if (!isCapture) {
          const u = Math.min(1, elapsed / totalDuration);
          applyConcreteTrajectory(u, startPos, endPos);
          if (isCastling && castleRook && castleRook.mesh) {
            const rEase = easeInOutCubic(u);
            castleRook.mesh.position.set(
              castleRookStartPos.x + (castleRookEndPos.x - castleRookStartPos.x) * rEase,
              BOARD_SURFACE_Y + Math.sin(u * Math.PI) * 0.05,
              castleRookStartPos.z + (castleRookEndPos.z - castleRookStartPos.z) * rEase
            );
          }
          const pDelta = piece.mesh.position.distanceTo(prevPiecePos);
          prevPiecePos.copy(piece.mesh.position);
          cameraTelemetry.lastSpaceMoveSamples.push({
            t: Number(elapsed.toFixed(3)),
            u: Number(u.toFixed(3)),
            piecePos: [
              Number(piece.mesh.position.x.toFixed(3)),
              Number(piece.mesh.position.y.toFixed(3)),
              Number(piece.mesh.position.z.toFixed(3))
            ],
            pieceStep: Number(pDelta.toFixed(4))
          });
          if (u >= 1) {
            finishMove();
            return true;
          }
          return false;
        }

        // Capture Sequence with Continuous C-infinity Quadratic Bezier Camera & Zero-Freeze Piece Choreography
        let phaseName = 'approach';
        if (elapsed <= tStrikeDone) {
          // Single unbroken C-infinity camera arc across both approach and strike (never stops at tApproach!)
          const uActive = Math.min(1, elapsed / tStrikeDone);
          const sActive = 0.38 * uActive + 0.62 * easeInOutCubic(uActive);
          evalQuadraticBezier(camera.position, savedCamPos, duelCamMid, duelCamClose, sActive);
          evalQuadraticBezier(orbitControls.target, savedTarget, duelTargetStart, duelTargetEnd, sActive);

          if (elapsed <= tApproach) {
            // Phase 1: Smooth Glide-In to Concrete Standoff Position
            phaseName = 'approach';
            const u = Math.min(1, elapsed / tApproach);
            applyConcreteTrajectory(u, startPos, strikePos);
          } else {
            // Phase 2: Rigged Attack (Continuous Stalk -> Physical Weapon Impact -> Shatter Burst -> Follow-Through Advance)
            phaseName = 'strike';
            const atkClipTime = (elapsed - tApproach) * atkProfile.timeScale;
            if (!attackAnimStarted) {
              attackAnimStarted = true;
              playPieceClip(piece, 'Attack', false, 0.08);
            }

            // Keep any bystanders immediately adjacent to strikePos yielded slightly outward during the weapon swing
            for (const b of bystanders) {
              const dxB = strikePos.x - b.homePos.x;
              const dzB = strikePos.z - b.homePos.z;
              const dB = Math.hypot(dxB, dzB);
              if (dB < 0.42 && dB > 0.001) {
                const yieldDist = ((0.42 - dB) / 0.42) * 0.068;
                b.piece.mesh.position.set(
                  b.homePos.x - (dxB / dB) * yieldDist,
                  BOARD_SURFACE_Y,
                  b.homePos.z - (dzB / dB) * yieldDist
                );
              } else {
                b.piece.mesh.position.copy(b.homePos);
              }
            }

            // Piece-specific audio trigger: Rook siege charge ground rumble
            if (piece.type === 'rook' && !rookRumblePlayed) {
              rookRumblePlayed = true;
              wizardChessAudio.playRookSiegeRumble(strikePos);
            }

            // Keep attacker continuously moving forward during wind-up stalk, downward strike, and post-shatter follow-through
            if (!shatterTriggered && captured && captured.mesh) {
              const stalkLead = 0.028;
              let lungeOffset = 0;
              if (piece.type === 'bishop') {
                // Bishop: swift in-stride drive-through slice with continuous forward momentum
                const slashProg = Math.min(1, atkClipTime / Math.max(0.05, BLOW_CLIP_TIME));
                lungeOffset = stalkLead + slashProg * atkProfile.maxLunge;
              } else if (atkClipTime < SWING_START_CLIP_TIME) {
                const windupProgress = Math.min(1, atkClipTime / Math.max(0.05, SWING_START_CLIP_TIME));
                lungeOffset = windupProgress * stalkLead;
              } else {
                const slashPhase = Math.min(
                  1,
                  (atkClipTime - SWING_START_CLIP_TIME) / Math.max(0.05, BLOW_CLIP_TIME - SWING_START_CLIP_TIME)
                );
                lungeOffset =
                  stalkLead + Math.sin(slashPhase * Math.PI * 0.85) * Math.max(0.018, atkProfile.maxLunge - stalkLead);
              }

              let pieceY = BOARD_SURFACE_Y;

              if (piece.type === 'knight') {
                // Knight: bounds high above the board and descends with cleaving blade from above
                if (atkClipTime < CONTACT_CLIP_TIME) {
                  const jumpProg = Math.min(1, atkClipTime / Math.max(0.01, CONTACT_CLIP_TIME));
                  const leapElev = Math.sin(jumpProg * Math.PI) * 0.40;
                  pieceY = BOARD_SURFACE_Y + leapElev;
                  piece.mesh.rotation.x = -Math.sin(jumpProg * Math.PI) * 0.35;
                } else {
                  piece.mesh.rotation.x = 0;
                }
              } else if (piece.type === 'queen') {
                // Queen: majestic 360° pirouette spin with sweeping golden arc during wind-up
                if (atkClipTime < CONTACT_CLIP_TIME) {
                  const spinProgress = Math.min(1, atkClipTime / Math.max(0.01, CONTACT_CLIP_TIME));
                  const spinEased = (1 - Math.cos(spinProgress * Math.PI)) * 0.5;
                  piece.mesh.rotation.y = moveHeading + spinEased * Math.PI * 2;
                  if (Math.random() < 0.45) {
                    spawnContactSparks(
                      new THREE.Vector3(piece.mesh.position.x, BOARD_SURFACE_Y + 0.30, piece.mesh.position.z),
                      -dirZ,
                      dirX
                    );
                  }
                } else {
                  piece.mesh.rotation.y = moveHeading;
                }
              }

              piece.mesh.position.set(
                strikePos.x + dirX * lungeOffset,
                pieceY,
                strikePos.z + dirZ * lungeOffset
              );

              if (atkClipTime < CONTACT_CLIP_TIME) {
                captured.mesh.position.copy(endPos);
              } else {
                // Weapon makes physical impact on defender before defender bursts
                const shoveProgress = Math.min(
                  1,
                  (atkClipTime - CONTACT_CLIP_TIME) / Math.max(0.04, BLOW_CLIP_TIME - CONTACT_CLIP_TIME)
                );
                // Rook bulldozes and shoves defender backward with siege force ("сносит")
                const maxShove = piece.type === 'rook' ? 0.092 : 0.045;
                const shoveDist = shoveProgress * maxShove;
                captured.mesh.position.set(
                  endPos.x + dirX * shoveDist,
                  BOARD_SURFACE_Y,
                  endPos.z + dirZ * shoveDist
                );
              }

              const curSep = piece.mesh.position.distanceTo(captured.mesh.position);
              if (curSep < (cameraTelemetry.minCombatSeparation ?? Infinity)) {
                cameraTelemetry.minCombatSeparation = Number(curSep.toFixed(3));
              }
            }

            // Contact: weapon physically strikes defender with cinematic hit-stop
            if (
              !defenderFlinchTriggered &&
              (atkClipTime >= CONTACT_CLIP_TIME || elapsed >= tContact + 0.06)
            ) {
              defenderFlinchTriggered = true;
              hitStopActive = true;
              hitStopElapsed = 0;
              if (piece.type === 'knight') {
                piece.mesh.rotation.x = 0;
              }
              if (captured) {
                playPieceClip(captured, 'Shatter', false, 0.04);
                impactFlashLight.position.set(
                  endPos.x - dirX * 0.08,
                  BOARD_SURFACE_Y + 0.32,
                  endPos.z - dirZ * 0.08
                );
                impactFlashLight.color.setHex(piece.type === 'queen' ? 0xffdf78 : 0xffe28a);
                impactFlashLight.intensity = piece.type === 'queen' ? 10.0 : 8.5;

                // Knight cleaves straight down from above onto the defender's head
                const sparkHeight = piece.type === 'knight'
                  ? BOARD_SURFACE_Y + (PIECE_HEIGHTS[captured.type] || 0.46)
                  : BOARD_SURFACE_Y + 0.28;

                spawnContactSparks(
                  new THREE.Vector3(endPos.x - dirX * 0.10, sparkHeight, endPos.z - dirZ * 0.10),
                  piece.type === 'bishop' ? -dirZ : dirX,
                  piece.type === 'bishop' ? dirX : dirZ
                );
                spawnKineticShockwave(endPos);
                if (piece.type === 'rook' && activeShockwaves.length > 0) {
                  activeShockwaves[activeShockwaves.length - 1].mesh.scale.set(0.42, 1, 0.42);
                }
                applyBlazingFractures(captured);
                wizardChessAudio.playHeavyStoneImpact(endPos, piece.type === 'rook' ? 1.25 : 1.0);
              }
            }

            // Weapon impact recoil micro-vibration & kinetic tremor during hit-stop
            if (hitStopActive && hitStopElapsed < HIT_STOP_TOTAL) {
              const recoilFactor = 1 - hitStopElapsed / HIT_STOP_TOTAL;
              const recoil = Math.sin(hitStopElapsed * 80) * recoilFactor * 0.016;
              piece.mesh.position.set(
                strikePos.x - dirX * recoil,
                BOARD_SURFACE_Y,
                strikePos.z - dirZ * recoil
              );
              camera.position.y += Math.sin(hitStopElapsed * 50) * 0.010 * recoilFactor;
            }

            // Blow Burst: after visible weapon impact & follow-through, defender dissolves into glowing arcane dust and embers!
            if (!shatterTriggered && (atkClipTime >= BLOW_CLIP_TIME || elapsed >= tImpact + 0.06)) {
              shatterTriggered = true;
              impactActualTime = elapsed;
              postShatterPiecePos.copy(piece.mesh.position);
              if (captured && captured.mesh) {
                const shatterOrigin = captured.mesh.position.clone();
                spawnArcaneRuneCircle(endPos);
                spawnArcaneDissolveVFX(shatterOrigin, captured.color);
                animateDefenderDissolve(captured);
                wizardChessAudio.playCrumblingDustWhoosh(endPos);
                impactFlashLight.intensity = 7.5;
              }
            }

            // Immediately after shattering defender, attacker smoothly begins advancing toward endPos (no post-impact freeze!)
            if (shatterTriggered) {
              const postStrikeSpan = Math.max(0.08, tStrikeDone - impactActualTime);
              const uFollow = Math.min(1, Math.max(0, (elapsed - impactActualTime) / postStrikeSpan));
              piece.mesh.position.lerpVectors(postShatterPiecePos, endPos, uFollow * 0.38);
              postStrikePiecePos.copy(piece.mesh.position);
            }

            // Subtle damped perpendicular impact vibration right when the blow shatters the defender
            if (shatterTriggered && elapsed >= impactActualTime && elapsed <= impactActualTime + 0.26) {
              const shakeProgress = (elapsed - impactActualTime) / 0.26;
              const decay = (1 - shakeProgress) * (1 - shakeProgress);
              const amp = 0.024 * decay;
              camera.position.y += Math.sin(shakeProgress * Math.PI * 8) * amp;
            }
          }
        } else {
          // Phase 3: Complete Advance onto Captured Square & Smooth Unhurried Camera Ease-Back
          phaseName = 'return';
          const uReturn = Math.min(1, (elapsed - tStrikeDone) / Math.max(0.1, totalDuration - tStrikeDone));
          const easeRet = easeInOutCubic(uReturn);
          const pieceAdvanceBlend = 0.35 * uReturn + 0.65 * easeRet;

          piece.mesh.position.lerpVectors(postStrikePiecePos, endPos, pieceAdvanceBlend);
          camera.position.lerpVectors(duelCamClose, savedCamPos, easeRet);
          orbitControls.target.lerpVectors(duelTargetEnd, savedTarget, easeRet);
        }

        camera.lookAt(orbitControls.target);

        const stepDelta = camera.position.distanceTo(prevCamPos);
        const pieceStepDelta = piece.mesh.position.distanceTo(prevPiecePos);
        if (stepDelta > cameraTelemetry.maxStepDelta) {
          cameraTelemetry.maxStepDelta = stepDelta;
        }
        prevCamPos.copy(camera.position);
        prevPiecePos.copy(piece.mesh.position);

        cameraTelemetry.lastAttackSamples.push({
          t: Number(elapsed.toFixed(3)),
          phase: phaseName,
          camStep: Number(stepDelta.toFixed(4)),
          pieceStep: Number(pieceStepDelta.toFixed(4)),
          pos: [
            Number(camera.position.x.toFixed(3)),
            Number(camera.position.y.toFixed(3)),
            Number(camera.position.z.toFixed(3))
          ],
          target: [
            Number(orbitControls.target.x.toFixed(3)),
            Number(orbitControls.target.y.toFixed(3)),
            Number(orbitControls.target.z.toFixed(3))
          ],
          piecePos: [
            Number(piece.mesh.position.x.toFixed(3)),
            Number(piece.mesh.position.y.toFixed(3)),
            Number(piece.mesh.position.z.toFixed(3))
          ]
        });

        if (elapsed >= totalDuration) {
          finishMove();
          return true;
        }
        return false;
      }

      // Play tactile piece slide whisper for movement transit
      const slideDuration = isCapture ? tApproach : totalDuration;
      wizardChessAudio.playPieceSlide(startPos, slideDuration, squaresMoved);

      activeMoveTweens.push(stepMove);
      return true;
    }

    const activeMoveTweens = [];

    // =========================================================================
    // Single-Player Tactical AI (Auto-Plays Opponent Turn + Manual AI Button)
    // =========================================================================

    // =========================================================================
    // Multi-Tiered AI Engine (Novice to Legend)
    // =========================================================================
    // The search itself (negamax alpha-beta + quiescence + MVV-LVA) lives in
    // src/chess/aiSearch.js — pure, unit-tested, and shared with the Web
    // Worker. This block only maps engine state <-> core state and routes
    // requests: worker first, main-thread core search as fallback.
    let currentDifficulty = 'intermediate'; // 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'master' | 'legend'

    function getAiSearchProfile() {
      switch (currentDifficulty) {
        case 'beginner': return { depth: 1, jitter: 32 };
        case 'intermediate': return { depth: 2, jitter: 10 };
        case 'advanced': return { depth: 3, jitter: 3 };
        case 'master': return { depth: 3, jitter: 0 };
        case 'legend': return { depth: 4, jitter: 0 };
        default: return { depth: 2, jitter: 10 };
      }
    }

    function coreMoveToEngineMove(coreMove) {
      if (!coreMove) return null;
      return {
        fromR: coreMove.from.r,
        fromC: coreMove.from.c,
        toR: coreMove.to.r,
        toC: coreMove.to.c,
        promotion: coreMove.promotion || null,
        capture: Boolean(coreMove.capture || coreMove.isEnPassant)
      };
    }

    function isEngineLegalMove(color, candidate) {
      if (!candidate) return false;
      return getAllLegalMoves(color).some((m) =>
        m.fromR === candidate.fromR &&
        m.fromC === candidate.fromC &&
        m.toR === candidate.toR &&
        m.toC === candidate.toC
      );
    }

    function chooseSmartAIMove(color) {
      const legalMoves = getAllLegalMoves(color);
      if (legalMoves.length === 0) return null;

      // 1. Novice tier: frequent random moves, occasional captures
      if (currentDifficulty === 'novice') {
        if (Math.random() < 0.65) {
          return legalMoves[Math.floor(Math.random() * legalMoves.length)];
        }
        const captures = legalMoves.filter((m) => m.capture);
        if (captures.length > 0 && Math.random() < 0.70) {
          return captures[Math.floor(Math.random() * captures.length)];
        }
        return legalMoves[Math.floor(Math.random() * legalMoves.length)];
      }

      // 2. Beginner tier: noisy search
      if (currentDifficulty === 'beginner' && Math.random() < 0.28) {
        return legalMoves[Math.floor(Math.random() * legalMoves.length)];
      }

      // 3. Depth >= 1 tiers: pure core search (same code the Web Worker runs)
      const result = coreSearchBestMove(buildCoreState(color), getAiSearchProfile());
      const chosen = coreMoveToEngineMove(result && result.move);
      if (chosen && isEngineLegalMove(color, chosen)) return chosen;
      return legalMoves[0];
    }

    // --- Web Worker integration: search off the render loop ---------------
    let aiWorkerInstance = null;
    let aiWorkerUnavailable = false;
    let aiWorkerRequestId = 0;

    function getAiWorker() {
      if (aiWorkerUnavailable) return null;
      if (aiWorkerInstance) return aiWorkerInstance;
      try {
        aiWorkerInstance = new Worker(new URL('./chess/aiWorker.js', import.meta.url), { type: 'module' });
      } catch (e) {
        aiWorkerUnavailable = true;
        return null;
      }
      return aiWorkerInstance;
    }

    function requestAiSearch(coreState, options) {
      return new Promise((resolve) => {
        const worker = getAiWorker();
        if (!worker) {
          resolve(null);
          return;
        }
        const id = ++aiWorkerRequestId;
        let settled = false;
        const finish = (value) => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        };
        const timeout = setTimeout(() => {
          worker.removeEventListener('message', onMessage);
          finish(null);
        }, 10000);
        const onMessage = (event) => {
          const data = event && event.data;
          if (!data || data.id !== id) return;
          clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          finish(data.error ? null : data.result);
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({ id, state: coreState, options });
      });
    }

    async function chooseSmartAIMoveAsync(color) {
      // Cheap tiers stay synchronous (random logic, depth 1)
      if (currentDifficulty === 'novice' || currentDifficulty === 'beginner') {
        return chooseSmartAIMove(color);
      }
      const result = await requestAiSearch(buildCoreState(color), getAiSearchProfile());
      const chosen = coreMoveToEngineMove(result && result.move);
      if (chosen && isEngineLegalMove(color, chosen)) return chosen;
      // Fallback: main-thread core search (worker unavailable or timed out)
      return chooseSmartAIMove(color);
    }

    async function triggerAIMoveNow() {
      if (isAnimatingMove || gameOver) return false;
      const chosen = await chooseSmartAIMoveAsync(currentTurn);
      if (!chosen || isAnimatingMove || gameOver) return false;
      const aiPromotion = chosen.promotion
        ? { promotion: PROMO_CORE_TO_TYPE[chosen.promotion] || 'queen' }
        : {};
      return executeChessMove(chosen.fromR, chosen.fromC, chosen.toR, chosen.toC, aiPromotion);
    }

    function maybeScheduleAIMove() {
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      if (gameOver || isAnimatingMove || preMoveHighlightTask) return;
      if (scriptedGameActive) return;
      if (gameMode !== 'single' || !aiAutoPlay) return;

      const aiColor = playerColor === 'w' ? 'b' : 'w';
      if (currentTurn === aiColor) {
        aiTimer = setTimeout(() => {
          aiTimer = null;
          if (
            !scriptedGameActive &&
            gameMode === 'single' &&
            currentTurn === aiColor &&
            !isAnimatingMove &&
            !gameOver
          ) {
            triggerAIMoveNow();
          }
        }, 540);
      }
    }

    // =========================================================================
    // Feature 3 (3a, 3b, 3c): Chess Notation Parser & Step-Through Choreography
    // =========================================================================
    // Chess Notation Parser & Step-Through Choreography:
    // parsing lives in the pure, unit-tested src/chess/notation.js module.
    function updateScriptBarUI() {
      const label = document.getElementById('script-step-label');
      const statusMsg = document.getElementById('script-status-msg');
      const prevBtn = document.getElementById('btn-script-prev');
      const nextBtn = document.getElementById('btn-script-next');

      const total = scriptMoves.length;
      if (label) {
        if (total === 0) {
          label.textContent = `Move ${moveHistory.length}`;
        } else if (scriptDeviated) {
          label.textContent = `Move ${moveHistory.length} • Custom Takeover`;
        } else if (scriptCursor < total) {
          const nextSan = scriptMoves[scriptCursor].san;
          label.textContent = `Step ${scriptCursor}/${total} • Next: ${nextSan}`;
        } else {
          label.textContent = `Step ${total}/${total} (Done)`;
        }
      }
      if (prevBtn) {
        prevBtn.disabled = moveHistory.length === 0 && !preMoveHighlightTask && !isAnimatingMove;
      }
      if (nextBtn) {
        nextBtn.disabled = gameOver || (!scriptDeviated && total > 0 && scriptCursor >= total && !preMoveHighlightTask);
      }
      if (statusMsg && total > 0) {
        if (scriptDeviated) {
          statusMsg.textContent = `Custom takeover active at Move ${moveHistory.length} (Use [ to step back or ] for AI move).`;
        } else {
          statusMsg.textContent = `Loaded ${total} half-moves. Step ${scriptCursor}/${total} ready (Use [ and ] to step, Arrow keys to rotate cam).`;
        }
      }
    }

    const DEFAULT_DIRECTOR_NOTATION =
      '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qd8 4. d4 c6 5. Bc4 h6 6. Nf3 Bg4 7. Bxf7+ Kxf7 8. Ne5+ Ke8 9. Qxg4 Nf6 10. Qg6#';

    function loadNotationScript(notationStr, options = {}) {
      const parsed = parseNotationToMoves(notationStr);
      scriptMoves = parsed;
      scriptCursor = 0;
      scriptDeviated = false;
      scriptedGameActive = parsed.length > 0;
      const inputEl = document.getElementById('input-notation');
      if (inputEl && notationStr) {
        inputEl.value = notationStr;
      }
      resetChessBoard(Boolean(options.orientCamera), true);
      updateScriptBarUI();
      return {
        ok: parsed.length > 0,
        count: parsed.length,
        moves: parsed
      };
    }

    function completeCurrentMoveImmediately() {
      if (preMoveHighlightTask) {
        const mv = preMoveHighlightTask.move;
        const fromScriptFlag = Boolean(preMoveHighlightTask.fromScript);
        preMoveHighlightTask = null;
        executeChessMove(mv.fromR, mv.fromC, mv.toR, mv.toC, { fromScript: fromScriptFlag, promotion: mv.promotion });
      }
      let safety = 0;
      while (activeMoveTweens.length > 0 && safety < 200) {
        safety++;
        for (let i = activeMoveTweens.length - 1; i >= 0; i--) {
          const done = activeMoveTweens[i](0.05);
          if (done) activeMoveTweens.splice(i, 1);
        }
      }
    }

    function isScriptMoveLegalOnCurrentBoard(mv) {
      if (!mv) return false;
      const piece = boardState[mv.fromR]?.[mv.fromC];
      if (!piece || piece.color !== currentTurn) return false;
      const destPiece = boardState[mv.toR]?.[mv.toC];
      if (destPiece && destPiece.color === piece.color) return false;
      const legals = getLegalMovesForPiece(mv.fromR, mv.fromC);
      return legals.some((m) => m.r === mv.toR && m.c === mv.toC);
    }

    function stepScriptForward() {
      if (gameOver) return false;

      // If a move animation or pre-move highlight is currently running, finish it cleanly before advancing
      if (isAnimatingMove || preMoveHighlightTask) {
        completeCurrentMoveImmediately();
        if (gameOver) return false;
        if (!scriptDeviated && scriptMoves.length > 0 && scriptCursor >= scriptMoves.length) return false;
      }

      // If no notation script has been loaded yet and no moves have been played, parse the default script in #input-notation
      if (scriptMoves.length === 0 && moveHistory.length === 0) {
        const defaultPgn =
          document.getElementById('input-notation')?.value || DEFAULT_DIRECTOR_NOTATION;
        loadNotationScript(defaultPgn, { orientCamera: false });
      }

      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }

      // Determine whether the next scripted move is still valid on the current board
      let nextMove = null;
      let isFromScript = false;
      if (!scriptDeviated && scriptCursor < scriptMoves.length) {
        const candidate = scriptMoves[scriptCursor];
        if (isScriptMoveLegalOnCurrentBoard(candidate)) {
          nextMove = candidate;
          isFromScript = true;
          scriptedGameActive = true;
        } else {
          scriptDeviated = true;
          scriptedGameActive = false;
        }
      }

      // If the user took over and deviated from the script, Next ] cleanly executes a smart legal move for currentTurn
      if (!nextMove) {
        if (!scriptDeviated && scriptMoves.length > 0 && scriptCursor >= scriptMoves.length) {
          return false;
        }
        const aiFallback = chooseSmartAIMove(currentTurn);
        if (!aiFallback) return false;
        nextMove = {
          fromR: aiFallback.fromR,
          fromC: aiFallback.fromC,
          toR: aiFallback.toR,
          toC: aiFallback.toC,
          color: currentTurn
        };
        isFromScript = false;
      }

      const chkHighlight = document.getElementById('chk-premove-highlight');
      const chkBoth = document.getElementById('chk-premove-both');
      const showPreHighlight = chkHighlight ? chkHighlight.checked : true;
      const highlightBothSides = chkBoth ? chkBoth.checked : false;

      // Feature 3c: When triggering moves for the player's side (or both sides if toggled),
      // first show selecting the piece and its legal destination squares before executing the move!
      if (showPreHighlight && (nextMove.color === playerColor || highlightBothSides)) {
        selectedSquare = { r: nextMove.fromR, c: nextMove.fromC };
        validMoves = getLegalMovesForPiece(nextMove.fromR, nextMove.fromC);
        showSquareHighlights(nextMove.fromR, nextMove.fromC, validMoves);
        preMoveHighlightTask = {
          move: nextMove,
          fromScript: isFromScript,
          elapsedSim: 0,
          startWallMs: performance.now(),
          duration: 0.62
        };
        updateScriptBarUI();
        return true;
      }

      return executeChessMove(nextMove.fromR, nextMove.fromC, nextMove.toR, nextMove.toC, {
        fromScript: isFromScript,
        promotion: nextMove.promotion
      });
    }

    function stepScriptBackward() {
      if (preMoveHighlightTask) {
        preMoveHighlightTask = null;
        clearSquareHighlights();
        selectedSquare = null;
        validMoves = [];
        updateScriptBarUI();
        return true;
      }

      if (moveHistory.length === 0) {
        return false;
      }

      const lastEntry = moveHistory.pop();
      restoreBoardSnapshot(lastEntry.snapshot);
      return true;
    }

    // =========================================================================
    // Feature 1: Toggle All On-Screen UI Off/On for Clean Cinematic Recording
    // =========================================================================
    function toggleUI(forceHidden) {
      const shouldHide =
        typeof forceHidden === 'boolean'
          ? forceHidden
          : !document.body.classList.contains('cinematic-ui-hidden');
      document.body.classList.toggle('cinematic-ui-hidden', shouldHide);
      const btnHide = document.getElementById('btn-hide-ui');
      if (btnHide) {
        btnHide.textContent = shouldHide ? 'Show UI [H]' : 'Hide UI [H]';
      }
      return shouldHide;
    }

    // =========================================================================
    // Feature 4: Video-Game Style WASD + R/F Translation & Arrow-Key Rotation
    // with Configurable Speed (Default 10%) & Smooth Ease-In / Ease-Out
    // =========================================================================
    const heldCameraKeys = new Set();
    const CAM_MOVE_KEY_CODES = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyR',
      'KeyF',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight'
    ]);
    let cameraKeySpeedPct = 35;
    let cameraRotSpeedPct = 35;
    const keyMoveVelocity = new THREE.Vector3(0, 0, 0);
    const keyRotVelocity = { yaw: 0, pitch: 0 };

    function setCameraKeySpeedPercent(pct) {
      const clamped = Math.max(1, Math.min(200, Math.round(Number(pct) || 10)));
      cameraKeySpeedPct = clamped;
      const sliderEl = document.getElementById('input-cam-speed');
      const valEl = document.getElementById('cam-speed-val');
      if (sliderEl && Number(sliderEl.value) !== clamped) {
        sliderEl.value = String(clamped);
      }
      if (valEl) {
        valEl.textContent = `${clamped}%`;
      }
      return cameraKeySpeedPct;
    }

    function setCameraRotSpeedPercent(pct) {
      const clamped = Math.max(1, Math.min(200, Math.round(Number(pct) || 10)));
      cameraRotSpeedPct = clamped;
      const sliderEl = document.getElementById('input-rot-speed');
      const valEl = document.getElementById('rot-speed-val');
      if (sliderEl && Number(sliderEl.value) !== clamped) {
        sliderEl.value = String(clamped);
      }
      if (valEl) {
        valEl.textContent = `${clamped}%`;
      }
      return cameraRotSpeedPct;
    }

    const camSpeedSliderEl = document.getElementById('input-cam-speed');
    if (camSpeedSliderEl) {
      camSpeedSliderEl.addEventListener('input', (e) => {
        setCameraKeySpeedPercent(e.target.value);
      });
      camSpeedSliderEl.addEventListener('change', (e) => {
        setCameraKeySpeedPercent(e.target.value);
      });
    }

    const rotSpeedSliderEl = document.getElementById('input-rot-speed');
    if (rotSpeedSliderEl) {
      rotSpeedSliderEl.addEventListener('input', (e) => {
        setCameraRotSpeedPercent(e.target.value);
      });
      rotSpeedSliderEl.addEventListener('change', (e) => {
        setCameraRotSpeedPercent(e.target.value);
      });
    }

    function isTypingInInput(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA' || el.isContentEditable) return true;
      if (tag === 'INPUT') {
        const type = (el.type || '').toLowerCase();
        return type !== 'range' && type !== 'checkbox' && type !== 'button';
      }
      return false;
    }

    window.addEventListener('keydown', (e) => {
      if (isTypingInInput(document.activeElement)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (CAM_MOVE_KEY_CODES.has(e.code)) {
        e.preventDefault();
        heldCameraKeys.add(e.code);
        return;
      }

      if (e.code === 'KeyH' || e.code === 'KeyU') {
        e.preventDefault();
        toggleUI();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (CAM_MOVE_KEY_CODES.has(e.code)) {
        heldCameraKeys.delete(e.code);
      }
    });

    window.addEventListener('blur', () => {
      heldCameraKeys.clear();
    });

    // =========================================================================
    // Feature 7: Checkmate Rigged King Fall-Over Animation & Cathedral Overlay
    // =========================================================================
    function spawnKingFallImpact(worldPos, color) {
      spawnArcaneRuneCircle(worldPos);
      spawnArcaneDissolveVFX(worldPos, color);
      impactFlashLight.position.set(worldPos.x, BOARD_SURFACE_Y + 0.35, worldPos.z);
      impactFlashLight.color.setHex(0xffdf78);
      impactFlashLight.intensity = 7.5;
      wizardChessAudio.playKingToppleThud(worldPos);
    }

    function showCheckmateBanner(winnerColor, defeatedColor) {
      const t = getTranslations();
      const overlay = document.getElementById('checkmate-overlay');
      const crownEl = document.getElementById('checkmate-crown');
      const titleEl = document.getElementById('checkmate-title');
      const subEl = document.getElementById('checkmate-subtitle');
      const replayBtn = document.getElementById('btn-checkmate-replay');
      const newGameBtn = document.getElementById('btn-checkmate-newgame');
      const dismissBtn = document.getElementById('btn-checkmate-dismiss');

      if (crownEl) crownEl.textContent = winnerColor === 'w' ? '♔' : '♚';
      if (titleEl) titleEl.textContent = t.checkmateTitle;
      if (subEl) {
        subEl.textContent = winnerColor === 'w' ? t.checkmateWhiteTriumphs : t.checkmateBlackTriumphs;
      }
      if (replayBtn) replayBtn.textContent = t.replayKingFall;
      if (newGameBtn) newGameBtn.textContent = t.btnNewGame;
      if (dismissBtn) dismissBtn.textContent = t.dismiss;
      if (overlay) {
        overlay.classList.add('visible');
      }
      checkmateState.bannerVisible = true;
    }

    function triggerCheckmateSequence(defeatedColor = currentTurn, winnerColor = null) {
      const actualWinner = winnerColor || (defeatedColor === 'w' ? 'b' : 'w');

      // Find the defeated King on the board
      let kingPiece = null;
      let kingR = -1;
      let kingC = -1;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = boardState[r][c];
          if (p && p.type === 'king' && p.color === defeatedColor) {
            kingPiece = p;
            kingR = r;
            kingC = c;
            break;
          }
        }
      }

      checkmateState.active = true;
      checkmateState.defeatedColor = defeatedColor;
      checkmateState.winnerColor = actualWinner;
      checkmateState.kingFallAngleDeg = 0;
      checkmateState.phase = 'stagger';

      if (!kingPiece || !kingPiece.mesh) {
        showCheckmateBanner(actualWinner, defeatedColor);
        return false;
      }

      // Find the checkmating victor piece so the King falls away and the victor strides in to occupy his square
      let attackerPiece = null;
      let attackerStartPos = null;
      if (moveHistory.length > 0) {
        const lastMv = moveHistory[moveHistory.length - 1].move;
        if (lastMv) {
          attackerPiece = boardState[lastMv.toR]?.[lastMv.toC];
          if (attackerPiece && attackerPiece.mesh) {
            attackerStartPos = attackerPiece.mesh.position.clone();
          }
        }
      }
      if (!attackerPiece) {
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = boardState[r][c];
            if (p && p.color === actualWinner && p.mesh) {
              const moves = getPseudoMovesForPiece(r, c, boardState);
              if (moves.some((m) => m.r === kingR && m.c === kingC)) {
                attackerPiece = p;
                attackerStartPos = p.mesh.position.clone();
                break;
              }
            }
          }
          if (attackerPiece) break;
        }
      }
      if (!attackerStartPos && attackerPiece && attackerPiece.mesh) {
        attackerStartPos = attackerPiece.mesh.position.clone();
      }

      const homePos = boardToWorld(kingR, kingC);
      const forwardDirZ = defeatedColor === 'b' ? 1 : -1;

      // Evaluate 16 candidate fall directions around the King to pick the clearest open path on the board
      let bestDirX = 0.24;
      let bestDirZ = forwardDirZ * 0.97;
      let bestScore = -Infinity;

      const awayFromAttacker = attackerStartPos
        ? new THREE.Vector2(homePos.x - attackerStartPos.x, homePos.z - attackerStartPos.z).normalize()
        : new THREE.Vector2(0.25, forwardDirZ).normalize();

      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const dx = Math.cos(ang);
        const dz = Math.sin(ang);

        // Check where the King's crown (0.50m from base) lands in board coordinates
        const tipWorldX = homePos.x + dx * 0.44;
        const tipWorldZ = homePos.z + dz * 0.44;
        const tipC = Math.round(tipWorldX / BOARD_SQ_SIZE + 3.5);
        const tipR = Math.round(tipWorldZ / BOARD_SQ_SIZE + 3.5);

        let score = 0;
        // Prefer staying inside the 8x8 board surface
        if (tipR >= 0 && tipR < 8 && tipC >= 0 && tipC < 8) {
          score += 40;
          const occ = boardState[tipR]?.[tipC];
          if (!occ) {
            score += 65; // Open square for the fallen King's body & crown!
          } else if (occ !== kingPiece) {
            score -= 50;
          }
        } else {
          score -= 35;
        }

        // Prefer falling away from the attacker's blow or forward-diagonally toward the center
        score += (dx * awayFromAttacker.x + dz * awayFromAttacker.y) * 18;
        score += dz * forwardDirZ * 14;

        if (score > bestScore) {
          bestScore = score;
          bestDirX = dx;
          bestDirZ = dz;
        }
      }

      const fallLen = Math.hypot(bestDirX, bestDirZ) || 1;
      const fallDirX = bestDirX / fallLen;
      const fallDirZ = bestDirZ / fallLen;

      // Highlight the defeated King's square with a crimson-and-gold Checkmate ring
      clearSquareHighlights();
      const outerRingGeo = new THREE.RingGeometry(0.135, 0.175, 36);
      outerRingGeo.rotateX(-Math.PI / 2);
      const outerRingMat = new THREE.MeshBasicMaterial({ color: 0xe63946, side: THREE.DoubleSide });
      const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
      outerRing.position.set(homePos.x, BOARD_SURFACE_Y + 0.012, homePos.z);
      squareHighlightsGroup.add(outerRing);

      const innerRingGeo = new THREE.RingGeometry(0.10, 0.125, 36);
      innerRingGeo.rotateX(-Math.PI / 2);
      const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e, side: THREE.DoubleSide });
      const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
      innerRing.position.set(homePos.x, BOARD_SURFACE_Y + 0.014, homePos.z);
      squareHighlightsGroup.add(innerRing);

      // Freeze the King's idle mixer permanently so its stone statue remains rigid and motionless
      if (kingPiece.currentAction) {
        kingPiece.currentAction.paused = true;
      }

      // Face the King toward the checkmating attacker (or forward) before toppling
      const baseYaw = attackerStartPos
        ? Math.atan2(attackerStartPos.x - homePos.x, attackerStartPos.z - homePos.z)
        : (defeatedColor === 'w' ? Math.PI : 0);
      const qBaseFacing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), baseYaw);
      // Right-handed horizontal axis perpendicular to fallDir so +angle pitches the King's crown toward (fallDirX, 0, fallDirZ)
      const tiltAxis = new THREE.Vector3(fallDirZ, 0, -fallDirX).normalize();
      const qTilt = new THREE.Quaternion();

      // Dynamic cinematic zoom framing the falling King and the triumphant victor piece
      if (heldCameraKeys.size === 0) {
        const duelMidX = attackerStartPos ? (homePos.x + attackerStartPos.x) * 0.5 : homePos.x;
        const duelMidZ = attackerStartPos ? (homePos.z + attackerStartPos.z) * 0.5 : homePos.z;
        const duelFocus = new THREE.Vector3(
          (homePos.x + duelMidX) * 0.5,
          BOARD_SURFACE_Y + 0.22,
          (homePos.z + duelMidZ) * 0.5
        );
        const camSideX = homePos.x >= 0 ? -0.85 : 0.85;
        const camSideZ = homePos.z + forwardDirZ * 0.95;
        smoothCameraTo(
          new THREE.Vector3(homePos.x + camSideX, BOARD_SURFACE_Y + 0.65, camSideZ),
          duelFocus,
          0.95
        );
      }

      const RIM_RADIUS = 0.135;    // Pedestal bottom rim radius so the lower edge stays grounded on the board
      const MAX_FALL_RAD = 1.50;   // 86 degrees: King lies fallen on its side across the board tiles
      const tStagger = 0.36;
      const tImpact = 1.12;
      const tTotal = 1.82;

      let elapsed = 0;
      let impactTriggered = false;
      let bannerShown = false;

      function applyKingTopplePose(thetaRad, shudderRoll = 0) {
        const clampedTheta = Math.max(-0.15, Math.min(1.55, thetaRad));
        checkmateState.kingFallAngleDeg = Number(((clampedTheta * 180) / Math.PI).toFixed(1));

        const px = homePos.x + fallDirX * RIM_RADIUS * (1 - Math.cos(clampedTheta));
        const py = BOARD_SURFACE_Y + RIM_RADIUS * Math.sin(Math.max(0, clampedTheta));
        const pz = homePos.z + fallDirZ * RIM_RADIUS * (1 - Math.cos(clampedTheta));
        kingPiece.mesh.position.set(px, py, pz);

        qTilt.setFromAxisAngle(tiltAxis, clampedTheta);
        if (Math.abs(shudderRoll) > 1e-4) {
          const qShudder = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(fallDirX, 0, fallDirZ),
            shudderRoll
          );
          qTilt.multiply(qShudder);
        }
        kingPiece.mesh.quaternion.copy(qTilt).multiply(qBaseFacing);
      }

      function stepKingFall(dt) {
        if (!checkmateState.active || !kingPiece.mesh) return true;
        elapsed += dt;

        if (!bannerShown && elapsed >= 0.48) {
          bannerShown = true;
          showCheckmateBanner(actualWinner, defeatedColor);
        }

        // Defeated King toppling trajectory
        if (elapsed <= tStagger) {
          // Phase 1: Royal Stagger & Tremor as the checkmate blow echoes through the King statue
          checkmateState.phase = 'stagger';
          const u = elapsed / tStagger;
          const shudder = Math.sin(u * Math.PI * 6) * 0.065 * (1 - u * 0.3);
          const initialLean = u * u * 0.12;
          applyKingTopplePose(initialLean, shudder);
        } else if (elapsed <= tImpact) {
          // Phase 2: Accelerating Gravity Topple around the stone pedestal rim (0.12 rad -> 1.50 rad = 86 deg)
          checkmateState.phase = 'topple';
          const u = Math.min(1, (elapsed - tStagger) / (tImpact - tStagger));
          const gravCurve = Math.pow(u, 2.25);
          const theta = 0.12 + (MAX_FALL_RAD - 0.12) * gravCurve;
          applyKingTopplePose(theta, 0);
        } else {
          // Phase 3: Heavy Stone Impact, Crown Shard Burst & Damped Restitution Bounce
          checkmateState.phase = 'impact';
          if (!impactTriggered) {
            impactTriggered = true;
            const crownImpactPos = new THREE.Vector3(
              homePos.x + fallDirX * 0.45,
              BOARD_SURFACE_Y,
              homePos.z + fallDirZ * 0.45
            );
            spawnKingFallImpact(crownImpactPos, defeatedColor);
          }

          const uBounce = Math.min(1, (elapsed - tImpact) / (tTotal - tImpact));
          const bounceAmp = 0.13 * Math.pow(1 - uBounce, 1.85);
          const theta = MAX_FALL_RAD - Math.abs(Math.sin(uBounce * Math.PI * 2.0)) * bounceAmp;
          applyKingTopplePose(theta, 0);

          // Subtle damped camera tremor when the heavy stone King crashes onto the altar board
          if (elapsed <= tImpact + 0.28) {
            const sProg = (elapsed - tImpact) / 0.28;
            const decay = (1 - sProg) * (1 - sProg);
            camera.position.y += Math.cos(sProg * Math.PI * 8) * 0.022 * decay;
          }
        }

        // Victorious piece marches decisively to occupy the fallen King's square!
        if (attackerPiece && attackerPiece.mesh && attackerStartPos) {
          const marchStart = 0.50;
          const marchDuration = 1.15;
          const marchElapsed = Math.max(0, elapsed - marchStart);
          const uMarch = Math.min(1, marchElapsed / marchDuration);
          const easeMarch = easeInOutCubic(uMarch);

          const dX = homePos.x - attackerStartPos.x;
          const dZ = homePos.z - attackerStartPos.z;
          const marchDist = Math.hypot(dX, dZ);

          if (marchDist > 0.02) {
            attackerPiece.mesh.position.lerpVectors(attackerStartPos, homePos, easeMarch);
            if (uMarch < 0.98) {
              attackerPiece.mesh.rotation.y = Math.atan2(dX, dZ);
              if (attackerPiece.currentAction !== attackerPiece.actions['Move']) {
                playPieceClip(attackerPiece, 'Move', true, 0.10);
              }
            } else {
              // Occupies King's throne tile in triumph!
              attackerPiece.mesh.position.copy(homePos);
              attackerPiece.mesh.rotation.y = actualWinner === 'w' ? Math.PI : 0;
              playPieceClip(attackerPiece, 'Idle', true, 0.18);
            }
          }
        }

        if (elapsed >= tTotal) {
          applyKingTopplePose(MAX_FALL_RAD, 0);
          checkmateState.phase = 'fallen';
          // Ensure King mixer is completely stopped so the fallen statue lies permanently motionless
          if (kingPiece.mixer) {
            kingPiece.mixer.stopAllAction();
          }
          if (attackerPiece && attackerPiece.mesh) {
            attackerPiece.mesh.position.copy(homePos);
            attackerPiece.mesh.rotation.y = actualWinner === 'w' ? Math.PI : 0;
            attackerPiece.r = kingR;
            attackerPiece.c = kingC;
            boardState[kingR][kingC] = attackerPiece;
          }
          if (!bannerShown) {
            showCheckmateBanner(actualWinner, defeatedColor);
          }
          return true;
        }
        return false;
      }

      activeMoveTweens.push(stepKingFall);
      return true;
    }

    // =========================================================================
    // UI & Turn Status Updates
    // =========================================================================
    function updateTurnUI() {
      const t = getTranslations();
      const turnDot = document.getElementById('turn-dot');
      const turnText = document.getElementById('turn-text');
      const modeBadge = document.getElementById('mode-badge');
      const btnAiMove = document.getElementById('btn-ai-move');
      const btnSideToggle = document.getElementById('btn-side-toggle');
      const capturedTray = document.getElementById('captured-tray');

      turnDot.className = 'turn-dot' + (currentTurn === 'b' ? ' black' : '');

      const legalMoves = getAllLegalMoves(currentTurn);
      const inCheck = isKingInCheck(currentTurn, boardState);

      const drawMessage = legalMoves.length > 0 ? getDrawMessage() : null;
      if (drawMessage) {
        gameOver = true;
        isClockRunning = false;
        turnText.textContent = drawMessage;
      } else if (legalMoves.length === 0) {
        gameOver = true;
        if (inCheck) {
          const winnerStr = currentTurn === 'w' ? t.checkmateBlackWins : t.checkmateWhiteWins;
          turnText.textContent = winnerStr;
          if (!checkmateState.active) {
            triggerCheckmateSequence(currentTurn, currentTurn === 'w' ? 'b' : 'w');
          }
        } else {
          turnText.textContent = t.stalemateDraw;
        }
      } else {
        const turnLabel = currentTurn === 'w' ? t.turnWhite : t.turnBlack;
        const aiColor = playerColor === 'w' ? 'b' : 'w';
        const isAiTurn = !scriptedGameActive && gameMode === 'single' && currentTurn === aiColor;
        if (inCheck) {
          turnText.textContent = `${turnLabel}${t.checkSuffix}`;
        } else if (isAiTurn) {
          turnText.textContent = `${turnLabel}${t.aiSuffix}`;
        } else {
          turnText.textContent = turnLabel;
        }
      }

      if (modeBadge) {
        modeBadge.textContent = playerColor === 'w' ? t.playingAsWhite : t.playingAsBlack;
      }
      if (btnAiMove) {
        btnAiMove.style.display = 'inline-flex';
        btnAiMove.textContent = t.btnAiMove;
      }
      if (btnSideToggle) {
        btnSideToggle.style.display = 'inline-flex';
        btnSideToggle.textContent = playerColor === 'w' ? t.btnPlayAsBlack : t.btnPlayAsWhite;
      }

      if (capturedByWhite > 0 || capturedByBlack > 0) {
        capturedTray.textContent = `${t.capturedPrefix} — ${t.capturedWhite}: ${capturedByWhite} | ${t.capturedBlack}: ${capturedByBlack}`;
      } else {
        capturedTray.textContent = '';
      }

      if (inCheck && !gameOver) {
        const attackers = getCheckAttackers(currentTurn, boardState);
        showCheckLaserBeams(currentTurn, attackers);
      } else {
        clearCheckLaserBeams();
      }
      updateClockDOM();

      if (typeof updateScriptBarUI === 'function') updateScriptBarUI();
    }

    // =========================================================================
    // Raycasting & Board Interaction
    // =========================================================================
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    renderer.domElement.addEventListener('pointerdown', (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('pointerup', (e) => {
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moveDist > 6) return;
      if (activeCathedralTour) {
        endCathedralTour(true);
        return;
      }
      if (previewingPly !== null) {
        returnToLiveGame();
        return;
      }
      if (isAnimatingMove || gameOver) return;

      // Enforce turn ownership in Multiplayer, and in Single Player only block while AI auto-move timer is actively pending
      if (gameMode === 'multi' && currentTurn !== playerColor) return;
      if (!scriptedGameActive && gameMode === 'single' && currentTurn !== playerColor && aiTimer !== null) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);

      const pieceMeshes = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (boardState[r][c] && boardState[r][c].mesh) {
            pieceMeshes.push(boardState[r][c].mesh);
          }
        }
      }

      const hits = raycaster.intersectObjects([...pieceMeshes, ...boardSquareMeshes], true);
      if (hits.length === 0) {
        if (preMoveHighlightTask) preMoveHighlightTask = null;
        clearSquareHighlights();
        selectedSquare = null;
        validMoves = [];
        return;
      }

      let clickedR = -1;
      let clickedC = -1;
      let obj = hits[0].object;
      while (obj) {
        if (obj.userData && obj.userData.piece) {
          clickedR = obj.userData.piece.r;
          clickedC = obj.userData.piece.c;
          break;
        }
        if (obj.userData && obj.userData.isSquare) {
          clickedR = obj.userData.r;
          clickedC = obj.userData.c;
          break;
        }
        obj = obj.parent;
      }

      if (clickedR === -1) return;

      // Cancel any pending scripted pre-move highlight timer when the user manually interacts with the board
      if (preMoveHighlightTask) {
        preMoveHighlightTask = null;
      }

      if (selectedSquare) {
        const move = validMoves.find(
          (m) =>
            (m.r === clickedR && m.c === clickedC) ||
            (m.castle && m.r === clickedR && m.rookFromC === clickedC)
        );
        if (move) {
          executeChessMove(selectedSquare.r, selectedSquare.c, move.r, move.c);
          return;
        }
      }

      const clickedPiece = boardState[clickedR][clickedC];
      if (clickedPiece && clickedPiece.color === currentTurn) {
        selectedSquare = { r: clickedR, c: clickedC };
        validMoves = getLegalMovesForPiece(clickedR, clickedC);
        showSquareHighlights(clickedR, clickedC, validMoves);
      } else {
        clearSquareHighlights();
        selectedSquare = null;
        validMoves = [];
      }
    });

    // =========================================================================

    // =========================================================================
    // Camera Presets & HUD Controls
    // =========================================================================
    const camButtons = [
      'btn-cam-player',
      'btn-cam-top',
      'btn-cam-side',
      'btn-cam-wide'
    ];

    function setActiveCamButton(activeId) {
      for (const id of camButtons) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', id === activeId);
      }
    }

    let playerCamSide = 'w';     // toggles 'w' (White) <-> 'b' (Black) on repeat click of Player Cam
    let overheadCamSide = 'w';   // toggles 'w' (White) <-> 'b' (Black) on repeat click of Overhead
    let sideCamSide = 'east';    // toggles 'east' (+X) <-> 'west' (-X) on repeat click of Side
    let cathedralWideSide = 'north'; // toggles 'north' (Rose Window) <-> 'south' (Narthex Triptych) on repeat click of Cathedral
    let currentCameraPreset = 'player';

    function updateOrbitControlsLock(preset) {
      currentCameraPreset = preset;
      if (preset === 'player') {
        orbitControls.enableRotate = true;
        orbitControls.enableZoom = true;
        orbitControls.enablePan = true;
        orbitControls.touches = {
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN
        };
      } else {
        // Locked in fixed presets (Overhead/Top, Side, Cathedral): lock touch orbit, pan, and canvas pinch/scroll zoom
        orbitControls.enableRotate = false;
        orbitControls.enableZoom = false;
        orbitControls.enablePan = false;
        orbitControls.touches = {
          ONE: THREE.TOUCH.NONE,
          TWO: THREE.TOUCH.NONE
        };
      }
    }

    function zoomCamera(directionFactor) {
      activeCamTransition = null;
      const offset = new THREE.Vector3().subVectors(camera.position, orbitControls.target);
      const currentDist = offset.length();
      if (currentDist < 0.001) return;
      const factor = directionFactor > 0 ? 0.82 : 1.22;
      const targetDist = THREE.MathUtils.clamp(
        currentDist * factor,
        orbitControls.minDistance || 0.95,
        orbitControls.maxDistance || 36.0
      );
      offset.setLength(targetDist);
      const targetPos = new THREE.Vector3().addVectors(orbitControls.target, offset);
      enforceCathedralBoundsAndSolidColumns(camera.position.clone(), targetPos, orbitControls.target);
      smoothCameraTo(targetPos, orbitControls.target.clone(), 0.28);
    }

    function zoomIn() {
      zoomCamera(1);
    }

    function zoomOut() {
      zoomCamera(-1);
    }

    function setCameraPose(posArr, targetArr) {
      activeCamTransition = null;
      if (Array.isArray(posArr) && posArr.length === 3) {
        camera.position.set(posArr[0], posArr[1], posArr[2]);
      }
      if (Array.isArray(targetArr) && targetArr.length === 3) {
        orbitControls.target.set(targetArr[0], targetArr[1], targetArr[2]);
      }
      enforceCathedralBoundsAndSolidColumns(null, camera.position, orbitControls.target);
      flushOrbitControlsDamping();
    }

    function setCameraPreset(preset) {
      if (activeCathedralTour) {
        endCathedralTour(true);
      }
      updateOrbitControlsLock(preset);
      if (preset === 'player') {
        const wasPlayerActive = document.getElementById('btn-cam-player')?.classList.contains('active');
        if (wasPlayerActive) {
          playerCamSide = playerCamSide === 'w' ? 'b' : 'w';
        } else {
          playerCamSide = playerColor === 'b' ? 'b' : 'w';
        }
        setActiveCamButton('btn-cam-player');
        setCameraForSide(playerCamSide, false);
      } else if (preset === 'top') {
        const wasTopActive = document.getElementById('btn-cam-top')?.classList.contains('active');
        if (wasTopActive) {
          overheadCamSide = overheadCamSide === 'w' ? 'b' : 'w';
        } else {
          overheadCamSide = playerColor === 'b' ? 'b' : 'w';
        }
        setActiveCamButton('btn-cam-top');
        const zSign = overheadCamSide === 'b' ? -1 : 1;
        smoothCameraTo(new THREE.Vector3(0, 6.85, zSign * 3.65), new THREE.Vector3(0, 0.78, 0), 0.75);
      } else if (preset === 'side') {
        const wasSideActive = document.getElementById('btn-cam-side')?.classList.contains('active');
        if (wasSideActive) {
          sideCamSide = sideCamSide === 'east' ? 'west' : 'east';
        } else {
          sideCamSide = 'east';
        }
        setActiveCamButton('btn-cam-side');
        const xSign = sideCamSide === 'west' ? -1 : 1;
        smoothCameraTo(new THREE.Vector3(xSign * 2.85, 1.85, 0), new THREE.Vector3(0, 0.84, 0), 0.75);
      } else if (preset === 'wide') {
        const wasWideActive = document.getElementById('btn-cam-wide')?.classList.contains('active');
        if (wasWideActive) {
          cathedralWideSide = cathedralWideSide === 'north' ? 'south' : 'north';
        } else {
          cathedralWideSide = playerColor === 'b' ? 'south' : 'north';
        }
        setActiveCamButton('btn-cam-wide');
        if (cathedralWideSide === 'south') {
          // Black's wide Cathedral perspective looking South toward the Narthex Triptych (chessboard centered in frame)
          smoothCameraTo(new THREE.Vector3(0, 2.55, -6.65), new THREE.Vector3(0, 1.95, 2.50), 0.85);
        } else {
          // White's wide Cathedral perspective looking North toward the Rose Window (chessboard centered in frame)
          smoothCameraTo(new THREE.Vector3(0, 2.55, 6.65), new THREE.Vector3(0, 1.95, -2.50), 0.85);
        }
      } else if (preset === 'white_backdrop') {
        smoothCameraTo(new THREE.Vector3(0, 2.35, -3.10), new THREE.Vector3(0, 2.20, 8.50), 0.85);
      } else if (preset === 'vaults') {
        smoothCameraTo(new THREE.Vector3(-1.60, 2.65, 3.20), new THREE.Vector3(2.20, 7.60, -9.50), 0.85);
      } else if (preset === 'side_windows') {
        smoothCameraTo(new THREE.Vector3(-1.40, 2.30, 0.60), new THREE.Vector3(5.20, 4.10, -5.80), 0.85);
      } else if (preset === 'back_windows') {
        smoothCameraTo(new THREE.Vector3(0, 3.40, -7.80), new THREE.Vector3(0, 4.60, -18.10), 0.85);
      } else if (preset === 'rear_windows') {
        smoothCameraTo(new THREE.Vector3(0, 3.40, 7.80), new THREE.Vector3(0, 4.60, 18.10), 0.85);
      }
    }

    document.getElementById('btn-cam-player')?.addEventListener('click', () => setCameraPreset('player'));
    document.getElementById('btn-cam-top')?.addEventListener('click', () => setCameraPreset('top'));
    document.getElementById('btn-cam-side')?.addEventListener('click', () => setCameraPreset('side'));
    document.getElementById('btn-cam-wide')?.addEventListener('click', () => setCameraPreset('wide'));
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => zoomOut());
    document.getElementById('btn-hide-ui')?.addEventListener('click', () => toggleUI());

    document.getElementById('btn-script-modal')?.addEventListener('click', () => openLobbyModal('script'));
    document.getElementById('btn-script-prev')?.addEventListener('click', () => stepScriptBackward());
    document.getElementById('btn-script-next')?.addEventListener('click', () => stepScriptForward());

    document.getElementById('btn-ai-move')?.addEventListener('click', () => {
      triggerAIMoveNow();
    });

    document.getElementById('btn-side-toggle')?.addEventListener('click', () => {
      if (gameMode !== 'single') return;
      playerColor = playerColor === 'w' ? 'b' : 'w';
      clearSavedGame();
      resetChessBoard(true, scriptedGameActive);
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      clearSavedGame();
      resetChessBoard(true, false);
    });

    document.getElementById('btn-hint')?.addEventListener('click', () => {
      getBestHintMove();
    });

    // =========================================================================
    // Lobby & Director Script Modal Interactions
    // =========================================================================
    const lobbyModal = document.getElementById('lobby-modal');
    let selectedSpColor = 'w';

    function openLobbyModal(tab = null) {
      lobbyModal?.classList.add('open');
      if (tab === 'multi') switchLobbyTab('multi');
      else if (tab === 'script') switchLobbyTab('script');
      else if (tab === 'single') switchLobbyTab('single');
    }

    function closeLobbyModal() {
      lobbyModal?.classList.remove('open');
    }

    function switchLobbyTab(tab) {
      const isSingle = tab === 'single';
      const isMulti = tab === 'multi';
      const isScript = tab === 'script';
      document.getElementById('tab-single').classList.toggle('active', isSingle);
      document.getElementById('tab-multi').classList.toggle('active', isMulti);
      document.getElementById('tab-script').classList.toggle('active', isScript);
      document.getElementById('panel-single').style.display = isSingle ? 'block' : 'none';
      document.getElementById('panel-multi').style.display = isMulti ? 'block' : 'none';
      document.getElementById('panel-script').style.display = isScript ? 'block' : 'none';
    }

    document.getElementById('btn-lobby')?.addEventListener('click', () => openLobbyModal());
    document.getElementById('btn-close-lobby')?.addEventListener('click', closeLobbyModal);
    document.getElementById('tab-single')?.addEventListener('click', () => switchLobbyTab('single'));
    document.getElementById('tab-multi')?.addEventListener('click', () => switchLobbyTab('multi'));
    document.getElementById('tab-script')?.addEventListener('click', () => switchLobbyTab('script'));

    document.getElementById('btn-preset-scandi')?.addEventListener('click', () => {
      document.getElementById('input-notation').value = DEFAULT_DIRECTOR_NOTATION;
    });
    document.getElementById('btn-preset-italian')?.addEventListener('click', () => {
      document.getElementById('input-notation').value =
        '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+';
    });
    document.getElementById('btn-preset-scholar')?.addEventListener('click', () => {
      document.getElementById('input-notation').value =
        '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#';
    });

    document.getElementById('btn-load-notation')?.addEventListener('click', () => {
      const val = document.getElementById('input-notation').value;
      const res = loadNotationScript(val, { orientCamera: false });
      if (res.ok) {
        closeLobbyModal();
      } else {
        document.getElementById('script-status-msg').textContent =
          'Could not parse notation. Please enter valid PGN/SAN (e.g. 1. e4 e5 2. Nf3 Nc6) or UCI.';
      }
    });

    document.getElementById('pick-sp-white')?.addEventListener('click', () => {
      selectedSpColor = 'w';
      document.getElementById('pick-sp-white').classList.add('selected');
      document.getElementById('pick-sp-black').classList.remove('selected');
    });
    document.getElementById('pick-sp-black')?.addEventListener('click', () => {
      selectedSpColor = 'b';
      document.getElementById('pick-sp-black').classList.add('selected');
      document.getElementById('pick-sp-white').classList.remove('selected');
    });

    document.getElementById('btn-start-single')?.addEventListener('click', () => {
      scriptedGameActive = false;
      gameMode = 'single';
      playerColor = selectedSpColor;
      window.history.replaceState({}, '', window.location.pathname);
      closeLobbyModal();
      resetChessBoard(true);
    });

    document.getElementById('btn-checkmate-stepback')?.addEventListener('click', () => {
      stepScriptBackward();
    });
    document.getElementById('btn-checkmate-replay')?.addEventListener('click', () => {
      const defCol = checkmateState.defeatedColor || currentTurn;
      const winCol = checkmateState.winnerColor || (defCol === 'w' ? 'b' : 'w');
      triggerCheckmateSequence(defCol, winCol);
    });
    document.getElementById('btn-checkmate-newgame')?.addEventListener('click', () => {
      clearSavedGame();
      resetChessBoard(true, false);
    });
    document.getElementById('btn-checkmate-dismiss')?.addEventListener('click', () => {
      const overlay = document.getElementById('checkmate-overlay');
      if (overlay) overlay.classList.remove('visible');
      checkmateState.bannerVisible = false;
    });

    document.getElementById('select-time-control')?.addEventListener('change', (e) => {
      setTimeControl(e.target.value);
    });
    document.getElementById('select-game-variant')?.addEventListener('change', (e) => {
      const v = e.target.value;
      currentVariant = v;
      if (v === 'chess960') currentChess960Layout = generateChess960BackRow();
      else currentChess960Layout = null;
      resetChessBoard(true);
    });
    document.getElementById('select-ai-difficulty')?.addEventListener('change', (e) => {
      currentDifficulty = e.target.value;
    });

    document.getElementById('btn-undo')?.addEventListener('click', () => {
      undoChessMove();
    });

    subscribeLanguage(() => {
      updateTurnUI();
      if (checkmateState.bannerVisible) {
        const defCol = checkmateState.defeatedColor || currentTurn;
        const winCol = checkmateState.winnerColor || (defCol === 'w' ? 'b' : 'w');
        showCheckmateBanner(winCol, defCol);
      }
    });

    // =========================================================================
    // Programmatic API for Automated Verification & Camera Inspection
    // =========================================================================
    window.wizardChess = {
      zoomIn,
      zoomOut,
      zoomCamera,
      isCameraLocked: () => !orbitControls.enableRotate,
      getCurrentCameraPreset: () => currentCameraPreset,
      getCameraLockState: () => ({
        preset: currentCameraPreset,
        locked: !orbitControls.enableRotate,
        enableRotate: orbitControls.enableRotate,
        enableZoom: orbitControls.enableZoom,
        enablePan: orbitControls.enablePan
      }),
      setLanguage: (lang) => {
        setI18nLanguage(lang);
        updateTurnUI();
        if (checkmateState.bannerVisible) {
          const defCol = checkmateState.defeatedColor || currentTurn;
          const winCol = checkmateState.winnerColor || (defCol === 'w' ? 'b' : 'w');
          showCheckmateBanner(winCol, defCol);
        }
      },
      getLanguage,
      setCameraPreset,
      setCameraPose,
      setCameraLook: setCameraPose,
      setCameraKeySpeedPercent,
      setCameraRotSpeedPercent,
      setWallStoneLook,
      nextWallStoneLook,
      prevWallStoneLook,
      setFloorStoneLook,
      nextFloorStoneLook,
      prevFloorStoneLook,
      WALL_STONE_LOOKS,
      FLOOR_STONE_LOOKS,
      holdCameraKey: (code, down = true) => {
        if (down) heldCameraKeys.add(code);
        else heldCameraKeys.delete(code);
      },
      executeChessMove,
      triggerAIMoveNow,
      resetChessBoard,
      openLobbyModal,
      closeLobbyModal,
      toggleUI,
      toggleSound: () => wizardChessAudio.toggleMute(),
      isSoundEnabled: () => wizardChessAudio.isEnabled(),
      setVolume: (v) => wizardChessAudio.setVolume(v),
      getVolume: () => wizardChessAudio.getVolume(),
      getBestHintMove,
      wizardChessAudio,
      loadNotation: (pgn, opts) => loadNotationScript(pgn, opts),
      stepScriptForward,
      stepScriptBackward,
      triggerCheckmateSequence,
      testColumnCollisionSlide: (startArr, endArr, steps = 20) => {
        activeCamTransition = null;
        camera.position.set(startArr[0], startArr[1], startArr[2]);
        const path = [];
        for (let i = 1; i <= steps; i++) {
          const u = i / steps;
          const prev = camera.position.clone();
          camera.position.set(
            startArr[0] + (endArr[0] - startArr[0]) * u,
            startArr[1] + (endArr[1] - startArr[1]) * u,
            startArr[2] + (endArr[2] - startArr[2]) * u
          );
          enforceCathedralBoundsAndSolidColumns(prev, camera.position, orbitControls.target);
          path.push(camera.position.toArray().map((v) => Number(v.toFixed(3))));
        }
        renderer.render(scene, camera);
        return path;
      },
      setSinglePlayerSide: (color) => {
        scriptedGameActive = false;
        gameMode = 'single';
        playerColor = color === 'b' ? 'b' : 'w';
        clearSavedGame();
        resetChessBoard(true);
      },
      setupCustomScenario: (pieces, turn = 'w') => {
        if (aiTimer) {
          clearTimeout(aiTimer);
          aiTimer = null;
        }
        activeMoveTweens.length = 0;
        isAnimatingMove = false;
        gameOver = false;
        scriptedGameActive = false;
        scriptDeviated = false;
        preMoveHighlightTask = null;
        clearCheckmateSequence();
        clearSquareHighlights();
        clearAllPieces();
        for (const p of pieces) {
          const inst = instantiatePiece(p.type, p.color, p.r, p.c);
          inst.hasMoved = Boolean(p.hasMoved);
          boardState[p.r][p.c] = inst;
        }
        currentTurn = turn;
        updateTurnUI();
        renderer.render(scene, camera);
      },
      triggerDemoCapture: () => {
        // Set up an immediate pawn capture (e4 x d5) and execute it
        resetChessBoard(true);
        // Move White e2->e4 and Black d7->d5 immediately on boardState, then animate White e4xd5
        const wp = boardState[6][4];
        boardState[6][4] = null;
        boardState[4][4] = wp;
        wp.r = 4; wp.c = 4;
        wp.mesh.position.copy(boardToWorld(4, 4));

        const bp = boardState[1][3];
        boardState[1][3] = null;
        boardState[3][3] = bp;
        bp.r = 3; bp.c = 3;
        bp.mesh.position.copy(boardToWorld(3, 3));

        currentTurn = 'w';
        return executeChessMove(4, 4, 3, 3);
      },
      getState: () => ({
        gameMode,
        scriptedGameActive,
        scriptDeviated,
        scriptMovesCount: scriptMoves.length,
        scriptCursor,
        moveHistoryCount: moveHistory.length,
        preMoveHighlightActive: Boolean(preMoveHighlightTask),
        selectedSquare,
        validMovesCount: validMoves.length,
        highlightMeshCount: squareHighlightsGroup.children.length,
        uiHidden: document.body.classList.contains('cinematic-ui-hidden'),
        playerColor,
        currentTurn,
        isAnimatingMove,
        gameOver,
        checkmateState: { ...checkmateState },
        capturedByWhite,
        capturedByBlack,
        cameraPos: camera.position.toArray(),
        cameraTarget: orbitControls.target.toArray(),
        playerCamSide,
        overheadCamSide,
        sideCamSide,
        cathedralWideSide,
        cameraKeySpeedPct,
        cameraRotSpeedPct,
        wallStoneLookIndex: currentWallStoneLookIdx,
        wallStoneLookName: WALL_STONE_LOOKS[currentWallStoneLookIdx]?.name || '',
        floorStoneLookIndex: currentFloorStoneLookIdx,
        floorStoneLookName: FLOOR_STONE_LOOKS[currentFloorStoneLookIdx]?.name || '',
        floorMaterialRoughness: cathedralFloorMats[0]?.roughness ?? null,
        floorMaterialMetalness: cathedralFloorMats[0]?.metalness ?? null,
        keyMoveVelocity: keyMoveVelocity.toArray().map((v) => Number(v.toFixed(4))),
        keyRotVelocity: {
          yaw: Number(keyRotVelocity.yaw.toFixed(4)),
          pitch: Number(keyRotVelocity.pitch.toFixed(4))
        },
        cathedralBounds: CATHEDRAL_BOUNDS,
        solidColumnsCount: CATHEDRAL_SOLID_PILLARS.filter((p) => p.isColumn).length,
        brazierPillars: CATHEDRAL_SOLID_PILLARS.filter((p) => !p.isColumn),
        telemetry: cameraTelemetry,
        currentDifficulty,
        currentVariant,
        chess960Layout: currentChess960Layout,
        timeControl: currentTimeControl,
        clockWhiteSeconds,
        clockBlackSeconds,
        isClockRunning,
        activeCheckBeamsCount: activeCheckBeams.length,
        moveHistoryNotation: [...moveHistoryNotation]
      }),
      undoMove: undoChessMove,
      undoChessMove,
      getMoveHistoryNotation: () => [...moveHistoryNotation],
      updateMoveHistoryDOM: updateMoveHistoryDOM,
      previewHistoryPly,
      returnToLiveGame,
      getPreviewingPly: () => previewingPly,
      updateLastMoveHighlight,
      clearLastMoveHighlight,
      startCathedralTour,
      endCathedralTour,
      isCathedralTourActive: () => Boolean(activeCathedralTour),
      startMatchClocks,
      dispose: disposeWizardChess,
      setDifficulty: (diff) => {
        currentDifficulty = diff;
      },
      getDifficulty: () => currentDifficulty,
      setVariant: (v, layoutIdx = -1) => {
        currentVariant = v;
        if (v === 'chess960') currentChess960Layout = generateChess960BackRow(layoutIdx);
        else currentChess960Layout = null;
        clearSavedGame();
        resetChessBoard(true);
      },
      getVariant: () => currentVariant,
      getChess960Layout: () => currentChess960Layout,
      generateChess960BackRow,
      setTimeControl,
      getTimeControl: () => currentTimeControl,
      resetChessClocks,
      TIME_CONTROLS,
      getClockState: () => ({
        timeControl: currentTimeControl,
        whiteSeconds: clockWhiteSeconds,
        blackSeconds: clockBlackSeconds,
        isRunning: isClockRunning,
        flagFallen: clockFlagFallen
      }),
      getCheckAttackers,
      showCheckLaserBeams,
      clearCheckLaserBeams,
      getActiveCheckBeamsCount: () => activeCheckBeams.length,
      getActiveKingThreatAura: () => activeKingThreatAura,
      setBoardStoneTexture: applyBoardStoneTexture,
      getBoardStoneTexture: () => currentBoardStoneLook,
      setPromotionPiece: (type) => {
        if (['queen', 'rook', 'knight', 'bishop'].includes(type)) {
          promotionPreference = type;
        }
        return promotionPreference;
      },
      getPromotionPiece: () => promotionPreference,
      saveGameToStorage,
      restoreSavedGame,
      clearSavedGame,
      hasSavedGame,
      getGamePgn,
      BOARD_STONE_LOOKS,
      isKingInCheck,
      captureScreenshot: async (filename) => {
        renderer.render(scene, camera);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = renderer.domElement.width;
        outCanvas.height = renderer.domElement.height;
        const ctx = outCanvas.getContext('2d');
        ctx.drawImage(renderer.domElement, 0, 0);

        const scale = outCanvas.width / window.innerWidth;

        // Draw Gothic Cathedral Checkmate Banner if active
        if (checkmateState.bannerVisible) {
          ctx.save();
          ctx.scale(scale, scale);
          const bw = 560;
          const bh = 168;
          const bx = (window.innerWidth - bw) / 2;
          const by = 84;

          ctx.fillStyle = 'rgba(10, 12, 20, 0.94)';
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.88)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 6);
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = 'rgba(212, 175, 55, 0.38)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bx + 6, by + 6, bw - 12, bh - 12, 4);
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(212, 175, 55, 0.88)';
          ctx.font = '600 12px Georgia, serif';
          ctx.fillText('✦   SANCTUM JUDGMENT   ✦', window.innerWidth / 2, by + 28);

          ctx.fillStyle = '#f5d76e';
          ctx.font = '26px serif';
          const crownChar = checkmateState.winnerColor === 'b' ? '♚' : '♔';
          ctx.fillText(crownChar, window.innerWidth / 2, by + 56);

          ctx.fillStyle = '#f7e299';
          ctx.font = 'bold 40px Georgia, serif';
          ctx.fillText('C H E C K M A T E', window.innerWidth / 2, by + 102);

          ctx.strokeStyle = 'rgba(212, 175, 55, 0.65)';
          ctx.beginPath();
          ctx.moveTo(bx + 90, by + 116);
          ctx.lineTo(bx + bw - 90, by + 116);
          ctx.stroke();

          const subTxt =
            document.getElementById('checkmate-subtitle')?.textContent ||
            'WHITE TRIUMPHS • THE BLACK KING HAS FALLEN';
          ctx.fillStyle = '#f0ece1';
          ctx.font = 'bold 14px Georgia, serif';
          ctx.fillText(subTxt.toUpperCase(), window.innerWidth / 2, by + 142);
          ctx.restore();
        }

        // Only draw HUD summary bar if UI is NOT hidden by cinematic mode
        if (!document.body.classList.contains('cinematic-ui-hidden')) {
          ctx.save();
          ctx.scale(scale, scale);
          ctx.fillStyle = 'rgba(12, 15, 22, 0.82)';
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(16, 16, 520, 42, 10);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#d4af37';
          ctx.font = 'bold 13px Inter, sans-serif';
          ctx.fillText('WIZARD CHESS', 30, 42);

          const turnStr = document.getElementById('turn-text')?.textContent || '';
          const modeStr = document.getElementById('mode-badge')?.textContent || '';
          ctx.fillStyle = '#f0ece1';
          ctx.font = '600 13px Inter, sans-serif';
          ctx.fillText(`${turnStr}   |   ${modeStr}`, 155, 42);

          ctx.restore();
        }

        const dataUrl = outCanvas.toDataURL('image/png');
        const res = await fetch('/api/upload-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl, filename })
        });
        return res.json();
      }
    };

    window.wizardChess.stepBy = (seconds, steps = 24) => {
      const subDt = seconds / steps;
      for (let i = 0; i < steps; i++) {
        stepScene(subDt, false);
      }
      renderer.render(scene, camera);
    };

    // =========================================================================
    // Main Animation Loop
    // =========================================================================
    let elapsedTotal = 0;
    function stepScene(dt, doRender = true) {
      elapsedTotal += dt;
      wizardChessAudio.updateListener(camera);
      const prevCamPos = camera.position.clone();

      if (activeCathedralTour) {
        stepCathedralTour(dt);
      } else {
        stepChessClocks(dt);
      }

      if (activeCheckBeams.length > 0 || activeKingThreatAura) {
        const pulse = 0.85 + Math.sin(elapsedTotal * 16.0) * 0.15;
        const glowPulse = 0.38 + Math.sin(elapsedTotal * 12.0) * 0.14;
        const ringPulse = 0.72 + Math.sin(elapsedTotal * 8.0) * 0.22;
        for (const beam of activeCheckBeams) {
          if (beam.core) beam.core.material.opacity = pulse;
          if (beam.halo) beam.halo.material.opacity = glowPulse;
          if (beam.ring) beam.ring.material.opacity = ringPulse;
        }
        if (checkLaserAlertLight) {
          checkLaserAlertLight.intensity = 3.2 + Math.sin(elapsedTotal * 14.0) * 1.4;
        }
        if (activeKingThreatAura) {
          stepKingThreatAura(dt, elapsedTotal);
        }
      }

      if (lastMoveHighlightsGroup && lastMoveHighlightsGroup.children.length > 0) {
        const lmPulse = 0.76 + Math.sin(elapsedTotal * 3.2) * 0.14;
        for (const child of lastMoveHighlightsGroup.children) {
          if (child && child.material) {
            child.material.opacity = lmPulse;
          }
        }
      }

      for (const mixer of activeMixers) {
        mixer.update(dt);
      }

      // Feature 3c: Advance pre-move piece selection & valid-squares highlight beat before executing scripted move
      if (preMoveHighlightTask && !isAnimatingMove) {
        preMoveHighlightTask.elapsedSim += dt;
        const wallElapsed = (performance.now() - preMoveHighlightTask.startWallMs) / 1000;
        if (
          preMoveHighlightTask.elapsedSim >= preMoveHighlightTask.duration ||
          wallElapsed >= preMoveHighlightTask.duration
        ) {
          const mv = preMoveHighlightTask.move;
          const fromScriptFlag = Boolean(preMoveHighlightTask.fromScript);
          preMoveHighlightTask = null;
          executeChessMove(mv.fromR, mv.fromC, mv.toR, mv.toC, { fromScript: fromScriptFlag, promotion: mv.promotion });
        }
      }

      for (let i = activeMoveTweens.length - 1; i >= 0; i--) {
        const done = activeMoveTweens[i](dt);
        if (done) activeMoveTweens.splice(i, 1);
      }

      // Feature 4: Video-game style WASD + R/F camera translation AND Arrow-key camera rotation
      // with separate UI-configurable Move Speed & Rot Speed (both default 10%) and smooth ease-in / ease-out velocity damping
      if (!isAnimatingMove) {
        const moveSpeedScale = cameraKeySpeedPct / 100;
        const rotSpeedScale = cameraRotSpeedPct / 100;
        const maxMoveSpeed = 3.2 * moveSpeedScale; // 0.32 m/s at default 10%
        const maxVertSpeed = 2.6 * moveSpeedScale; // 0.26 m/s at default 10%
        const maxRotSpeed = 1.2 * rotSpeedScale;   // 0.12 rad/s at default 10%

        const forward = new THREE.Vector3().subVectors(orbitControls.target, camera.position);
        forward.y = 0;
        if (forward.lengthSq() < 1e-6) {
          camera.getWorldDirection(forward);
          forward.y = 0;
        }
        forward.normalize();
        const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

        const horizDir = new THREE.Vector3(0, 0, 0);
        if (heldCameraKeys.has('KeyW')) horizDir.add(forward);
        if (heldCameraKeys.has('KeyS')) horizDir.sub(forward);
        if (heldCameraKeys.has('KeyD')) horizDir.add(right);
        if (heldCameraKeys.has('KeyA')) horizDir.sub(right);
        if (horizDir.lengthSq() > 1e-6) horizDir.normalize();

        const desiredMoveVel = horizDir.multiplyScalar(maxMoveSpeed);
        if (heldCameraKeys.has('KeyR')) desiredMoveVel.y += maxVertSpeed;
        if (heldCameraKeys.has('KeyF')) desiredMoveVel.y -= maxVertSpeed;

        let desiredYawVel = 0;
        let desiredPitchVel = 0;
        if (heldCameraKeys.has('ArrowLeft')) desiredYawVel += maxRotSpeed;
        if (heldCameraKeys.has('ArrowRight')) desiredYawVel -= maxRotSpeed;
        if (heldCameraKeys.has('ArrowUp')) desiredPitchVel += maxRotSpeed;
        if (heldCameraKeys.has('ArrowDown')) desiredPitchVel -= maxRotSpeed;

        // Smooth ease-in when keys are pressed and smooth ease-out when keys are released
        const easeAlpha = 1 - Math.exp(-Math.max(0.001, dt) * 7.5);
        keyMoveVelocity.lerp(desiredMoveVel, easeAlpha);
        keyRotVelocity.yaw += (desiredYawVel - keyRotVelocity.yaw) * easeAlpha;
        keyRotVelocity.pitch += (desiredPitchVel - keyRotVelocity.pitch) * easeAlpha;

        if (keyMoveVelocity.lengthSq() < 1e-8 && desiredMoveVel.lengthSq() === 0) {
          keyMoveVelocity.set(0, 0, 0);
        }
        if (Math.abs(keyRotVelocity.yaw) < 1e-5 && desiredYawVel === 0) keyRotVelocity.yaw = 0;
        if (Math.abs(keyRotVelocity.pitch) < 1e-5 && desiredPitchVel === 0) keyRotVelocity.pitch = 0;

        const hasActiveMove = keyMoveVelocity.lengthSq() > 0;
        const hasActiveRot = keyRotVelocity.yaw !== 0 || keyRotVelocity.pitch !== 0;

        if (hasActiveMove || hasActiveRot) {
          activeCamTransition = null;

          if (hasActiveMove) {
            const moveDelta = keyMoveVelocity.clone().multiplyScalar(dt);
            const beforeMovePos = camera.position.clone();
            camera.position.add(moveDelta);
            enforceCathedralBoundsAndSolidColumns(beforeMovePos, camera.position, orbitControls.target);
            const actualMoveDelta = camera.position.clone().sub(beforeMovePos);
            orbitControls.target.add(actualMoveDelta);
          }

          if (hasActiveRot) {
            const lookOffset = new THREE.Vector3().subVectors(orbitControls.target, camera.position);
            const dist = Math.max(0.5, lookOffset.length());
            const dir = lookOffset.normalize();
            let yaw = Math.atan2(dir.x, dir.z);
            let pitch = Math.asin(Math.max(-0.98, Math.min(0.98, dir.y)));

            yaw += keyRotVelocity.yaw * dt;
            pitch = Math.max(-1.35, Math.min(1.35, pitch + keyRotVelocity.pitch * dt));

            const cosP = Math.cos(pitch);
            const newOffset = new THREE.Vector3(
              Math.sin(yaw) * cosP * dist,
              Math.sin(pitch) * dist,
              Math.cos(yaw) * cosP * dist
            );
            orbitControls.target.copy(camera.position).add(newOffset);
          }

          if (heldCameraKeys.size > 0) {
            document
              .querySelectorAll('#btn-cam-player, #btn-cam-wide, #btn-cam-top, #btn-cam-side')
              .forEach((b) => b.classList.remove('active'));
          }
        }
      }

      if (activeCamTransition && !isAnimatingMove) {
        activeCamTransition.elapsed += dt;
        const u = Math.min(1, activeCamTransition.elapsed / activeCamTransition.duration);
        const ease = easeInOutCubic(u);
        camera.position.lerpVectors(activeCamTransition.startPos, activeCamTransition.endPos, ease);
        orbitControls.target.lerpVectors(activeCamTransition.startTarget, activeCamTransition.endTarget, ease);
        enforceCathedralBoundsAndSolidColumns(prevCamPos, camera.position, orbitControls.target);
        camera.lookAt(orbitControls.target);
        if (u >= 1) {
          activeCamTransition = null;
          flushOrbitControlsDamping();
        }
      } else if (orbitControls.enabled && !isAnimatingMove) {
        orbitControls.update();
        enforceCathedralBoundsAndSolidColumns(prevCamPos, camera.position, orbitControls.target);
        camera.lookAt(orbitControls.target);
      } else if (isAnimatingMove) {
        enforceCathedralBoundsAndSolidColumns(prevCamPos, camera.position, orbitControls.target);
        camera.lookAt(orbitControls.target);
      }

      if (impactFlashLight.intensity > 0) {
        impactFlashLight.intensity = Math.max(0, impactFlashLight.intensity - dt * 28);
      }

      for (let i = shatterDebris.length - 1; i >= 0; i--) {
        const d = shatterDebris[i];
        d.life -= dt;
        if (d.life <= 0) {
          scene.remove(d.mesh);
          shatterDebris.splice(i, 1);
          continue;
        }
        d.vel.y -= 9.8 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        if (d.mesh.position.y < BOARD_SURFACE_Y + 0.03) {
          d.mesh.position.y = BOARD_SURFACE_Y + 0.03;
          d.vel.y *= -0.35;
          d.vel.x *= 0.72;
          d.vel.z *= 0.72;
        }
        // Bounce flying stone shards off intact pieces on the board so all statues feel solid
        if (d.mesh.position.y < BOARD_SURFACE_Y + 0.48) {
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const p = boardState[r][c];
              if (p && p.mesh) {
                const rx = d.mesh.position.x - p.mesh.position.x;
                const rz = d.mesh.position.z - p.mesh.position.z;
                const rDist = Math.hypot(rx, rz);
                if (rDist < 0.165 && rDist > 0.0001) {
                  const nx = rx / rDist;
                  const nz = rz / rDist;
                  d.mesh.position.x = p.mesh.position.x + nx * 0.165;
                  d.mesh.position.z = p.mesh.position.z + nz * 0.165;
                  const vn = d.vel.x * nx + d.vel.z * nz;
                  if (vn < 0) {
                    d.vel.x -= 1.55 * vn * nx;
                    d.vel.z -= 1.55 * vn * nz;
                  }
                }
              }
            }
          }
        }
        d.mesh.rotation.x += d.rotVel.x * dt;
        d.mesh.rotation.y += d.rotVel.y * dt;
        d.mesh.rotation.z += d.rotVel.z * dt;
        if (d.life < 0.5) {
          const s = Math.max(0.01, d.life * 2);
          d.mesh.scale.setScalar((d.baseScale || 0.036) * s);
        }
      }

      for (let i = activeRuneCircles.length - 1; i >= 0; i--) {
        const rc = activeRuneCircles[i];
        rc.life -= dt;
        if (rc.life <= 0) {
          scene.remove(rc.mesh);
          rc.mat.dispose();
          activeRuneCircles.splice(i, 1);
          continue;
        }
        const prog = 1 - rc.life / rc.maxLife;
        const currentScale = 0.35 + 0.75 * easeOutCubic(Math.min(1, prog * 1.8));
        rc.mesh.scale.set(currentScale, 1, currentScale);
        rc.mesh.rotation.z += 0.45 * dt;

        if (prog < 0.20) {
          rc.mat.opacity = (prog / 0.20) * 0.95;
        } else if (prog > 0.55) {
          rc.mat.opacity = 0.95 * (1 - (prog - 0.55) / 0.45);
        } else {
          rc.mat.opacity = 0.95;
        }
      }

      for (let i = activeShockwaves.length - 1; i >= 0; i--) {
        const sw = activeShockwaves[i];
        sw.life -= dt;
        if (sw.life <= 0) {
          scene.remove(sw.mesh);
          sw.mat.dispose();
          activeShockwaves.splice(i, 1);
          continue;
        }
        const prog = 1 - sw.life / sw.maxLife;
        const s = 0.25 + 2.75 * easeOutCubic(prog);
        sw.mesh.scale.set(s, 1, s);
        sw.mat.opacity = 0.95 * Math.pow(Math.max(0, 1 - prog), 1.8);
      }

      for (let i = activeArcaneParticles.length - 1; i >= 0; i--) {
        const p = activeArcaneParticles[i];
        p.life -= dt;
        if (p.life <= 0) {
          scene.remove(p.sprite);
          activeArcaneParticles.splice(i, 1);
          continue;
        }
        const prog = 1 - p.life / p.maxLife;
        p.angle += p.vortexSpeed * dt;
        p.radius += p.radiusSpeed * dt;
        p.radiusSpeed *= Math.pow(0.88, dt * 60);

        p.pos.x = p.origin.x + Math.cos(p.angle) * p.radius;
        p.pos.z = p.origin.z + Math.sin(p.angle) * p.radius;
        p.pos.y += p.velY * dt;
        p.velY += p.buoyancy * dt;
        p.sprite.position.copy(p.pos);

        const twinkle = 1 + 0.18 * Math.sin(prog * p.twinkleRate * Math.PI * 2);
        let alpha = 1;
        if (prog < 0.15) {
          alpha = prog / 0.15;
        } else if (prog > 0.65) {
          alpha = Math.max(0, 1 - (prog - 0.65) / 0.35);
        }
        p.sprite.material.opacity = Math.min(1, p.baseOpacity * alpha * twinkle);
        const s = p.baseScale * (0.8 + 0.4 * Math.sin(prog * Math.PI)) * (prog > 0.7 ? alpha : 1);
        p.sprite.scale.set(s, s, 1);
      }

      for (let i = activeDissolvingPieces.length - 1; i >= 0; i--) {
        const dp = activeDissolvingPieces[i];
        dp.elapsed += dt;
        if (dp.mixer) {
          dp.mixer.update(dt * 0.35);
        }
        const u = Math.min(1, dp.elapsed / dp.duration);
        if (u < 0.28) {
          const surge = u / 0.28;
          for (const m of dp.materials) {
            if ('emissive' in m) {
              m.emissive.setHex(0xffaa20);
              m.emissiveIntensity = 0.4 + surge * 3.8;
            }
          }
        } else {
          const fadeProg = (u - 0.28) / 0.72;
          const alpha = Math.max(0, 1 - fadeProg);
          for (const m of dp.materials) {
            m.opacity = alpha;
            if ('emissive' in m) {
              m.emissiveIntensity = 4.2 * alpha;
            }
          }
          dp.mesh.position.y = dp.startY + Math.sin(fadeProg * Math.PI * 0.5) * 0.045;
        }
        if (u >= 1) {
          scene.remove(dp.mesh);
          for (const m of dp.materials) m.dispose();
          activeDissolvingPieces.splice(i, 1);
        }
      }

      // Advance volumetric GLSL brazier flames & active warm firelight flicker
      for (let i = 0; i < brazierFireUniforms.length; i++) {
        brazierFireUniforms[i].uTime.value = elapsedTotal;
      }
      for (let i = 0; i < brazierGlowSprites.length; i++) {
        const sp = brazierGlowSprites[i];
        const baseOp = sp.userData.baseOpacity || 0.4;
        const seed = sp.userData.seed || 0;
        sp.material.opacity =
          baseOp +
          Math.sin(elapsedTotal * 5.2 + seed) * 0.045 +
          Math.cos(elapsedTotal * 8.4 + seed * 1.3) * 0.025;
      }
      for (let i = 0; i < brazierLights.length; i++) {
        const baseInt = brazierLights[i].userData.baseIntensity || 3.2;
        brazierLights[i].intensity =
          baseInt +
          Math.sin(elapsedTotal * 5.6 + i * 1.7) * 0.28 +
          Math.cos(elapsedTotal * 9.1 + i) * 0.16;
      }

      if (
        isAnimatingMove ||
        activeMoveTweens.length > 0 ||
        shatterDebris.length > 0 ||
        activeArcaneParticles.length > 0 ||
        activeRuneCircles.length > 0 ||
        activeShockwaves.length > 0 ||
        activeDissolvingPieces.length > 0 ||
        checkmateState.active
      ) {
        renderer.shadowMap.needsUpdate = true;
      }

      if (doRender) {
        renderer.render(scene, camera);
      }
    }

    let manualStepMode = false;
    window.wizardChess.setManualStepMode = (v) => {
      manualStepMode = Boolean(v);
    };

    let engineDisposed = false;

    function animate() {
      if (engineDisposed) return;
      if (!navigator.webdriver && !manualStepMode) {
        requestAnimationFrame(animate);
      }
      if (manualStepMode) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      stepScene(dt || 0.016, true);
    }

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    // =========================================================================
    // Teardown: full disposal of renderer, scene resources, worker & listeners
    // =========================================================================
    function disposeSceneResources(root) {
      root.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        for (const mat of mats) {
          for (const key of Object.keys(mat)) {
            const val = mat[key];
            if (val && val.isTexture) val.dispose();
          }
          mat.dispose();
        }
      });
    }

    function disposeWizardChess() {
      if (engineDisposed) return;
      engineDisposed = true;
      isClockRunning = false;
      clearHintHighlight();
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      if (aiWorkerInstance) {
        try { aiWorkerInstance.terminate(); } catch (e) {}
        aiWorkerInstance = null;
      }
      window.removeEventListener('resize', onWindowResize);
      disposeSceneResources(scene);
      try {
        renderer.dispose();
        if (typeof renderer.forceContextLoss === 'function') renderer.forceContextLoss();
      } catch (e) {}
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      if (window.wizardChess) window.wizardChess.disposed = true;
    }
    window.wizardChess.dispose = disposeWizardChess;


    // Startup sequence (Standalone Single-Player AI Studio Applet)
    (async () => {
      await loadAllAssets();
      if (engineDisposed) return;
      const params = new URLSearchParams(window.location.search);
      const urlSide = params.get('side');
      if (urlSide === 'b' || urlSide === 'black') {
        playerColor = 'b';
      }
      resetChessBoard(true, true);
      let restoredGame = false;
      if (!navigator.webdriver) {
        try { restoredGame = restoreSavedGame(); } catch (e) { restoredGame = false; }
      }
      if (navigator.webdriver) {
        startMatchClocks();
        window.wizardChess.stepBy(0.9, 15);
      } else {
        animate();
        if (!restoredGame) {
          startCathedralTour();
        }
      }
    })();

    // Typed module-level handle for the React UI (App.tsx). The
    // window.wizardChess global remains as a legacy alias for automated tests.
    return window.wizardChess;
}

