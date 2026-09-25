/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PLANTA 3D DIGITAL TWIN DO ARMAZÉM - MODO TV TORRE 5.0
 * Mapeamento tridimensional de ruas, porta-paletes (picking térreo + pulmão alto aéreo),
 * docas frontais, linhas de fluxo dinâmico de descida e câmera orbital cinematográfica.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Compass,
  Layers,
  RotateCw,
  Eye,
  Maximize2,
  Minimize2,
  Box,
  Radio,
  ArrowDownRight,
  TrendingUp,
  MapPin,
  Play,
  Pause,
  RefreshCw,
  Info,
  X
} from 'lucide-react';
import { SECTOR_STREET_GROUPS, inferSectorFromStreet } from '../data/streetData';

export interface Warehouse3DViewerProps {
  streetCurrent: string;
  sectorCurrent: string;
  operatorName: string;
  volumeCount: number;
  demandCount: number;
  vphCurrent: string;
  selectedSectorFilter?: string;
  onSelectStreet?: (street: string) => void;
  tempoSegundos?: number;
  enderecosCount?: number;
  ephCurrent?: string;
  tempoTotalGeralSegundos?: number;
  enderecosTotalGeral?: number;
  volumesTotalGeral?: number;
  onOpenDetails?: () => void;
  radarStreets?: {
    rua: string;
    setor: string;
    status: 'AQUI_AGORA' | 'CONCLUIDA' | 'PENDENTE' | 'AGUARDANDO';
    demanda: number;
    realizado: number;
    vph?: string;
    eph?: string;
    enderecos?: number;
    tempoSegundos?: number;
    tempoFormatado?: string;
  }[];
}

interface SelectedPalletInfo {
  street: string;
  sector: string;
  levelType: 'PICKING' | 'PULMAO_ALTO';
  levelNumber: number;
  status: string;
  volumes: number;
  demand: number;
  vph: string;
  eph?: string;
  enderecos?: number;
  tempoFormatado?: string;
  tempoMedioPorEnderecoFormatado?: string;
}

export const Warehouse3DViewer: React.FC<Warehouse3DViewerProps> = ({
  streetCurrent,
  sectorCurrent,
  operatorName,
  volumeCount,
  demandCount,
  vphCurrent,
  selectedSectorFilter = 'TODOS',
  onSelectStreet,
  tempoSegundos = 1140,
  enderecosCount = 18,
  ephCurrent = '22.0',
  tempoTotalGeralSegundos = 6960,
  enderecosTotalGeral = 86,
  volumesTotalGeral = 195,
  onOpenDetails,
  radarStreets = []
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Estados de visualização e controle da TV
  const [autoRotateCamera, setAutoRotateCamera] = useState<boolean>(true);
  const [cameraViewMode, setCameraViewMode] = useState<'ISOMETRIC' | 'TOP_DOWN' | 'DOCKS' | 'ACTIVE_STREET'>('ISOMETRIC');
  const [selectedPallet, setSelectedPallet] = useState<SelectedPalletInfo | null>(null);
  const [showFlowLines, setShowFlowLines] = useState<boolean>(true);
  const [showRacksLabels, setShowRacksLabels] = useState<boolean>(true);
  const [flowCount, setFlowCount] = useState<number>(0);

  // Referências Three.js para acesso no loop de animação
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const activeBeaconRef = useRef<THREE.Group | null>(null);
  const flowLinesGroupRef = useRef<THREE.Group | null>(null);
  const interactiveMeshesRef = useRef<THREE.Mesh[]>([]);
  const streetPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const animFrameIdRef = useRef<number | null>(null);
  const particleSystemRef = useRef<THREE.Points | null>(null);
  const curvePointsRef = useRef<THREE.Vector3[]>([]);

  // 1. Organização do Layout Físico do CD
  // Setores alinhados em corredores paralelos
  const allConfiguredSectors = useMemo(() => SECTOR_STREET_GROUPS, []);

  // Criação de Texturas de Texto (Labels de Cabeceira de Rua e Docas)
  const createTextTexture = useCallback((text: string, bgColor: string, textColor: string, width = 256, height = 96) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fundo com borda arredondada estilo display industrial
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(4, 4, width - 8, height - 8, 14);
    ctx.fill();

    ctx.strokeStyle = textColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // 2. Construção da Cena 3D do Armazém
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Dimensões do container
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // Cena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060913); // Dark slate industrial
    scene.fog = new THREE.FogExp2(0x060913, 0.015);
    sceneRef.current = scene;

    // Câmera Perspectiva
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 300);
    camera.position.set(38, 28, 48);
    cameraRef.current = camera;

    // Renderizador WebGL de Alta Performance
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Evita atravessar o chão
    controls.minDistance = 10;
    controls.maxDistance = 120;
    controls.target.set(0, 3, 0);
    controlsRef.current = controls;

    // Iluminação do Armazém
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xdcf8ff, 1.4);
    sunLight.position.set(30, 50, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 150;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    scene.add(sunLight);

    const blueLight = new THREE.PointLight(0x00f0ff, 1.2, 80);
    blueLight.position.set(-20, 20, -10);
    scene.add(blueLight);

    const amberLight = new THREE.PointLight(0xffaa00, 1.0, 70);
    amberLight.position.set(20, 15, 20);
    scene.add(amberLight);

    // Piso do Galpão com Marcação de Linhas e Demarcações Industriais
    const floorGeo = new THREE.PlaneGeometry(140, 110);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090e1a,
      roughness: 0.85,
      metalness: 0.2
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Grade de Piso Sutil (Warehouse Grid)
    const gridHelper = new THREE.GridHelper(130, 65, 0x1e293b, 0x0f172a);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // Linhas Amarelas de Tráfego de Empilhadeiras no Piso
    const trafficLineMat = new THREE.MeshBasicMaterial({ color: 0xeab308, opacity: 0.4, transparent: true });
    const mainAisleGeo = new THREE.PlaneGeometry(120, 3);
    const mainAisle = new THREE.Mesh(mainAisleGeo, trafficLineMat);
    mainAisle.rotation.x = -Math.PI / 2;
    mainAisle.position.set(0, 0.03, 16);
    scene.add(mainAisle);

    // Grupo de Porta-Paletes e Armazenamento
    const warehouseGroup = new THREE.Group();
    scene.add(warehouseGroup);

    // Grupo para Linhas de Fluxo Dinâmico
    const flowLinesGroup = new THREE.Group();
    scene.add(flowLinesGroup);
    flowLinesGroupRef.current = flowLinesGroup;

    // Geometrias reutilizáveis para performance de renderização
    const rackPostGeo = new THREE.BoxGeometry(0.18, 7.5, 0.18);
    const rackBeamGeo = new THREE.BoxGeometry(3.6, 0.14, 1.1);
    const palletGeo = new THREE.BoxGeometry(1.6, 0.2, 1.0);
    const boxGeo = new THREE.BoxGeometry(1.5, 0.9, 0.95);

    // Materiais
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.7, roughness: 0.3 }); // Azul escuro metálico
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.5, roughness: 0.4 }); // Laranja industrial
    const palletWoodMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.9 }); // Madeira

    // Cores de status dos volumes
    const boxMats = {
      standard: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 }), // Cinza padrão
      active: new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.6, roughness: 0.4 }), // Verde neon
      completed: new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.5 }), // Ciano
      pending: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 }), // Âmbar
      aerialPulmao: new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.5 }) // Índigo (pulmão alto)
    };

    interactiveMeshesRef.current = [];
    streetPositionsRef.current.clear();

    // 3. Posicionamento das Ruas por Setor
    // Setor 87 à esquerda, Setores 88-90 à direita e centro
    let currentX = -42;
    const streetSpacing = 5.2;
    const rackLevels = 6; // Nível 1: Picking | Níveis 2 a 6: Pulmão Alto

    allConfiguredSectors.forEach((group) => {
      group.streets.forEach((streetName) => {
        const isCurrentActive = streetName.toUpperCase() === streetCurrent.toUpperCase();
        const streetStatusObj = radarStreets.find(s => s.rua.toUpperCase() === streetName.toUpperCase());
        const isDone = streetStatusObj?.status === 'CONCLUIDA';
        const isPending = streetStatusObj?.status === 'PENDENTE';

        // Posição central do corredor da rua
        const streetCenterPos = new THREE.Vector3(currentX, 0, 0);
        streetPositionsRef.current.set(streetName, streetCenterPos);

        // Cada rua tem 2 estantes (Lado Esquerdo e Lado Direito do corredor)
        [-1.8, 1.8].forEach((zOffset, sideIdx) => {
          const rackZ = zOffset;
          const rackLengthBays = 4; // 4 vãos ao longo da rua

          for (let bay = 0; bay < rackLengthBays; bay++) {
            const bayX = currentX + (bay - (rackLengthBays - 1) / 2) * 1.1;

            // Montantes Verticais da Estante
            [-0.5, 0.5].forEach(postZ => {
              const post = new THREE.Mesh(rackPostGeo, postMat);
              post.position.set(bayX, 3.75, rackZ + postZ * 0.9);
              post.castShadow = true;
              warehouseGroup.add(post);
            });

            // Níveis de Altura (Y)
            for (let lvl = 0; lvl < rackLevels; lvl++) {
              const levelY = 0.5 + lvl * 1.4;
              const isPickingLevel = lvl === 0;
              const isPulmaoAlto = lvl >= 1;

              // Longarina de sustentação
              if (bay % 2 === 0) {
                const beam = new THREE.Mesh(rackBeamGeo, beamMat);
                beam.position.set(bayX + 0.9, levelY, rackZ);
                warehouseGroup.add(beam);
              }

              // Palete de Madeira
              const palletMesh = new THREE.Mesh(palletGeo, palletWoodMat);
              palletMesh.position.set(bayX, levelY + 0.1, rackZ);
              palletMesh.castShadow = true;
              palletMesh.receiveShadow = true;
              warehouseGroup.add(palletMesh);

              // Carga / Caixa de Mercadoria sobre o Palete
              let matToUse = isPulmaoAlto ? boxMats.aerialPulmao : boxMats.standard;
              if (isCurrentActive) {
                matToUse = isPickingLevel ? boxMats.active : boxMats.aerialPulmao;
              } else if (isDone) {
                matToUse = boxMats.completed;
              } else if (isPending) {
                matToUse = boxMats.pending;
              }

              const boxMesh = new THREE.Mesh(boxGeo, matToUse);
              boxMesh.position.set(bayX, levelY + 0.65, rackZ);
              boxMesh.castShadow = true;
              boxMesh.receiveShadow = true;

              // Metadados para raycasting e clique
              const stEnderecos = isCurrentActive 
                ? (enderecosCount || 18) 
                : (streetStatusObj?.enderecos || (isDone ? 20 : 0));
              const stTempoSec = isCurrentActive 
                ? (tempoSegundos || 1140) 
                : (streetStatusObj?.tempoSegundos || (isDone ? 1800 : 0));
              const stMins = Math.round(stTempoSec / 60);
              const stTimeFormatted = isCurrentActive 
                ? `${stMins} min` 
                : (streetStatusObj?.tempoFormatado || (isDone ? `${stMins} min` : '-'));
              const avgSec = stEnderecos > 0 ? Math.round(stTempoSec / stEnderecos) : 0;
              const avgFormatted = stEnderecos > 0 ? `${Math.floor(avgSec / 60)}m ${String(avgSec % 60).padStart(2, '0')}s` : '0m 00s';

              boxMesh.userData = {
                street: streetName,
                sector: group.sectorId,
                levelType: isPickingLevel ? 'PICKING' : 'PULMAO_ALTO',
                levelNumber: lvl + 1,
                status: isCurrentActive ? 'EM_ANDAMENTO' : (isDone ? 'CONCLUIDA' : 'PENDENTE'),
                volumes: isCurrentActive ? volumeCount : (streetStatusObj?.realizado || (isDone ? 45 : 0)),
                demand: streetStatusObj?.demanda || (isCurrentActive ? demandCount : 60),
                vph: isCurrentActive ? vphCurrent : (streetStatusObj?.vph || '45.0'),
                eph: isCurrentActive ? ephCurrent : (streetStatusObj?.eph || '22.0'),
                enderecos: stEnderecos,
                tempoFormatado: stTimeFormatted,
                tempoMedioPorEnderecoFormatado: avgFormatted
              };

              interactiveMeshesRef.current.push(boxMesh);
              warehouseGroup.add(boxMesh);
            }
          }
        });

        // Placa / Letreiro Luminoso da Cabeceira da Rua
        const labelTexture = createTextTexture(
          streetName,
          isCurrentActive ? '#059669' : '#0f172a',
          isCurrentActive ? '#ffffff' : '#38bdf8'
        );
        if (labelTexture) {
          const labelMat = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true });
          const labelGeo = new THREE.PlaneGeometry(3.2, 1.2);
          const labelMesh = new THREE.Mesh(labelGeo, labelMat);
          labelMesh.position.set(currentX, 8.2, 3.5);
          warehouseGroup.add(labelMesh);

          // Verso da placa
          const labelBack = labelMesh.clone();
          labelBack.rotation.y = Math.PI;
          labelBack.position.set(currentX, 8.2, -3.5);
          warehouseGroup.add(labelBack);
        }

        // Se for a rua ativa agora, posicionar o Farol Luminoso (Beacon Sonar)
        if (isCurrentActive) {
          const beaconGroup = new THREE.Group();
          beaconGroup.position.set(currentX, 0, 0);

          // Cilindro de luz vertical (Beam)
          const beamGeo = new THREE.CylinderGeometry(0.4, 0.4, 18, 16, 1, true);
          const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide
          });
          const beam = new THREE.Mesh(beamGeo, beamMaterial);
          beam.position.y = 9;
          beaconGroup.add(beam);

          // Anéis de Pulso no chão
          const ringGeo = new THREE.RingGeometry(0.5, 2.2, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0x34d399,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.05;
          beaconGroup.add(ring);

          // Marcador do Operador (Mini Coletor / Avatar)
          const avatarGeo = new THREE.BoxGeometry(0.8, 1.4, 1.0);
          const avatarMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.3 });
          const avatarMesh = new THREE.Mesh(avatarGeo, avatarMat);
          avatarMesh.position.y = 0.7;
          beaconGroup.add(avatarMesh);

          scene.add(beaconGroup);
          activeBeaconRef.current = beaconGroup;
        }

        currentX += streetSpacing;
      });

      // Espaço entre setores
      currentX += 3.5;
    });

    // 4. Construção das Docas Frontais (DOCAS 1 a 6)
    const dockGroup = new THREE.Group();
    const dockCount = 6;
    const dockStartX = -35;
    const dockSpacing = 14;

    for (let d = 0; d < dockCount; d++) {
      const dockX = dockStartX + d * dockSpacing;
      const dockZ = 28;

      // Plataforma da Doca
      const dockPlatformGeo = new THREE.BoxGeometry(9, 0.5, 8);
      const dockPlatformMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
      const dockPlatform = new THREE.Mesh(dockPlatformGeo, dockPlatformMat);
      dockPlatform.position.set(dockX, 0.25, dockZ);
      dockPlatform.receiveShadow = true;
      dockGroup.add(dockPlatform);

      // Portão Seccional
      const gateGeo = new THREE.BoxGeometry(8, 5, 0.3);
      const gateMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 });
      const gate = new THREE.Mesh(gateGeo, gateMat);
      gate.position.set(dockX, 2.7, dockZ + 3.8);
      dockGroup.add(gate);

      // Letreiro da Doca
      const dockTexture = createTextTexture(`DOCA ${d + 1}`, '#0284c7', '#ffffff', 256, 80);
      if (dockTexture) {
        const dockLabelMat = new THREE.MeshBasicMaterial({ map: dockTexture, transparent: true });
        const dockLabelGeo = new THREE.PlaneGeometry(4, 1.2);
        const dockLabel = new THREE.Mesh(dockLabelGeo, dockLabelMat);
        dockLabel.position.set(dockX, 6.2, dockZ + 3.7);
        dockGroup.add(dockLabel);
      }
    }
    scene.add(dockGroup);

    // 5. Linhas de Fluxo Tridimensionais (Pulmão Alto Aéreo ➔ Picking Ativo)
    // Conectam os níveis altos (Y=4 a Y=6) até a rua do operador no chão (Y=0.5)
    const activePos = streetPositionsRef.current.get(streetCurrent) || new THREE.Vector3(0, 0, 0);
    const flowCurves: THREE.CatmullRomCurve3[] = [];
    const pointsList: THREE.Vector3[] = [];

    // Gerar 6 feixes dinâmicos de fluxo (4 de descida de pulmão alto aéreo + 2 de docas)
    // 1. Descidas dos pulmões altos
    [-15, -8, 8, 15].forEach((offsetOffset, i) => {
      const highOrigin = new THREE.Vector3(
        activePos.x + offsetOffset,
        6.5 + (i % 2) * 1.2,
        (i % 2 === 0 ? -1 : 1) * 2.5
      );
      const pickingTarget = new THREE.Vector3(
        activePos.x,
        0.8,
        0.5 * (i % 2 === 0 ? 1 : -1)
      );
      const midPoint = new THREE.Vector3(
        (highOrigin.x + pickingTarget.x) / 2,
        Math.max(highOrigin.y, pickingTarget.y) + 2.0,
        (highOrigin.z + pickingTarget.z) / 2
      );

      const curve = new THREE.CatmullRomCurve3([highOrigin, midPoint, pickingTarget]);
      flowCurves.push(curve);

      // Amostra de pontos para partículas
      const pts = curve.getPoints(50);
      pointsList.push(...pts);

      // Tubo visual luminoso
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.08, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b, // Âmbar luminoso
        transparent: true,
        opacity: 0.65
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      flowLinesGroup.add(tubeMesh);
    });

    // 2. Fluxo partindo das Docas frontais até a rua ativa
    [dockStartX + 14, dockStartX + 28].forEach((dockX, i) => {
      const dockOrigin = new THREE.Vector3(dockX, 1.2, 28);
      const aisleEntry = new THREE.Vector3(activePos.x, 1.5, 16);
      const finalPicking = new THREE.Vector3(activePos.x, 0.8, 0);

      const curve = new THREE.CatmullRomCurve3([dockOrigin, aisleEntry, finalPicking]);
      flowCurves.push(curve);

      const pts = curve.getPoints(50);
      pointsList.push(...pts);

      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.08, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4, // Ciano neon da doca
        transparent: true,
        opacity: 0.7
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      flowLinesGroup.add(tubeMesh);
    });

    setFlowCount(flowCurves.length);
    curvePointsRef.current = pointsList;

    // Partículas que viajam ao longo das linhas de fluxo
    const particleCount = 120;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let p = 0; p < particleCount; p++) {
      const ptIdx = Math.floor(Math.random() * pointsList.length);
      const pt = pointsList[ptIdx] || new THREE.Vector3();
      particlePositions[p * 3] = pt.x;
      particlePositions[p * 3 + 1] = pt.y;
      particlePositions[p * 3 + 2] = pt.z;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.35,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    flowLinesGroup.add(particleSystem);
    particleSystemRef.current = particleSystem;

    // 6. Raycasting para Clique nos Paletes
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshesRef.current);

      if (intersects.length > 0) {
        const topHit = intersects[0];
        const data = topHit.object.userData as SelectedPalletInfo;
        if (data && data.street) {
          setSelectedPallet(data);
          if (onSelectStreet) onSelectStreet(data.street);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // 7. Loop de Animação e Câmera Orbital Contínua para TV
    let angle = 0;
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      // Auto-rotação orbital suave da TV quando ativada
      if (autoRotateCamera && controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.65; // Rotação cinematográfica suave
      } else if (controls) {
        controls.autoRotate = false;
      }

      // Efeito de pulso luminoso no farol da rua ativa
      if (activeBeaconRef.current) {
        angle += 0.05;
        const scale = 1 + Math.sin(angle) * 0.15;
        activeBeaconRef.current.children.forEach((child, idx) => {
          if (idx === 1) { // Anel de solo
            child.scale.set(scale, scale, 1);
          }
        });
      }

      // Movimentação das partículas de fluxo ao longo das curvas
      if (particleSystemRef.current && curvePointsRef.current.length > 0) {
        const positions = particleSystemRef.current.geometry.attributes.position.array as Float32Array;
        const totalPts = curvePointsRef.current.length;
        for (let i = 0; i < particleCount; i++) {
          const currentY = positions[i * 3 + 1];
          // Descer a partícula
          positions[i * 3 + 1] = currentY - 0.08;
          if (positions[i * 3 + 1] < 0.5) {
            // Reiniciar no topo de um ponto aleatório
            const newPt = curvePointsRef.current[Math.floor(Math.random() * totalPts)];
            positions[i * 3] = newPt.x;
            positions[i * 3 + 1] = newPt.y;
            positions[i * 3 + 2] = newPt.z;
          }
        }
        particleSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // Redimensionamento de Janela
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Limpeza completa de recursos WebGL
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      controls.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, [streetCurrent, radarStreets, volumeCount, demandCount, vphCurrent, allConfiguredSectors, autoRotateCamera, createTextTexture, onSelectStreet]);

  // Função para focar a câmera na rua selecionada
  const focusOnStreet = useCallback((streetName: string) => {
    const pos = streetPositionsRef.current.get(streetName);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!pos || !camera || !controls) return;

    controls.target.set(pos.x, 2, pos.z);
    camera.position.set(pos.x + 12, 14, pos.z + 18);
    controls.update();
  }, []);

  // Atalhos de Visões Rápidas da Câmera
  const handleSetViewMode = (mode: 'ISOMETRIC' | 'TOP_DOWN' | 'DOCKS' | 'ACTIVE_STREET') => {
    setCameraViewMode(mode);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const activePos = streetPositionsRef.current.get(streetCurrent) || new THREE.Vector3(0, 0, 0);

    if (mode === 'ISOMETRIC') {
      controls.target.set(0, 2, 0);
      camera.position.set(38, 28, 48);
    } else if (mode === 'TOP_DOWN') {
      controls.target.set(0, 0, 0);
      camera.position.set(0, 65, 0.1);
    } else if (mode === 'DOCKS') {
      controls.target.set(0, 3, 25);
      camera.position.set(0, 16, 55);
    } else if (mode === 'ACTIVE_STREET') {
      focusOnStreet(streetCurrent);
    }
    controls.update();
  };

  return (
    <div className="relative w-full h-[580px] md:h-[680px] rounded-2xl overflow-hidden bg-slate-950 border border-emerald-500/40 shadow-[0_0_50px_rgba(16,185,129,0.15)] flex flex-col font-sans select-none">
      
      {/* 1. HUD SUPERIOR: CONTROLES DE NAVEGAÇÃO 3D E STATUS DA PLANTA */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 md:p-4 bg-gradient-to-b from-slate-950/95 via-slate-950/70 to-transparent flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.4)]">
            <Layers size={18} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs md:text-sm font-black font-mono tracking-wider uppercase text-white">
                PLANTA 3D DO ARMAZÉM
              </span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-bold animate-pulse">
                GÊMEO DIGITAL AO VIVO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Pulmão Alto Aéreo ➔ Picking Térreo • Corredores Setores 87 a 90
            </p>
          </div>
        </div>

        {/* Botões Rápidos de Ângulos de Câmera */}
        <div className="flex items-center space-x-1.5 bg-slate-900/90 border border-white/10 p-1 rounded-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => handleSetViewMode('ISOMETRIC')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              cameraViewMode === 'ISOMETRIC'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Isométrica
          </button>
          <button
            type="button"
            onClick={() => handleSetViewMode('ACTIVE_STREET')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              cameraViewMode === 'ACTIVE_STREET'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Foco Rua {streetCurrent}
          </button>
          <button
            type="button"
            onClick={() => handleSetViewMode('DOCKS')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              cameraViewMode === 'DOCKS'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Docas
          </button>
          <button
            type="button"
            onClick={() => handleSetViewMode('TOP_DOWN')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              cameraViewMode === 'TOP_DOWN'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Zenital (Topo)
          </button>

          {/* Toggle de Auto-Rotação TV */}
          <button
            type="button"
            onClick={() => setAutoRotateCamera(prev => !prev)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ml-1 ${
              autoRotateCamera
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-white/5 border-white/10 text-slate-500 hover:text-white'
            }`}
            title={autoRotateCamera ? 'Pausar Rotação Automática da Câmera TV' : 'Ativar Giro Cinematográfico Contínuo na TV'}
          >
            <RotateCw size={14} className={autoRotateCamera ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. CANVAS DO THREE.JS */}
      <div ref={containerRef} className="w-full flex-1 relative cursor-grab active:cursor-grabbing">
        <canvas ref={canvasRef} className="w-full h-full block outline-none" />

        {/* DICA DE INTERAÇÃO FLUTUANTE */}
        <div className="absolute top-16 left-4 z-10 pointer-events-none hidden sm:flex items-center space-x-2 text-[10px] font-mono text-slate-400 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-white/5 backdrop-blur-sm">
          <span>🖱️ Arraste para girar • Scroll zoom • Clique no palete para inspecionar</span>
        </div>
      </div>

      {/* 3. CARD HUD DE INSPEÇÃO DO PALETE CLICADO */}
      {selectedPallet && (
        <div className="absolute bottom-16 left-4 z-30 w-80 bg-slate-900/95 border-2 border-cyan-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-md font-mono text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
            <div className="flex items-center space-x-2">
              <Box size={16} className="text-cyan-400" />
              <span className="font-bold text-white text-sm">
                RUA {selectedPallet.street}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-slate-300">
                Setor {selectedPallet.sector}
              </span>
            </div>
            <button
              onClick={() => setSelectedPallet(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-1.5 text-slate-300 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Tempo na Rua:</span>
              <strong className="text-emerald-300">{selectedPallet.tempoFormatado || '0 min'}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Endereços na Rua:</span>
              <strong className="text-cyan-300">{selectedPallet.enderecos || 0} endereços</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Volumes Apontados:</span>
              <strong className="text-white">{selectedPallet.volumes} / {selectedPallet.demand} cx</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Produtividade:</span>
              <span className="font-bold">
                <span className="text-amber-300">{selectedPallet.vph} vph</span> • <span className="text-cyan-300">{selectedPallet.eph || '22.0'} eph</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Ritmo / Endereço:</span>
              <strong className="text-slate-200">{selectedPallet.tempoMedioPorEnderecoFormatado || '1m 20s'}</strong>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-1">
              <span className="text-slate-400">Nível Físico:</span>
              <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                selectedPallet.levelType === 'PICKING'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-indigo-500/20 text-indigo-300'
              }`}>
                {selectedPallet.levelType === 'PICKING' ? 'Nível 1 (Picking Térreo)' : `Nível ${selectedPallet.levelNumber} (Pulmão Alto Aéreo)`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => focusOnStreet(selectedPallet.street)}
              className="py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[11px] uppercase flex items-center justify-center space-x-1 transition-all shadow-md cursor-pointer"
            >
              <Compass size={12} />
              <span>Focar Câmera</span>
            </button>

            {onOpenDetails && (
              <button
                type="button"
                onClick={onOpenDetails}
                className="py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-black text-[11px] uppercase flex items-center justify-center space-x-1 transition-all shadow-md cursor-pointer"
              >
                <span>Detalhamento ➔</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. BARRA DE STATUS INFERIOR: LEGENDA DAS CORES E TELEMETRIA DA RUA ATIVA */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-2.5 sm:p-3 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono border-t border-white/10 pointer-events-auto">
        {/* LEGENDA DE CORES DA PLANTA 3D */}
        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-300">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            <span className="text-emerald-300 font-bold">Rua Reapro Ativa ({streetCurrent})</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
            <span>Pulmão Alto Aéreo</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
            <span>Descida ({flowCount})</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-cyan-400" />
            <span>Docas (1-6)</span>
          </div>
        </div>

        {/* RESUMO DE TEMPO & ENDEREÇOS GERAIS DO DIA */}
        <div className="flex items-center gap-2">
          <div className="flex items-center space-x-2 bg-slate-900/90 px-3 py-1 rounded-xl border border-emerald-500/30 shadow-lg text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-slate-400">TEMPO TOTAL:</span>
            <strong className="text-emerald-300">
              {Math.floor(tempoTotalGeralSegundos / 3600) > 0 
                ? `${Math.floor(tempoTotalGeralSegundos / 3600)}h ${Math.floor((tempoTotalGeralSegundos % 3600) / 60)}m` 
                : `${Math.round(tempoTotalGeralSegundos / 60)} min`}
            </strong>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">ENDEREÇOS:</span>
            <strong className="text-cyan-300">{enderecosTotalGeral} geral</strong>
            <span className="text-slate-600">•</span>
            <strong className="text-white">{volumesTotalGeral} cx</strong>
          </div>

          {onOpenDetails && (
            <button
              type="button"
              onClick={onOpenDetails}
              className="px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase shadow-md flex items-center gap-1 transition-all cursor-pointer"
            >
              <span>Detalhamento</span>
            </button>
          )}
        </div>
      </div>

    </div>
  );
};

export default Warehouse3DViewer;
