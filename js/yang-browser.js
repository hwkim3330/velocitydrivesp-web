// YANG Browser Implementation
export class YANGBrowser {
    constructor(coreconfClient) {
        this.coreconf = coreconfClient;
        this.modules = new Map();
        this.schemas = new Map();
        this.currentModule = null;
    }
    
    async getModules() {
        try {
            const modules = await this.coreconf.getYangModules();
            
            // Transform to expected format
            const moduleList = modules.map(module => ({
                name: module.name,
                revision: module.revision || 'unknown',
                namespace: module.namespace,
                description: module.description || ''
            }));
            
            // Cache modules
            moduleList.forEach(module => {
                this.modules.set(module.name, module);
            });
            
            return moduleList;
        } catch (error) {
            console.error('Failed to get YANG modules:', error);
            
            // Return default modules if API fails
            return this.getDefaultModules();
        }
    }
    
    getDefaultModules() {
        return [
            {
                name: 'ietf-system',
                revision: '2014-08-06',
                namespace: 'urn:ietf:params:xml:ns:yang:ietf-system',
                description: 'System management'
            },
            {
                name: 'ietf-interfaces',
                revision: '2018-02-20',
                namespace: 'urn:ietf:params:xml:ns:yang:ietf-interfaces',
                description: 'Interface configuration'
            },
            {
                name: 'ieee802-dot1q-sched',
                revision: '2021-07-01',
                namespace: 'urn:ieee:std:802.1Q:yang:ieee802-dot1q-sched',
                description: 'IEEE 802.1Q Scheduled Traffic'
            },
            {
                name: 'ieee1588-ptp',
                revision: '2020-06-04',
                namespace: 'urn:ieee:std:1588:yang:ieee1588-ptp',
                description: 'IEEE 1588 PTP'
            }
        ];
    }
    
    async loadModule(moduleName) {
        try {
            this.currentModule = moduleName;
            
            // Get module schema if available
            const schema = await this.coreconf.getYangSchema(moduleName);
            if (schema) {
                this.schemas.set(moduleName, schema);
            }
            
            // Generate tree view
            const tree = await this.generateModuleTree(moduleName);
            return tree;
        } catch (error) {
            console.error('Failed to load module:', error);
            return this.generateDefaultTree(moduleName);
        }
    }
    
    async generateModuleTree(moduleName) {
        try {
            // Get current configuration for the module
            const config = await this.coreconf.get(`/${moduleName}:`);
            
            // Generate tree based on actual data
            return this.createTreeFromConfig(moduleName, config);
        } catch (error) {
            console.error('Failed to generate tree:', error);
            return this.generateDefaultTree(moduleName);
        }
    }
    
    createTreeFromConfig(moduleName, config, parentPath = '') {
        if (!config) return '<div class="tree-empty">No data available</div>';
        
        let html = '<ul class="yang-tree-root">';
        
        for (const [key, value] of Object.entries(config)) {
            const path = parentPath ? `${parentPath}/${key}` : key;
            html += this.createTreeNode(key, value, path);
        }
        
        html += '</ul>';
        return html;
    }
    
    createTreeNode(key, value, path, level = 0) {
        const indent = '  '.repeat(level);
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Container node
            let html = `${indent}<li class="tree-node container" data-path="${path}">`;
            html += `<span class="tree-toggle">▼</span>`;
            html += `<span class="tree-key">${key}</span>`;
            html += `<ul class="tree-children">`;
            
            for (const [childKey, childValue] of Object.entries(value)) {
                const childPath = `${path}/${childKey}`;
                html += this.createTreeNode(childKey, childValue, childPath, level + 1);
            }
            
            html += '</ul></li>';
            return html;
        } else if (Array.isArray(value)) {
            // List node
            let html = `${indent}<li class="tree-node list" data-path="${path}">`;
            html += `<span class="tree-toggle">▼</span>`;
            html += `<span class="tree-key">${key}</span>`;
            html += `<span class="tree-type">[${value.length}]</span>`;
            html += `<ul class="tree-children">`;
            
            value.forEach((item, index) => {
                const itemPath = `${path}[${index}]`;
                html += this.createTreeNode(`[${index}]`, item, itemPath, level + 1);
            });
            
            html += '</ul></li>';
            return html;
        } else {
            // Leaf node
            const valueStr = typeof value === 'string' ? `"${value}"` : String(value);
            let html = `${indent}<li class="tree-node leaf" data-path="${path}">`;
            html += `<span class="tree-key">${key}</span>`;
            html += `<span class="tree-value" data-type="${typeof value}">${valueStr}</span>`;
            html += `<button class="tree-edit" onclick="app.yangBrowser.editValue('${path}', '${typeof value}')">✏️</button>`;
            html += '</li>';
            return html;
        }
    }
    
    generateDefaultTree(moduleName) {
        const defaultTrees = {
            'ietf-system': this.generateSystemTree(),
            'ietf-interfaces': this.generateInterfacesTree(),
            'ieee802-dot1q-sched': this.generateTSNTree(),
            'ieee1588-ptp': this.generatePTPTree()
        };
        
        return defaultTrees[moduleName] || '<div class="tree-empty">Module not supported</div>';
    }
    
    generateSystemTree() {
        return `
        <ul class="yang-tree-root">
            <li class="tree-node container" data-path="system">
                <span class="tree-toggle">▼</span>
                <span class="tree-key">system</span>
                <ul class="tree-children">
                    <li class="tree-node leaf" data-path="system/hostname">
                        <span class="tree-key">hostname</span>
                        <span class="tree-value">velocitysp</span>
                        <button class="tree-edit" onclick="app.yangBrowser.editValue('system/hostname', 'string')">✏️</button>
                    </li>
                    <li class="tree-node container" data-path="system/clock">
                        <span class="tree-toggle">▼</span>
                        <span class="tree-key">clock</span>
                        <ul class="tree-children">
                            <li class="tree-node leaf" data-path="system/clock/timezone-name">
                                <span class="tree-key">timezone-name</span>
                                <span class="tree-value">UTC</span>
                                <button class="tree-edit" onclick="app.yangBrowser.editValue('system/clock/timezone-name', 'string')">✏️</button>
                            </li>
                        </ul>
                    </li>
                </ul>
            </li>
        </ul>`;
    }
    
    generateInterfacesTree() {
        return `
        <ul class="yang-tree-root">
            <li class="tree-node container" data-path="interfaces">
                <span class="tree-toggle">▼</span>
                <span class="tree-key">interfaces</span>
                <ul class="tree-children">
                    <li class="tree-node list" data-path="interfaces/interface">
                        <span class="tree-toggle">▼</span>
                        <span class="tree-key">interface</span>
                        <ul class="tree-children">
                            <li class="tree-node container" data-path="interfaces/interface[0]">
                                <span class="tree-toggle">▼</span>
                                <span class="tree-key">[eth0]</span>
                                <ul class="tree-children">
                                    <li class="tree-node leaf" data-path="interfaces/interface[0]/name">
                                        <span class="tree-key">name</span>
                                        <span class="tree-value">eth0</span>
                                    </li>
                                    <li class="tree-node leaf" data-path="interfaces/interface[0]/type">
                                        <span class="tree-key">type</span>
                                        <span class="tree-value">ethernetCsmacd</span>
                                    </li>
                                    <li class="tree-node leaf" data-path="interfaces/interface[0]/enabled">
                                        <span class="tree-key">enabled</span>
                                        <span class="tree-value">true</span>
                                        <button class="tree-edit" onclick="app.yangBrowser.editValue('interfaces/interface[0]/enabled', 'boolean')">✏️</button>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>
            </li>
        </ul>`;
    }
    
    generateTSNTree() {
        return `
        <ul class="yang-tree-root">
            <li class="tree-node container" data-path="sched">
                <span class="tree-toggle">▼</span>
                <span class="tree-key">sched</span>
                <ul class="tree-children">
                    <li class="tree-node container" data-path="sched/interfaces">
                        <span class="tree-toggle">▼</span>
                        <span class="tree-key">interfaces</span>
                        <ul class="tree-children">
                            <li class="tree-node list" data-path="sched/interfaces/interface">
                                <span class="tree-toggle">▼</span>
                                <span class="tree-key">interface</span>
                                <ul class="tree-children">
                                    <li class="tree-node container" data-path="sched/interfaces/interface[0]">
                                        <span class="tree-toggle">▼</span>
                                        <span class="tree-key">[eth0]</span>
                                        <ul class="tree-children">
                                            <li class="tree-node container" data-path="sched/interfaces/interface[0]/scheduler">
                                                <span class="tree-toggle">▼</span>
                                                <span class="tree-key">scheduler</span>
                                            </li>
                                            <li class="tree-node container" data-path="sched/interfaces/interface[0]/gate-parameters">
                                                <span class="tree-toggle">▼</span>
                                                <span class="tree-key">gate-parameters</span>
                                            </li>
                                        </ul>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>
            </li>
        </ul>`;
    }
    
    generatePTPTree() {
        return `
        <ul class="yang-tree-root">
            <li class="tree-node container" data-path="ptp">
                <span class="tree-toggle">▼</span>
                <span class="tree-key">ptp</span>
                <ul class="tree-children">
                    <li class="tree-node list" data-path="ptp/instance">
                        <span class="tree-toggle">▼</span>
                        <span class="tree-key">instance</span>
                        <ul class="tree-children">
                            <li class="tree-node container" data-path="ptp/instance[0]">
                                <span class="tree-toggle">▼</span>
                                <span class="tree-key">[0]</span>
                                <ul class="tree-children">
                                    <li class="tree-node leaf" data-path="ptp/instance[0]/instance-index">
                                        <span class="tree-key">instance-index</span>
                                        <span class="tree-value">0</span>
                                    </li>
                                    <li class="tree-node leaf" data-path="ptp/instance[0]/domain-number">
                                        <span class="tree-key">domain-number</span>
                                        <span class="tree-value">0</span>
                                        <button class="tree-edit" onclick="app.yangBrowser.editValue('ptp/instance[0]/domain-number', 'number')">✏️</button>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>
            </li>
        </ul>`;
    }
    
    setupTreeInteractions() {
        // Add event listeners after tree is rendered
        setTimeout(() => {
            this.addTreeEventListeners();
        }, 100);
    }
    
    addTreeEventListeners() {
        // Toggle tree nodes
        document.querySelectorAll('.tree-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const node = e.target.closest('.tree-node');
                const children = node.querySelector('.tree-children');
                
                if (children) {
                    const isExpanded = !children.classList.contains('collapsed');
                    children.classList.toggle('collapsed');
                    e.target.textContent = isExpanded ? '▶' : '▼';
                }
            });
        });
        
        // Select tree nodes
        document.querySelectorAll('.tree-node').forEach(node => {
            node.addEventListener('click', (e) => {
                if (e.target.classList.contains('tree-toggle') || 
                    e.target.classList.contains('tree-edit')) {
                    return;
                }
                
                // Remove previous selection
                document.querySelectorAll('.tree-node.selected').forEach(n => {
                    n.classList.remove('selected');
                });
                
                // Add selection
                node.classList.add('selected');
                
                // Update editor with node value
                this.updateEditor(node);
            });
        });
    }
    
    updateEditor(node) {
        const path = node.dataset.path;
        const editor = document.getElementById('yangEditor');
        
        if (node.classList.contains('leaf')) {
            const value = node.querySelector('.tree-value').textContent;
            const type = node.querySelector('.tree-value').dataset.type;
            
            const editorContent = {
                path: `/${this.currentModule}:${path}`,
                value: type === 'string' ? value.replace(/^"|"$/g, '') : 
                       type === 'number' ? Number(value) : 
                       type === 'boolean' ? value === 'true' : value
            };
            
            editor.value = JSON.stringify(editorContent, null, 2);
        } else {
            // Container or list - show path only
            editor.value = JSON.stringify({
                path: `/${this.currentModule}:${path}`,
                note: "Select a leaf node to edit value"
            }, null, 2);
        }
    }
    
    editValue(path, type) {
        const currentValue = document.querySelector(`[data-path="${path}"] .tree-value`).textContent;
        let newValue = prompt(`Edit ${path} (${type}):`, 
            type === 'string' ? currentValue.replace(/^"|"$/g, '') : currentValue
        );
        
        if (newValue !== null) {
            // Convert value based on type
            if (type === 'number') {
                newValue = Number(newValue);
            } else if (type === 'boolean') {
                newValue = newValue.toLowerCase() === 'true';
            }
            
            // Update editor
            const editor = document.getElementById('yangEditor');
            editor.value = JSON.stringify({
                path: `/${this.currentModule}:${path}`,
                value: newValue
            }, null, 2);
            
            // Update tree display
            const valueElement = document.querySelector(`[data-path="${path}"] .tree-value`);
            valueElement.textContent = type === 'string' ? `"${newValue}"` : String(newValue);
        }
    }
}