// Real-time Monitoring Service
export class MonitoringService extends EventTarget {
    constructor(coreconfClient) {
        super();
        this.coreconf = coreconfClient;
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.updateInterval = 1000; // 1 second
        this.chart = null;
        this.chartData = {
            labels: [],
            datasets: []
        };
        this.maxDataPoints = 60; // Keep 60 seconds of data
        this.statistics = new Map();
    }
    
    async start() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.initializeChart();
        
        // Start monitoring loop
        this.monitoringInterval = setInterval(() => {
            this.collectData();
        }, this.updateInterval);
        
        // Initial data collection
        await this.collectData();
        
        this.dispatchEvent(new Event('started'));
    }
    
    stop() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        this.dispatchEvent(new Event('stopped'));
    }
    
    async collectData() {
        if (!this.isMonitoring) return;
        
        try {
            const data = await this.gatherMetrics();
            this.updateStatistics(data);
            this.updateChart(data);
            
            // Emit data event
            this.dispatchEvent(new CustomEvent('data', { detail: data }));
            
        } catch (error) {
            console.error('Failed to collect monitoring data:', error);
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
        }
    }
    
    async gatherMetrics() {
        const data = {
            timestamp: Date.now(),
            ports: [],
            system: {},
            tsn: {}
        };
        
        try {
            // Get interface statistics
            const interfaces = await this.coreconf.get('/ietf-interfaces:interfaces-state');
            if (interfaces && interfaces.interface) {
                data.ports = interfaces.interface.map(iface => ({
                    name: iface.name,
                    operStatus: iface['oper-status'],
                    rxBytes: iface.statistics ? iface.statistics['in-octets'] : 0,
                    txBytes: iface.statistics ? iface.statistics['out-octets'] : 0,
                    rxPackets: iface.statistics ? iface.statistics['in-unicast-pkts'] : 0,
                    txPackets: iface.statistics ? iface.statistics['out-unicast-pkts'] : 0,
                    rxErrors: iface.statistics ? iface.statistics['in-errors'] : 0,
                    txErrors: iface.statistics ? iface.statistics['out-errors'] : 0,
                    speed: iface.speed || 0
                }));
            }
            
            // Get system statistics
            try {
                const systemState = await this.coreconf.get('/ietf-system:system-state');
                if (systemState) {
                    data.system = {
                        currentTime: systemState['current-datetime'],
                        bootTime: systemState['boot-datetime'],
                        uptime: systemState.uptime || 0
                    };
                }
            } catch (e) {
                // System state may not be available
                data.system = { uptime: 0 };
            }
            
            // Get TSN statistics if available
            try {
                const tsnStats = await this.getTSNStatistics();
                data.tsn = tsnStats;
            } catch (e) {
                // TSN stats may not be available
                data.tsn = {};
            }
            
        } catch (error) {
            console.error('Error gathering metrics:', error);
        }
        
        return data;
    }
    
    async getTSNStatistics() {
        const stats = {};
        
        try {
            // CBS statistics
            const cbsStats = await this.coreconf.get('/ieee802-dot1q-sched:interfaces/interface/scheduler/statistics');
            if (cbsStats) {
                stats.cbs = cbsStats;
            }
            
            // TAS statistics
            const tasStats = await this.coreconf.get('/ieee802-dot1q-sched:interfaces/interface/gate-statistics');
            if (tasStats) {
                stats.tas = tasStats;
            }
            
            // PTP statistics
            const ptpStats = await this.coreconf.get('/ieee1588-ptp:ptp/instance/port/port-statistics');
            if (ptpStats) {
                stats.ptp = ptpStats;
            }
            
        } catch (error) {
            console.error('Error getting TSN statistics:', error);
        }
        
        return stats;
    }
    
    updateStatistics(data) {
        const timestamp = data.timestamp;
        
        // Update per-port statistics
        data.ports.forEach(port => {
            if (!this.statistics.has(port.name)) {
                this.statistics.set(port.name, {
                    history: [],
                    rates: {}
                });
            }
            
            const portStats = this.statistics.get(port.name);
            
            // Calculate rates if we have previous data
            if (portStats.history.length > 0) {
                const prev = portStats.history[portStats.history.length - 1];
                const timeDiff = (timestamp - prev.timestamp) / 1000; // seconds
                
                if (timeDiff > 0) {
                    portStats.rates = {
                        rxBytesPerSec: (port.rxBytes - prev.rxBytes) / timeDiff,
                        txBytesPerSec: (port.txBytes - prev.txBytes) / timeDiff,
                        rxPacketsPerSec: (port.rxPackets - prev.rxPackets) / timeDiff,
                        txPacketsPerSec: (port.txPackets - prev.txPackets) / timeDiff
                    };
                }
            }
            
            // Add to history
            portStats.history.push({
                timestamp,
                ...port
            });
            
            // Limit history size
            if (portStats.history.length > this.maxDataPoints) {
                portStats.history.shift();
            }
        });
    }
    
    initializeChart() {
        const canvas = document.getElementById('trafficChart');
        if (!canvas || typeof Chart === 'undefined') {
            console.warn('Chart.js not available or canvas not found');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'second',
                            displayFormats: {
                                second: 'HH:mm:ss'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Mbps'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Network Traffic'
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        });
    }
    
    updateChart(data) {
        if (!this.chart) return;
        
        const timestamp = new Date(data.timestamp);
        
        // Update chart data
        this.chart.data.labels.push(timestamp);
        
        // Limit data points
        if (this.chart.data.labels.length > this.maxDataPoints) {
            this.chart.data.labels.shift();
        }
        
        // Update or create datasets for each port
        data.ports.forEach((port, index) => {
            const portStats = this.statistics.get(port.name);
            const rxRate = portStats?.rates?.rxBytesPerSec || 0;
            const txRate = portStats?.rates?.txBytesPerSec || 0;
            
            // Convert bytes/sec to Mbps
            const rxMbps = (rxRate * 8) / 1000000;
            const txMbps = (txRate * 8) / 1000000;
            
            // RX dataset
            let rxDataset = this.chart.data.datasets.find(d => d.label === `${port.name} RX`);
            if (!rxDataset) {
                rxDataset = {
                    label: `${port.name} RX`,
                    data: [],
                    borderColor: this.getColor(index * 2),
                    backgroundColor: this.getColor(index * 2, 0.1),
                    tension: 0.1,
                    fill: false
                };
                this.chart.data.datasets.push(rxDataset);
            }
            
            rxDataset.data.push(rxMbps);
            if (rxDataset.data.length > this.maxDataPoints) {
                rxDataset.data.shift();
            }
            
            // TX dataset
            let txDataset = this.chart.data.datasets.find(d => d.label === `${port.name} TX`);
            if (!txDataset) {
                txDataset = {
                    label: `${port.name} TX`,
                    data: [],
                    borderColor: this.getColor(index * 2 + 1),
                    backgroundColor: this.getColor(index * 2 + 1, 0.1),
                    tension: 0.1,
                    fill: false,
                    borderDash: [5, 5] // Dashed line for TX
                };
                this.chart.data.datasets.push(txDataset);
            }
            
            txDataset.data.push(txMbps);
            if (txDataset.data.length > this.maxDataPoints) {
                txDataset.data.shift();
            }
        });
        
        this.chart.update('none'); // No animation for real-time updates
    }
    
    getColor(index, alpha = 1) {
        const colors = [
            `rgba(255, 99, 132, ${alpha})`,   // Red
            `rgba(54, 162, 235, ${alpha})`,   // Blue
            `rgba(255, 205, 86, ${alpha})`,   // Yellow
            `rgba(75, 192, 192, ${alpha})`,   // Teal
            `rgba(153, 102, 255, ${alpha})`,  // Purple
            `rgba(255, 159, 64, ${alpha})`,   // Orange
            `rgba(199, 199, 199, ${alpha})`,  // Grey
            `rgba(83, 102, 255, ${alpha})`    // Indigo
        ];
        return colors[index % colors.length];
    }
    
    // Export monitoring data
    exportData(format = 'csv') {
        const data = [];
        
        // Collect all data
        this.statistics.forEach((stats, portName) => {
            stats.history.forEach(entry => {
                data.push({
                    timestamp: new Date(entry.timestamp).toISOString(),
                    port: portName,
                    rxBytes: entry.rxBytes,
                    txBytes: entry.txBytes,
                    rxPackets: entry.rxPackets,
                    txPackets: entry.txPackets,
                    rxErrors: entry.rxErrors,
                    txErrors: entry.txErrors,
                    operStatus: entry.operStatus
                });
            });
        });
        
        if (format === 'csv') {
            return this.exportToCSV(data);
        } else if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }
    }
    
    exportToCSV(data) {
        if (data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => 
                typeof row[header] === 'string' ? `"${row[header]}"` : row[header]
            ).join(','))
        ].join('\n');
        
        return csvContent;
    }
    
    // Get current statistics summary
    getStatisticsSummary() {
        const summary = {
            ports: {},
            totalRxBytes: 0,
            totalTxBytes: 0,
            totalRxPackets: 0,
            totalTxPackets: 0,
            totalRxErrors: 0,
            totalTxErrors: 0
        };
        
        this.statistics.forEach((stats, portName) => {
            if (stats.history.length === 0) return;
            
            const latest = stats.history[stats.history.length - 1];
            const rates = stats.rates || {};
            
            summary.ports[portName] = {
                rxBytes: latest.rxBytes,
                txBytes: latest.txBytes,
                rxPackets: latest.rxPackets,
                txPackets: latest.txPackets,
                rxErrors: latest.rxErrors,
                txErrors: latest.txErrors,
                rxBytesPerSec: rates.rxBytesPerSec || 0,
                txBytesPerSec: rates.txBytesPerSec || 0,
                rxPacketsPerSec: rates.rxPacketsPerSec || 0,
                txPacketsPerSec: rates.txPacketsPerSec || 0,
                operStatus: latest.operStatus
            };
            
            // Add to totals
            summary.totalRxBytes += latest.rxBytes;
            summary.totalTxBytes += latest.txBytes;
            summary.totalRxPackets += latest.rxPackets;
            summary.totalTxPackets += latest.txPackets;
            summary.totalRxErrors += latest.rxErrors;
            summary.totalTxErrors += latest.txErrors;
        });
        
        return summary;
    }
    
    // Clear all collected data
    clearData() {
        this.statistics.clear();
        
        if (this.chart) {
            this.chart.data.labels = [];
            this.chart.data.datasets = [];
            this.chart.update();
        }
        
        this.dispatchEvent(new Event('cleared'));
    }
}