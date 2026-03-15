/**
 * 简化的3D可视化器 - 不依赖Three.js全局变量
 * 使用轻量级实现
 */

(function() {
  'use strict';
  
  console.log('Simple3DVisualizer script loaded');

  // 简化的3D数学工具
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }

    distanceTo(v) {
      const dx = this.x - v.x;
      const dy = this.y - v.y;
      const dz = this.z - v.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }

    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
  }

  class Color {
    constructor(hex) {
      this.hex = hex;
      this.r = ((hex >> 16) & 255) / 255;
      this.g = ((hex >> 8) & 255) / 255;
      this.b = (hex & 255) / 255;
    }
  }

  // 简化的3D可视化器
  class Simple3DVisualizer {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.camera = {
        position: new Vector3(0, 0, 500),
        target: new Vector3(0, 0, 0),
        fov: 75,
        aspect: 1,
        near: 0.1,
        far: 2000
      };
      this.nodes = [];
      this.edges = [];
      this.animationId = null;
      this.isDragging = false;
      this.lastMouse = { x: 0, y: 0 };
      this.rotation = { x: 0, y: 0 };
      this.zoom = 1;
      
      console.log('Simple3DVisualizer instance created');
    }

    // 检查可视化器是否准备就绪
    isReady() {
      return !!(this.canvas && this.ctx && this.canvas.width > 0 && this.canvas.height > 0);
    }

    initScene(container) {
      try {
        console.log('=== initScene started ===');
        if (!container) {
          throw new Error('Container element is required');
        }
        
        console.log('Initializing 3D scene in container:', container);
        console.log('Container dimensions:', container.clientWidth, 'x', container.clientHeight);
        console.log('Container styles:', {
          width: container.style.width,
          height: container.style.height,
          display: container.style.display,
          position: container.style.position
        });
        
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'visualizer-3d-canvas'; // 使用专用CSS类
        this.canvas.style.background = '#1a1a1a';
        
        console.log('Canvas created:', this.canvas);
        
        container.appendChild(this.canvas);
        console.log('Canvas appended to container');

        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
          throw new Error('Failed to get 2D context from canvas');
        }
        
        console.log('2D context obtained successfully');
        
        // 延迟resize确保DOM完全渲染
        setTimeout(() => {
          console.log('Calling initial resize...');
          this.resize();
          console.log('Initial resize completed, canvas size:', this.canvas.width, 'x', this.canvas.height);
          
          // 强制绘制一帧测试场景
          if (this.nodes.length === 0) {
            console.log('No nodes found, creating test scene for initial render');
            this.createTestScene();
          }
          
          console.log('Force rendering first frame...');
          this.render();
          console.log('First frame rendered');
          
        }, 100);
        
        this.setupEventListeners();
        
        console.log('=== initScene completed successfully ===');
        return this.canvas;
      } catch (error) {
        console.error('=== initScene failed ===', error);
        throw error;
      }
    }

    resize() {
      if (!this.canvas || !this.canvas.parentElement) {
        console.warn('Canvas or parent element not available for resize');
        return;
      }
      
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      console.log('Resizing canvas to:', rect.width, 'x', rect.height, 'DPR:', dpr);
      
      // 保存当前变换矩阵
      const currentTransform = this.ctx.getTransform();
      
      // 设置Canvas的实际像素尺寸
      this.canvas.width = Math.floor(rect.width * dpr);
      this.canvas.height = Math.floor(rect.height * dpr);
      
      // 设置Canvas的显示尺寸
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';
      
      // 重置变换矩阵并应用设备像素比缩放
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
      
      this.camera.aspect = rect.width / rect.height;
      
      console.log('Canvas resized to:', this.canvas.width, 'x', this.canvas.height, 
                  'display size:', rect.width, 'x', rect.height);
    }

    setupEventListeners() {
      this.canvas.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      });

      this.canvas.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        
        const deltaX = e.clientX - this.lastMouse.x;
        const deltaY = e.clientY - this.lastMouse.y;
        
        this.rotation.y += deltaX * 0.01;
        this.rotation.x += deltaY * 0.01;
        
        this.lastMouse = { x: e.clientX, y: e.clientY };
      });

      this.canvas.addEventListener('mouseup', () => {
        this.isDragging = false;
      });

      this.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom = Math.max(0.1, Math.min(5, this.zoom));
      });

      window.addEventListener('resize', () => this.resize());
    }

    project3D(point) {
      // 简化的3D到2D投影，确保不会出现负的scale值
      const rotatedX = point.x * Math.cos(this.rotation.y) - point.z * Math.sin(this.rotation.y);
      const rotatedZ = point.x * Math.sin(this.rotation.y) + point.z * Math.cos(this.rotation.y);
      const rotatedY = point.y * Math.cos(this.rotation.x) - rotatedZ * Math.sin(this.rotation.x);
      const finalZ = point.y * Math.sin(this.rotation.x) + rotatedZ * Math.cos(this.rotation.x);
      
      // 确保scale始终为正数，并限制在合理范围内
      const baseScale = 200 / Math.max(50, 200 + finalZ); // 最小距离50，避免除零
      const scale = Math.max(0.1, Math.min(3, baseScale * this.zoom)); // 限制scale范围
      
      return {
        x: this.canvas.width / 2 + rotatedX * scale,
        y: this.canvas.height / 2 + rotatedY * scale,
        scale: scale
      };
    }

    create3DNodes(graphData) {
      console.log('Creating 3D nodes, total symbols:', graphData.symbols.length);
      
      const positions = new Map();
      const modules = new Map();
      
      // 按模块分组
      graphData.symbols.forEach(symbol => {
        if (!modules.has(symbol.module_name)) {
          modules.set(symbol.module_name, []);
        }
        modules.get(symbol.module_name).push(symbol);
      });

      console.log('Modules found:', modules.size);

      // 简化的圆形布局，限制节点数量避免性能问题
      const maxNodes = 500; // 限制最大节点数量
      const symbolsToShow = graphData.symbols.slice(0, maxNodes);
      const moduleNames = Array.from(modules.keys());
      const angleStep = (2 * Math.PI) / Math.max(1, moduleNames.length);
      
      moduleNames.forEach((moduleName, moduleIndex) => {
        const moduleSymbols = modules.get(moduleName);
        const moduleAngle = moduleIndex * angleStep;
        const moduleRadius = Math.min(200, 100 + moduleNames.length * 10); // 动态调整半径
        
        // 限制每个模块的节点数量
        const maxSymbolsPerModule = Math.min(50, Math.ceil(maxNodes / moduleNames.length));
        const symbolsToDisplay = moduleSymbols.slice(0, maxSymbolsPerModule);
        
        console.log(`Module ${moduleName}: ${symbolsToDisplay.length} symbols`);
        
        symbolsToDisplay.forEach((symbol, symbolIndex) => {
          const symbolAngle = (symbolIndex / Math.max(1, symbolsToDisplay.length)) * 2 * Math.PI;
          const symbolRadius = Math.min(80, 40 + symbolsToDisplay.length * 2); // 动态调整符号半径
          
          const position = new Vector3(
            Math.cos(moduleAngle) * moduleRadius + Math.cos(symbolAngle) * symbolRadius,
            (symbolIndex - symbolsToDisplay.length / 2) * 15, // 减少Y轴间距
            Math.sin(moduleAngle) * moduleRadius + Math.sin(symbolAngle) * symbolRadius
          );
          
          positions.set(symbol.id, position);
          
          this.nodes.push({
            id: symbol.id,
            name: symbol.symbol_name,
            type: symbol.symbol_type,
            position: position,
            color: this.getNodeColor(symbol.symbol_type),
            size: this.getNodeSize(symbol.symbol_type)
          });
        });
      });

      console.log('Total nodes created:', this.nodes.length);
      return positions;
    }

    // 创建测试场景
    createTestScene() {
      console.log('=== createTestScene started ===');
      
      // 清空现有数据
      this.nodes = [];
      this.edges = [];
      
      console.log('Creating test nodes...');
      
      // 创建简单的测试节点
      this.nodes.push({
        id: 'test1',
        name: 'Test Node 1',
        type: 'function',
        position: new Vector3(0, 0, 0),
        color: '#4CAF50',
        size: 20
      });
      
      this.nodes.push({
        id: 'test2',
        name: 'Test Node 2',
        type: 'class',
        position: new Vector3(100, 0, 0),
        color: '#2196F3',
        size: 25
      });
      
      this.nodes.push({
        id: 'test3',
        name: 'Test Node 3',
        type: 'variable',
        position: new Vector3(0, 100, 0),
        color: '#FF9800',
        size: 15
      });
      
      console.log('Test nodes created:', this.nodes.length);
      
      // 创建测试边
      console.log('Creating test edges...');
      this.edges.push({
        from: new Vector3(0, 0, 0),
        to: new Vector3(100, 0, 0),
        color: '#666666'
      });
      
      this.edges.push({
        from: new Vector3(0, 0, 0),
        to: new Vector3(0, 100, 0),
        color: '#666666'
      });
      
      console.log('Test edges created:', this.edges.length);
      console.log('=== createTestScene completed ===');
    }

    create3DEdges(graphData, positions) {
      graphData.edges.forEach(edge => {
        const fromPos = positions.get(edge.from);
        const toPos = positions.get(edge.to);
        
        if (!fromPos || !toPos) return;

        this.edges.push({
          from: fromPos,
          to: toPos,
          color: this.getEdgeColor(edge.dependency_type),
          type: edge.dependency_type
        });
      });
    }

    getNodeColor(symbolType) {
      const colors = {
        function: '#4CAF50',
        class: '#2196F3',
        method: '#FF9800',
        property: '#9C27B0',
        variable: '#607D8B',
        interface: '#00BCD4',
        constant: '#FF5722',
        default: '#757575'
      };
      return colors[symbolType] || colors.default;
    }

    getNodeSize(symbolType) {
      const sizes = {
        function: 8,
        class: 12,
        method: 6,
        property: 5,
        variable: 4,
        interface: 10,
        constant: 6,
        default: 6
      };
      return sizes[symbolType] || sizes.default;
    }

    getEdgeColor(dependencyType) {
      const colors = {
        call: '#4CAF50',
        import: '#2196F3',
        inherit: '#FF9800',
        implement: '#9C27B0',
        reference: '#757575'
      };
      return colors[dependencyType] || colors.reference;
    }

    animate() {
      console.log('Starting animation loop...');
      if (!this.canvas || !this.ctx) {
        console.warn('Canvas or context not available for animation');
        return;
      }
      
      console.log('Animation loop started, nodes:', this.nodes.length, 'edges:', this.edges.length);
      
      const animateFrame = () => {
        this.animationId = requestAnimationFrame(animateFrame);
        this.render();
      };
      
      animateFrame();
    }

    render() {
      try {
        if (!this.ctx || !this.canvas) {
          console.warn('Canvas or context not available for rendering');
          return;
        }
        
        console.log('Rendering frame - nodes:', this.nodes.length, 'edges:', this.edges.length);
        
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制背景色
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制简单的测试矩形
        if (this.nodes.length === 0) {
          console.log('No nodes to render, drawing test rectangle');
          this.ctx.fillStyle = '#ff0000';
          this.ctx.fillRect(50, 50, 100, 100);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.font = '16px Arial';
          this.ctx.fillText('3D Visualizer Ready', 60, 90);
          return;
        }
        
        // 绘制边
        this.edges.forEach(edge => {
          try {
            const from = this.project3D(edge.from);
            const to = this.project3D(edge.to);
            
            // 边界检查：如果两个端点都在屏幕外，跳过绘制
            const margin = 100;
            if ((from.x < -margin && to.x < -margin) || 
                (from.x > this.canvas.width + margin && to.x > this.canvas.width + margin) ||
                (from.y < -margin && to.y < -margin) || 
                (from.y > this.canvas.height + margin && to.y > this.canvas.height + margin)) {
              return;
            }
            
            this.ctx.strokeStyle = edge.color;
            this.ctx.globalAlpha = Math.max(0.1, Math.min(0.8, (from.scale + to.scale) / 2 * 0.8)); // 根据距离调整透明度
            this.ctx.lineWidth = Math.max(0.5, Math.min(3, (from.scale + to.scale) / 2)); // 根据距离调整线宽
            this.ctx.beginPath();
            this.ctx.moveTo(from.x, from.y);
            this.ctx.lineTo(to.x, to.y);
            this.ctx.stroke();
          } catch (edgeError) {
            console.warn('绘制边时出错:', edgeError);
          }
        });
        
        // 按深度排序节点
        const sortedNodes = [...this.nodes].sort((a, b) => {
          try {
            const projA = this.project3D(a.position);
            const projB = this.project3D(b.position);
            return projB.scale - projA.scale;
          } catch (sortError) {
            return 0; // 如果排序出错，保持原顺序
          }
        });
        
        console.log('Rendering nodes:', sortedNodes.length);
        
        // 绘制节点
        sortedNodes.forEach(node => {
          try {
            const projected = this.project3D(node.position);
            
            console.log('Node projection:', node.name, projected);
            
            // 边界检查：确保节点在画布范围内
            if (projected.x < -100 || projected.x > this.canvas.width + 100 || 
                projected.y < -100 || projected.y > this.canvas.height + 100) {
              return; // 跳过绘制屏幕外的节点
            }
            
            // 确保半径为正数且在合理范围内
            const radius = Math.max(2, Math.min(50, node.size * projected.scale));
            if (radius <= 0) return; // 跳过无效半径
            
            this.ctx.fillStyle = node.color;
            this.ctx.globalAlpha = Math.max(0.1, Math.min(1, projected.scale * 0.8)); // 根据距离调整透明度
            this.ctx.beginPath();
            this.ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制标签（只在足够大时显示）
            if (projected.scale > 0.3 && radius > 3) {
              this.ctx.fillStyle = '#ffffff';
              this.ctx.font = `${Math.max(8, Math.min(16, 10 * projected.scale))}px Arial`;
              this.ctx.textAlign = 'center';
              this.ctx.textBaseline = 'middle';
              this.ctx.fillText(node.name, projected.x, projected.y - radius - 8);
            }
          } catch (nodeError) {
            console.warn('绘制节点时出错:', nodeError);
          }
        });
        
        this.ctx.globalAlpha = 1;
      } catch (renderError) {
        console.error('渲染过程中出错:', renderError);
      }
    }

    cleanup() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      
      if (this.canvas && this.canvas.parentElement) {
        this.canvas.parentElement.removeChild(this.canvas);
      }
      
      this.nodes = [];
      this.edges = [];
    }

    resetView() {
      this.rotation.x = 0;
      this.rotation.y = 0;
      this.zoom = 1;
    }
  }

  // 早期暴露空对象，确保脚本加载时立即可用
  window.CodeViz3DVisualizer = {
    visualizer: null,
    
    initScene(container) {
      if (!this.visualizer) {
        this.visualizer = new Simple3DVisualizer();
      }
      return this.visualizer.initScene(container);
    },
    
    create3DNodes(graphData) {
      if (!this.visualizer) {
        this.visualizer = new Simple3DVisualizer();
      }
      return this.visualizer.create3DNodes(graphData);
    },
    
    create3DEdges(graphData, positions) {
      if (!this.visualizer) {
        this.visualizer = new Simple3DVisualizer();
      }
      this.visualizer.create3DEdges(graphData, positions);
    },
    
    animate() {
      if (!this.visualizer) {
        this.visualizer = new Simple3DVisualizer();
      }
      this.visualizer.animate();
    },
    
    cleanup() {
      if (this.visualizer) {
        this.visualizer.cleanup();
        this.visualizer = null;
      }
    },
    
    resetView() {
      if (this.visualizer) {
        this.visualizer.resetView();
      }
    },
    
    handleResize() {
      if (this.visualizer) {
        this.visualizer.resize();
      }
    },
    
    createTestScene() {
      if (!this.visualizer) {
        this.visualizer = new Simple3DVisualizer();
      }
      this.visualizer.createTestScene();
    }
  };

  console.log('CodeViz3DVisualizer global object created:', window.CodeViz3DVisualizer);

})();