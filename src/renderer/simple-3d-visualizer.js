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
      this.rotation = { x: 0.2, y: 0.3 }; // 初始视角稍微倾斜
      this.zoom = 1.0;
      
      // 添加自动居中功能
      this.centerView();
      
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
        
        // 延迟调用居中函数
        setTimeout(() => {
          console.log('Auto-centering view...');
          this.centerView();
          console.log('View centered, rendering first frame...');
          this.render();
        }, 300);
        
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
      // 鼠标拖拽旋转
      this.canvas.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
        console.log('Started dragging');
      });

      this.canvas.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        
        const deltaX = e.clientX - this.lastMouse.x;
        const deltaY = e.clientY - this.lastMouse.y;
        
        // 调整旋转速度，使拖拽更流畅
        this.rotation.y += deltaX * 0.008; // 降低旋转速度
        this.rotation.x += deltaY * 0.008;
        
        // 限制X轴旋转范围，避免翻转
        this.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.rotation.x));
        
        this.lastMouse = { x: e.clientX, y: e.clientY };
        
        // 实时更新显示
        this.render();
      });

      this.canvas.addEventListener('mouseup', () => {
        if (this.isDragging) {
          this.isDragging = false;
          this.canvas.style.cursor = 'grab';
          console.log('Stopped dragging');
        }
      });

      // 鼠标离开Canvas时停止拖拽
      this.canvas.addEventListener('mouseleave', () => {
        if (this.isDragging) {
          this.isDragging = false;
          this.canvas.style.cursor = 'grab';
        }
      });

      // 滚轮缩放
      this.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // 平滑缩放
        const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
        this.zoom *= zoomFactor;
        
        // 限制缩放范围
        this.zoom = Math.max(0.2, Math.min(3, this.zoom));
        
        console.log('Zoom changed to:', this.zoom);
        
        // 实时更新显示
        this.render();
      });

      // 右键拖拽平移（可选功能）
      let isRightDragging = false;
      let lastRightMouse = { x: 0, y: 0 };
      
      this.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // 阻止右键菜单
      });
      
      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button === 2) { // 右键
          isRightDragging = true;
          lastRightMouse = { x: e.clientX, y: e.clientY };
          this.canvas.style.cursor = 'move';
        }
      });
      
      this.canvas.addEventListener('mousemove', (e) => {
        if (isRightDragging) {
          const deltaX = e.clientX - lastRightMouse.x;
          const deltaY = e.clientY - lastRightMouse.y;
          
          // 平移相机目标点
          this.camera.target.x -= deltaX * 0.5;
          this.camera.target.y += deltaY * 0.5;
          
          lastRightMouse = { x: e.clientX, y: e.clientY };
          this.render();
        }
      });
      
      this.canvas.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
          isRightDragging = false;
          this.canvas.style.cursor = 'grab';
        }
      });

      // 窗口大小变化
      window.addEventListener('resize', () => this.resize());
      
      // 设置初始鼠标样式
      this.canvas.style.cursor = 'grab';
      
      console.log('Event listeners setup complete');
      
      // 添加键盘控制
      this.setupKeyboardControls();
    }

    setupKeyboardControls() {
      document.addEventListener('keydown', (e) => {
        if (!this.canvas || document.activeElement !== this.canvas) return;
        
        const step = 0.1;
        let needsRender = false;
        
        switch(e.key.toLowerCase()) {
          case 'w':
          case 'arrowup':
            this.rotation.x -= step;
            needsRender = true;
            break;
          case 's':
          case 'arrowdown':
            this.rotation.x += step;
            needsRender = true;
            break;
          case 'a':
          case 'arrowleft':
            this.rotation.y -= step;
            needsRender = true;
            break;
          case 'd':
          case 'arrowright':
            this.rotation.y += step;
            needsRender = true;
            break;
          case 'q':
            this.zoom *= 0.9;
            this.zoom = Math.max(0.2, this.zoom);
            needsRender = true;
            break;
          case 'e':
            this.zoom *= 1.1;
            this.zoom = Math.min(3, this.zoom);
            needsRender = true;
            break;
          case 'r':
            this.resetView();
            needsRender = true;
            break;
        }
        
        if (needsRender) {
          e.preventDefault();
          this.render();
        }
      });
      
      console.log('Keyboard controls setup complete');
      console.log('Available controls:');
      console.log('- Mouse drag: Rotate view');
      console.log('- Mouse wheel: Zoom in/out');
      console.log('- Right mouse drag: Pan view');
      console.log('- W/A/S/D or Arrow keys: Rotate view');
      console.log('- Q/E: Zoom in/out');
      console.log('- R: Reset view');
      
      // 添加触摸控制支持
      this.setupTouchControls();
    }

    setupTouchControls() {
      let lastTouchDistance = 0;
      let lastTouchPoint = { x: 0, y: 0 };
      let isTouchDragging = false;
      
      this.canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        
        if (e.touches.length === 1) {
          // 单指拖拽
          isTouchDragging = true;
          lastTouchPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
          // 双指缩放
          const touch1 = e.touches[0];
          const touch2 = e.touches[1];
          lastTouchDistance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
          );
        }
      });
      
      this.canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        
        if (e.touches.length === 1 && isTouchDragging) {
          // 单指拖拽旋转
          const touch = e.touches[0];
          const deltaX = touch.clientX - lastTouchPoint.x;
          const deltaY = touch.clientY - lastTouchPoint.y;
          
          this.rotation.y += deltaX * 0.01;
          this.rotation.x += deltaY * 0.01;
          
          // 限制X轴旋转范围
          this.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.rotation.x));
          
          lastTouchPoint = { x: touch.clientX, y: touch.clientY };
          this.render();
          
        } else if (e.touches.length === 2) {
          // 双指缩放
          const touch1 = e.touches[0];
          const touch2 = e.touches[1];
          const currentDistance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
          );
          
          if (lastTouchDistance > 0) {
            const scale = currentDistance / lastTouchDistance;
            this.zoom *= scale;
            this.zoom = Math.max(0.2, Math.min(3, this.zoom));
            this.render();
          }
          
          lastTouchDistance = currentDistance;
        }
      });
      
      this.canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        isTouchDragging = false;
        lastTouchDistance = 0;
      });
      
      console.log('Touch controls setup complete');
      console.log('- Single finger: Rotate view');
      console.log('- Two fingers: Zoom in/out');
    }

    project3D(point) {
      // 简化的3D到2D投影，确保不会出现负的scale值
      // 相对于相机目标点进行变换
      const relativePoint = {
        x: point.x - this.camera.target.x,
        y: point.y - this.camera.target.y,
        z: point.z - this.camera.target.z
      };
      
      const rotatedX = relativePoint.x * Math.cos(this.rotation.y) - relativePoint.z * Math.sin(this.rotation.y);
      const rotatedZ = relativePoint.x * Math.sin(this.rotation.y) + relativePoint.z * Math.cos(this.rotation.y);
      const rotatedY = relativePoint.y * Math.cos(this.rotation.x) - rotatedZ * Math.sin(this.rotation.x);
      const finalZ = relativePoint.y * Math.sin(this.rotation.x) + rotatedZ * Math.cos(this.rotation.x);
      
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
      
      // 计算布局中心点
      const centerY = 0; // Y轴居中
      
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
          
          // 计算3D位置，确保围绕中心点布局
          const position = new Vector3(
            Math.cos(moduleAngle) * moduleRadius + Math.cos(symbolAngle) * symbolRadius,
            centerY + (symbolIndex - symbolsToDisplay.length / 2) * 8, // 减少Y轴间距并居中
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
      
      console.log('Creating centered test nodes...');
      
      // 创建居中的测试节点，围绕原点布局
      const testNodes = [
        { name: 'Test Node 1', type: 'function', x: 0, y: 0, z: 0, color: '#4CAF50', size: 20 },
        { name: 'Test Node 2', type: 'class', x: 80, y: 0, z: 0, color: '#2196F3', size: 25 },
        { name: 'Test Node 3', type: 'variable', x: 0, y: 0, z: 80, color: '#FF9800', size: 15 },
        { name: 'Test Node 4', type: 'method', x: -80, y: 0, z: 0, color: '#9C27B0', size: 18 },
        { name: 'Test Node 5', type: 'property', x: 0, y: 0, z: -80, color: '#00BCD4', size: 16 }
      ];
      
      testNodes.forEach((node, index) => {
        this.nodes.push({
          id: `test${index + 1}`,
          name: node.name,
          type: node.type,
          position: new Vector3(node.x, node.y, node.z),
          color: node.color,
          size: node.size
        });
      });
      
      console.log('Test nodes created:', this.nodes.length);
      
      // 创建测试边，连接相邻节点
      console.log('Creating test edges...');
      for (let i = 0; i < this.nodes.length; i++) {
        const nextIndex = (i + 1) % this.nodes.length;
        this.edges.push({
          from: this.nodes[i].position,
          to: this.nodes[nextIndex].position,
          color: '#666666'
        });
      }
      
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
      console.log('Resetting 3D view');
      this.rotation = { x: 0.2, y: 0.3 };
      this.zoom = 1.0;
      this.centerView();
    }

    // 自动居中视图
    centerView() {
      if (this.nodes.length === 0) {
        console.log('No nodes to center view around');
        return;
      }
      
      console.log('Centering view around', this.nodes.length, 'nodes');
      
      // 计算所有节点的中心点
      let centerX = 0, centerY = 0, centerZ = 0;
      this.nodes.forEach(node => {
        centerX += node.position.x;
        centerY += node.position.y;
        centerZ += node.position.z;
      });
      
      centerX /= this.nodes.length;
      centerY /= this.nodes.length;
      centerZ /= this.nodes.length;
      
      console.log('Node center:', centerX, centerY, centerZ);
      
      // 调整相机位置以居中显示
      this.camera.target = new Vector3(centerX, centerY, centerZ);
      
      // 计算合适的缩放级别
      let maxDistance = 0;
      this.nodes.forEach(node => {
        const distance = Math.sqrt(
          Math.pow(node.position.x - centerX, 2) +
          Math.pow(node.position.y - centerY, 2) +
          Math.pow(node.position.z - centerZ, 2)
        );
        maxDistance = Math.max(maxDistance, distance);
      });
      
      // 根据最大距离调整缩放
      if (maxDistance > 0) {
        this.zoom = Math.min(2.0, Math.max(0.5, 300 / maxDistance));
        console.log('Adjusted zoom to:', this.zoom, 'based on max distance:', maxDistance);
      }
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