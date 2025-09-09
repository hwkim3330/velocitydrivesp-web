// YANG Tree Builder for VelocityDRIVE-SP Web Interface
// Dynamically builds hierarchical tree from SID mappings

class YangTreeBuilder {
  constructor(sidMappings) {
    this.sidMappings = sidMappings;
    this.tree = this.buildTree();
  }

  buildTree() {
    const tree = {};
    
    // Group paths by module
    for (const [sid, yangPath] of Object.entries(this.sidMappings)) {
      if (!yangPath.startsWith('/')) continue;
      
      const parts = yangPath.split('/').filter(p => p);
      if (parts.length === 0) continue;
      
      // Extract module name (everything before first colon)
      const firstPart = parts[0];
      const colonIndex = firstPart.indexOf(':');
      if (colonIndex === -1) continue;
      
      const moduleName = firstPart.substring(0, colonIndex);
      const rootElement = firstPart.substring(colonIndex + 1);
      
      if (!tree[moduleName]) {
        tree[moduleName] = {
          name: moduleName,
          icon: this.getModuleIcon(moduleName),
          children: {},
          paths: []
        };
      }
      
      tree[moduleName].paths.push({
        sid: parseInt(sid),
        path: yangPath,
        displayName: this.getDisplayName(yangPath)
      });
      
      // Build hierarchical structure
      this.addToHierarchy(tree[moduleName].children, parts, yangPath, parseInt(sid));
    }
    
    return tree;
  }
  
  addToHierarchy(node, parts, fullPath, sid) {
    if (parts.length === 0) return;
    
    const currentPart = parts[0];
    const remaining = parts.slice(1);
    
    // Remove module prefix for display
    const colonIndex = currentPart.indexOf(':');
    const displayName = colonIndex > 0 ? currentPart.substring(colonIndex + 1) : currentPart;
    
    if (!node[displayName]) {
      node[displayName] = {
        name: displayName,
        fullPath: this.buildPartialPath(parts.slice(0, parts.indexOf(currentPart) + 1)),
        children: {},
        isLeaf: remaining.length === 0,
        sid: remaining.length === 0 ? sid : null
      };
    }
    
    if (remaining.length > 0) {
      this.addToHierarchy(node[displayName].children, remaining, fullPath, sid);
    }
  }
  
  buildPartialPath(parts) {
    return '/' + parts.join('/');
  }
  
  getModuleIcon(moduleName) {
    const iconMap = {
      'ietf-interfaces': '🔌',
      'ietf-system': '⚙️',
      'ietf-hardware': '🖥️',
      'ietf-ip': '🌐',
      'ietf-routing': '🛣️',
      'ieee802-dot1q-bridge': '🌉',
      'ieee802-dot1ab-lldp': '📡',
      'ieee1588-ptp': '🕒',
      'ieee802-ethernet-interface': '🔗',
      'mchp-velocitysp-system': '🔧',
      'mchp-velocitysp-port': '🚪',
      'mchp-velocitysp-acl': '🛡️',
      'mchp-velocitysp-bridge': '🌉',
      'mchp-velocitysp-ptp': '⏰'
    };
    return iconMap[moduleName] || '📁';
  }
  
  getDisplayName(yangPath) {
    const parts = yangPath.split('/').filter(p => p);
    if (parts.length === 0) return yangPath;
    
    const lastPart = parts[parts.length - 1];
    const colonIndex = lastPart.indexOf(':');
    
    if (colonIndex > 0) {
      return lastPart.substring(colonIndex + 1);
    }
    return lastPart;
  }
  
  renderTree(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    // Sort modules for consistent display
    const sortedModules = Object.keys(this.tree).sort();
    
    for (const moduleName of sortedModules) {
      const module = this.tree[moduleName];
      const moduleElement = this.createModuleElement(module);
      container.appendChild(moduleElement);
    }
  }
  
  createModuleElement(module) {
    const moduleDiv = document.createElement('div');
    moduleDiv.className = 'tree-module';
    
    const moduleHeader = document.createElement('div');
    moduleHeader.className = 'tree-module-header';
    moduleHeader.innerHTML = `
      <span class="tree-icon">${module.icon}</span>
      <span class="tree-label">${module.name}</span>
      <span class="tree-expand">▼</span>
    `;
    
    const moduleContent = document.createElement('div');
    moduleContent.className = 'tree-module-content';
    moduleContent.style.display = 'none';
    
    // Add root paths for this module
    const rootPaths = module.paths.filter(p => 
      p.path.split('/').filter(part => part).length <= 2
    );
    
    for (const pathInfo of rootPaths) {
      const pathElement = this.createPathElement(pathInfo);
      moduleContent.appendChild(pathElement);
    }
    
    // Add expand/collapse functionality
    moduleHeader.addEventListener('click', () => {
      const isExpanded = moduleContent.style.display !== 'none';
      moduleContent.style.display = isExpanded ? 'none' : 'block';
      moduleHeader.querySelector('.tree-expand').textContent = isExpanded ? '▶' : '▼';
    });
    
    moduleDiv.appendChild(moduleHeader);
    moduleDiv.appendChild(moduleContent);
    
    return moduleDiv;
  }
  
  createPathElement(pathInfo) {
    const pathDiv = document.createElement('div');
    pathDiv.className = 'tree-item';
    pathDiv.dataset.path = pathInfo.path;
    pathDiv.dataset.sid = pathInfo.sid;
    
    pathDiv.innerHTML = `
      <span class="tree-icon">📄</span>
      <span class="tree-label">${pathInfo.displayName}</span>
      <span class="tree-sid">SID:${pathInfo.sid}</span>
    `;
    
    // Add click handler for path selection
    pathDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Remove previous selection
      document.querySelectorAll('.tree-item.selected').forEach(item => {
        item.classList.remove('selected');
      });
      
      // Select current item
      pathDiv.classList.add('selected');
      
      // Update global selected path
      if (window.selectYangPath) {
        window.selectYangPath(pathInfo.path, pathInfo.sid);
      }
    });
    
    return pathDiv;
  }
  
  searchTree(query) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    for (const [sid, yangPath] of Object.entries(this.sidMappings)) {
      if (yangPath.toLowerCase().includes(queryLower)) {
        results.push({
          sid: parseInt(sid),
          path: yangPath,
          displayName: this.getDisplayName(yangPath),
          module: yangPath.split(':')[0].substring(1)
        });
      }
    }
    
    return results.sort((a, b) => a.path.localeCompare(b.path));
  }
}

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
  module.exports = YangTreeBuilder;
} else if (typeof window !== 'undefined') {
  window.YangTreeBuilder = YangTreeBuilder;
}