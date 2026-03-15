/**
 * 3D代码可视化器
 * 使用Three.js创建交互式的3D代码依赖图谱
 */

(function() {
  'use strict';

  // 全局变量
  let scene, camera, renderer, controls;
  let nodes = [];
  let edges = [];
  let nodeObjects = new Map();
  let edgeObjects = new Map();
  let animationId;
  
  // 配置常量
  const CONFIG = {
    NODE_RADIUS: 20,
    EDGE_OPACITY: 0.6,
    CAMERA_DISTANCE: 500,
    LAYOUT_SPACING: 100,
    ANIMATION_DURATION: 1000,
    MAX_NODES: 1000, // 最大节点数量限制
    LOD_DISTANCE: 200, // LOD切换距离
    FRUSTUM_CULL_MARGIN: 50, // 视锥体剔除边距
    COLORS: {
      function: 0x4CAF50,
      class: 0x2196F3,
      method: 0xFF9800,
      property: 0x9C27B0,
      variable: 0x607D8B,
      interface: 0x00BCD4,
      constant: 0xFF5722,
      default: 0x757575
    }
  };

  /**
   * 视锥体剔除 - 只渲染在相机视野内的对象
   */
  function frustumCulling(frustum, object) {
    const boundingSphere = new THREE.Sphere();
    const box = new THREE.Box3().setFromObject(object);
    box.getBoundingSphere(boundingSphere);
    
    return frustum.intersectsSphere(boundingSphere);
  }

  /**
   * 更新LOD - 根据距离更新节点细节层次
   */
  function updateLOD() {
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    nodes.forEach(node => {
      const distance = camera.position.distanceTo(node.position);
      const isVisible = frustumCulling(frustum, node);
      
      // 更新可见性
      node.visible = isVisible;
      
      // 更新标签可见性
      if (node.userData.label) {
        node.userData.label.visible = isVisible && distance < CONFIG.LOD_DISTANCE * 1.5;
      }
      
      // LOD几何体更新（简化版本，实际项目中可以做得更复杂）
      if (isVisible && distance > CONFIG.LOD_DISTANCE) {
        node.material.opacity = Math.max(0.3, 0.8 - (distance - CONFIG.LOD_DISTANCE) / CONFIG.LOD_DISTANCE);
      } else if (isVisible) {
        node.material.opacity = 0.8;
      }
    });

    // 边的可见性更新
    edges.forEach(edge => {
      edge.visible = frustumCulling(frustum, edge);
    });
  }

  /**
   * 初始化3D场景
   */
  function initScene(container) {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // 创建相机
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
    camera.position.set(0, 0, CONFIG.CAMERA_DISTANCE);

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 添加控制器
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = true;

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 100);
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(-100, -100, -100);
    scene.add(pointLight);

    // 添加网格
    const gridHelper = new THREE.GridHelper(1000, 20, 0x444444, 0x222222);
    scene.add(gridHelper);

    return renderer.domElement;
  }

  /**
   * 获取符号类型的颜色
   */
  function getNodeColor(symbolType) {
    return CONFIG.COLORS[symbolType] || CONFIG.COLORS.default;
  }

  /**
   * 创建优化的节点几何体（LOD支持）
   */
  function createOptimizedNodeGeometry(symbolType, distance) {
    let segments;
    if (distance < CONFIG.LOD_DISTANCE) {
      segments = 32; // 高质量
    } else if (distance < CONFIG.LOD_DISTANCE * 2) {
      segments = 16; // 中等质量
    } else {
      segments = 8; // 低质量
    }

    switch (symbolType) {
      case 'function':
      case 'method':
        return new THREE.SphereGeometry(CONFIG.NODE_RADIUS, segments, segments);
      case 'class':
        return new THREE.BoxGeometry(CONFIG.NODE_RADIUS * 2, CONFIG.NODE_RADIUS * 2, CONFIG.NODE_RADIUS * 2);
      case 'interface':
        return new THREE.OctahedronGeometry(CONFIG.NODE_RADIUS);
      case 'constant':
        return new THREE.TetrahedronGeometry(CONFIG.NODE_RADIUS);
      default:
        return new THREE.ConeGeometry(CONFIG.NODE_RADIUS, CONFIG.NODE_RADIUS * 2, Math.max(6, segments / 4));
    }
  }

  /**
   * 创建文本标签
   */
  function createTextLabel(text, position) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = 'white';
    context.font = '16px Arial';
    context.textAlign = 'center';
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 5);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    sprite.position.copy(position);
    sprite.position.y += CONFIG.NODE_RADIUS + 10;
    sprite.scale.set(50, 12.5, 1);

    return sprite;
  }

  /**
   * 计算节点布局位置
   */
  function calculateNodePositions(graphData) {
    const positions = new Map();
    const modules = new Map();
    
    // 按模块分组
    graphData.symbols.forEach(symbol => {
      if (!modules.has(symbol.module_name)) {
        modules.set(symbol.module_name, []);
      }
      modules.get(symbol.module_name).push(symbol);
    });

    // 使用力导向布局算法
    const moduleNames = Array.from(modules.keys());
    const angleStep = (2 * Math.PI) / moduleNames.length;
    
    moduleNames.forEach((moduleName, moduleIndex) => {
      const moduleSymbols = modules.get(moduleName);
      const moduleAngle = moduleIndex * angleStep;
      const moduleRadius = 200;
      
      // 模块中心位置
      const moduleCenter = {
        x: Math.cos(moduleAngle) * moduleRadius,
        y: 0,
        z: Math.sin(moduleAngle) * moduleRadius
      };

      // 在模块内部分布节点
      moduleSymbols.forEach((symbol, symbolIndex) => {
        const symbolAngle = (symbolIndex / moduleSymbols.length) * 2 * Math.PI;
        const symbolRadius = 80;
        
        positions.set(symbol.id, {
          x: moduleCenter.x + Math.cos(symbolAngle) * symbolRadius,
          y: (symbolIndex - moduleSymbols.length / 2) * 30,
          z: moduleCenter.z + Math.sin(symbolAngle) * symbolRadius
        });
      });
    });

    return positions;
  }

  /**
   * 创建3D节点（带性能优化）
   */
  function create3DNodes(graphData) {
    // 限制节点数量以提高性能
    const symbolsToShow = graphData.symbols.slice(0, CONFIG.MAX_NODES);
    const positions = calculateNodePositions(graphData);
    
    symbolsToShow.forEach(symbol => {
      const position = positions.get(symbol.id);
      if (!position) return;

      // 使用相机距离计算LOD
      const cameraPosition = camera.position;
      const distance = cameraPosition.distanceTo(new THREE.Vector3(position.x, position.y, position.z));
      
      const geometry = createOptimizedNodeGeometry(symbol.symbol_type, distance);
      const material = new THREE.MeshPhongMaterial({
        color: getNodeColor(symbol.symbol_type),
        transparent: true,
        opacity: 0.8
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position.x, position.y, position.z);
      mesh.userData = {
        symbolId: symbol.id,
        symbolName: symbol.symbol_name,
        symbolType: symbol.symbol_type,
        moduleName: symbol.module_name,
        originalGeometry: geometry // 保存原始几何体用于LOD更新
      };

      // 添加标签（只在近距离显示）
      if (distance < CONFIG.LOD_DISTANCE * 1.5) {
        const label = createTextLabel(symbol.symbol_name, mesh.position);
        scene.add(label);
        mesh.userData.label = label;
      }
      
      scene.add(mesh);
      nodes.push(mesh);
      nodeObjects.set(symbol.id, { mesh, originalPosition: position });
    });

    return positions;
  }

  /**
   * 创建3D边（依赖关系）
   */
  function create3DEdges(graphData, nodePositions) {
    graphData.edges.forEach(edge => {
      const fromPos = nodePositions.get(edge.from);
      const toPos = nodePositions.get(edge.to);
      
      if (!fromPos || !toPos) return;

      const points = [];
      points.push(new THREE.Vector3(fromPos.x, fromPos.y, fromPos.z));
      points.push(new THREE.Vector3(toPos.x, toPos.y, toPos.z));

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      
      let color = 0x666666;
      switch (edge.dependency_type) {
        case 'call':
          color = 0x4CAF50;
          break;
        case 'import':
          color = 0x2196F3;
          break;
        case 'inherit':
          color = 0xFF9800;
          break;
        case 'implement':
          color = 0x9C27B0;
          break;
      }

      const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: CONFIG.EDGE_OPACITY
      });

      const line = new THREE.Line(geometry, material);
      line.userData = {
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        dependencyType: edge.dependency_type
      };

      scene.add(line);
      edges.push(line);
      edgeObjects.set(edge.id, line);
    });
  }

  /**
   * 动画循环（带性能优化）
   */
  function animate() {
    animationId = requestAnimationFrame(animate);
    
    controls.update();
    
    // 更新LOD和视锥体剔除（每几帧执行一次，不是每帧都执行）
    if (animationId % 3 === 0) { // 每3帧更新一次
      updateLOD();
    }
    
    // 节点动画效果（只在性能允许时执行）
    if (nodes.length < 200) { // 节点较少时才执行动画
      nodes.forEach((node, index) => {
        const time = Date.now() * 0.001;
        node.rotation.y = time * 0.5 + index * 0.1;
      });
    }

    renderer.render(scene, camera);
  }

  /**
   * 高亮节点
   */
  function highlightNode(symbolId, highlight = true) {
    const nodeData = nodeObjects.get(symbolId);
    if (nodeData) {
      const material = nodeData.mesh.material;
      if (highlight) {
        material.emissive.setHex(0x444444);
        material.opacity = 1.0;
      } else {
        material.emissive.setHex(0x000000);
        material.opacity = 0.8;
      }
    }
  }

  /**
   * 高亮相关边
   */
  function highlightRelatedEdges(symbolId, highlight = true) {
    edges.forEach(edge => {
      const userData = edge.userData;
      if (userData.from === symbolId || userData.to === symbolId) {
        const material = edge.material;
        if (highlight) {
          material.opacity = 1.0;
          material.linewidth = 3;
        } else {
          material.opacity = CONFIG.EDGE_OPACITY;
          material.linewidth = 1;
        }
      }
    });
  }

  /**
   * 重置视图
   */
  function resetView() {
    camera.position.set(0, 0, CONFIG.CAMERA_DISTANCE);
    controls.reset();
  }

  /**
   * 清理场景（优化版本）
   */
  function cleanup() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    
    // 批量清理几何体和材质
    const geometriesToDispose = [];
    const materialsToDispose = [];
    
    nodes.forEach(node => {
      scene.remove(node);
      if (node.geometry) geometriesToDispose.push(node.geometry);
      if (node.material) materialsToDispose.push(node.material);
      
      // 清理标签
      if (node.userData.label) {
        scene.remove(node.userData.label);
        if (node.userData.label.material && node.userData.label.material.map) {
          node.userData.label.material.map.dispose();
        }
        if (node.userData.label.material) {
          node.userData.label.material.dispose();
        }
      }
    });
    
    edges.forEach(edge => {
      scene.remove(edge);
      if (edge.geometry) geometriesToDispose.push(edge.geometry);
      if (edge.material) materialsToDispose.push(edge.material);
    });
    
    // 批量dispose
    geometriesToDispose.forEach(geometry => geometry.dispose());
    materialsToDispose.forEach(material => material.dispose());
    
    nodes = [];
    edges = [];
    nodeObjects.clear();
    edgeObjects.clear();
  }

  /**
   * 窗口大小调整
   */
  function handleResize() {
    if (camera && renderer) {
      const container = renderer.domElement.parentElement;
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
  }

    // 公开的API
  window.CodeViz3DVisualizer = {
    initScene,
    create3DNodes,
    create3DEdges,
    animate,
    highlightNode,
    highlightRelatedEdges,
    resetView,
    cleanup,
    handleResize,
    updateLOD, // 公开LOD更新函数
    getScene: () => scene,
    getCamera: () => camera,
    getRenderer: () => renderer
  };

})();