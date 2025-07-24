import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  AlertTitle,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Refresh, Warning, Error, CheckCircle, Info } from '@mui/icons-material';

interface MetricsData {
  memory: {
    current: number;
    peak: number;
    utilization: number;
    trend: Array<{ timestamp: number; value: number }>;
  };
  cpu: {
    current: number;
    average: number;
    peak: number;
    trend: Array<{ timestamp: number; value: number }>;
  };
  network: {
    requestCount: number;
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
  };
  cache: {
    hitRate: number;
    size: number;
    keyCount: number;
    avgAccessTime: number;
  };
  io: {
    operationsPerSecond: number;
    averageLatency: number;
    errorRate: number;
    throughput: number;
  };
}

interface Alert {
  id: string;
  type: 'memory' | 'cpu' | 'network' | 'cache' | 'io';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  resolved: boolean;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export const PerformanceDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [currentTab, setCurrentTab] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [reportDialog, setReportDialog] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Mock WebSocket connection for real-time updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let interval: NodeJS.Timeout | null = null;

    if (isMonitoring) {
      // Try to connect to WebSocket for real-time updates
      try {
        ws = new WebSocket('ws://localhost:3233/performance');
        
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          if (data.type === 'metrics') {
            setMetrics(data.payload);
            setLastUpdate(new Date());
          } else if (data.type === 'alert') {
            setAlerts(prev => [data.payload, ...prev].slice(0, 50)); // Keep last 50 alerts
          }
        };

        ws.onerror = () => {
          console.warn('WebSocket connection failed, falling back to polling');
          startPolling();
        };
      } catch (error) {
        console.warn('WebSocket not available, using polling');
        startPolling();
      }
    }

    function startPolling() {
      if (autoRefresh && isMonitoring) {
        interval = setInterval(fetchMetrics, 5000); // Poll every 5 seconds
        fetchMetrics(); // Initial fetch
      }
    }

    return () => {
      if (ws) {
        ws.close();
      }
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isMonitoring, autoRefresh]);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/performance/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/performance/alerts');
      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  };

  const generateReport = async () => {
    try {
      const response = await fetch('/api/performance/report', { method: 'POST' });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `performance-report-${Date.now()}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      default: return 'success';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <Error />;
      case 'high': return <Warning />;
      case 'medium': return <Info />;
      default: return <CheckCircle />;
    }
  };

  const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (!metrics) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Typography variant="h6">Loading performance metrics...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Performance Dashboard
        </Typography>
        <Box display="flex" gap={2} alignItems="center">
          <Typography variant="body2" color="textSecondary">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
            }
            label="Auto-refresh"
          />
          <FormControlLabel
            control={
              <Switch
                checked={isMonitoring}
                onChange={(e) => setIsMonitoring(e.target.checked)}
              />
            }
            label="Monitoring"
          />
          <Button
            startIcon={<Refresh />}
            onClick={fetchMetrics}
            variant="outlined"
          >
            Refresh
          </Button>
          <Button
            onClick={() => setReportDialog(true)}
            variant="contained"
          >
            Generate Report
          </Button>
        </Box>
      </Box>

      {/* Active Alerts */}
      {alerts.filter(alert => !alert.resolved).length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Active Performance Alerts</AlertTitle>
          {alerts.filter(alert => !alert.resolved).slice(0, 3).map(alert => (
            <Box key={alert.id} display="flex" alignItems="center" gap={1} mt={1}>
              {getSeverityIcon(alert.severity)}
              <Typography variant="body2">{alert.message}</Typography>
              <Chip
                label={alert.severity}
                color={getSeverityColor(alert.severity) as any}
                size="small"
              />
            </Box>
          ))}
        </Alert>
      )}

      {/* Overview Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Memory Usage
              </Typography>
              <Typography variant="h5" component="div">
                {metrics.memory.utilization.toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={metrics.memory.utilization}
                color={metrics.memory.utilization > 85 ? 'error' : metrics.memory.utilization > 70 ? 'warning' : 'primary'}
                sx={{ mt: 1 }}
              />
              <Typography variant="body2" color="textSecondary" mt={1}>
                {formatBytes(metrics.memory.current)} / {formatBytes(metrics.memory.peak)} peak
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                CPU Usage
              </Typography>
              <Typography variant="h5" component="div">
                {metrics.cpu.current.toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={metrics.cpu.current}
                color={metrics.cpu.current > 80 ? 'error' : metrics.cpu.current > 60 ? 'warning' : 'primary'}
                sx={{ mt: 1 }}
              />
              <Typography variant="body2" color="textSecondary" mt={1}>
                Avg: {metrics.cpu.average.toFixed(1)}% | Peak: {metrics.cpu.peak.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Network
              </Typography>
              <Typography variant="h5" component="div">
                {formatDuration(metrics.network.averageResponseTime)}
              </Typography>
              <Box mt={1}>
                <Typography variant="body2" color="textSecondary">
                  {metrics.network.requestCount} requests
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Error rate: {(metrics.network.errorRate * 100).toFixed(2)}%
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Cache Performance
              </Typography>
              <Typography variant="h5" component="div">
                {(metrics.cache.hitRate * 100).toFixed(1)}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={metrics.cache.hitRate * 100}
                color={metrics.cache.hitRate < 0.6 ? 'error' : metrics.cache.hitRate < 0.8 ? 'warning' : 'success'}
                sx={{ mt: 1 }}
              />
              <Typography variant="body2" color="textSecondary" mt={1}>
                {formatBytes(metrics.cache.size)} | {metrics.cache.keyCount} keys
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Detailed Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)}>
          <Tab label="Memory & CPU" />
          <Tab label="Network" />
          <Tab label="Cache" />
          <Tab label="I/O Operations" />
          <Tab label="Alerts" />
        </Tabs>

        <TabPanel value={currentTab} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Memory Usage Trend</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={metrics.memory.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                  />
                  <YAxis tickFormatter={(value) => formatBytes(value)} />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                    formatter={(value: number) => [formatBytes(value), 'Memory']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>CPU Usage Trend</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics.cpu.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                  />
                  <YAxis domain={[0, 100]} />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                    formatter={(value: number) => [`${value.toFixed(2)}%`, 'CPU']}
                  />
                  <Line type="monotone" dataKey="value" stroke="#82ca9d" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Typography variant="h6" gutterBottom>Network Performance</Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Metric</TableCell>
                      <TableCell>Current</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Request Count</TableCell>
                      <TableCell>{metrics.network.requestCount}</TableCell>
                      <TableCell>
                        <Chip 
                          label={metrics.network.requestCount > 1000 ? 'High' : 'Normal'} 
                          color={metrics.network.requestCount > 1000 ? 'warning' : 'success'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Average Response Time</TableCell>
                      <TableCell>{formatDuration(metrics.network.averageResponseTime)}</TableCell>
                      <TableCell>
                        <Chip 
                          label={metrics.network.averageResponseTime > 2000 ? 'Slow' : 'Good'} 
                          color={metrics.network.averageResponseTime > 2000 ? 'error' : 'success'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Error Rate</TableCell>
                      <TableCell>{(metrics.network.errorRate * 100).toFixed(2)}%</TableCell>
                      <TableCell>
                        <Chip 
                          label={metrics.network.errorRate > 0.05 ? 'High' : 'Normal'} 
                          color={metrics.network.errorRate > 0.05 ? 'error' : 'success'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Throughput</TableCell>
                      <TableCell>{formatBytes(metrics.network.throughput)}/s</TableCell>
                      <TableCell>
                        <Chip label="Active" color="primary" size="small" />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Cache Metrics</Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell>Hit Rate</TableCell>
                      <TableCell>{(metrics.cache.hitRate * 100).toFixed(2)}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Cache Size</TableCell>
                      <TableCell>{formatBytes(metrics.cache.size)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Key Count</TableCell>
                      <TableCell>{metrics.cache.keyCount}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Average Access Time</TableCell>
                      <TableCell>{formatDuration(metrics.cache.avgAccessTime)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Cache Health</Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <Alert 
                  severity={metrics.cache.hitRate > 0.8 ? 'success' : metrics.cache.hitRate > 0.6 ? 'warning' : 'error'}
                >
                  Hit rate is {metrics.cache.hitRate > 0.8 ? 'excellent' : metrics.cache.hitRate > 0.6 ? 'acceptable' : 'poor'}
                </Alert>
                <Alert 
                  severity={metrics.cache.avgAccessTime < 10 ? 'success' : metrics.cache.avgAccessTime < 50 ? 'warning' : 'error'}
                >
                  Access time is {metrics.cache.avgAccessTime < 10 ? 'fast' : metrics.cache.avgAccessTime < 50 ? 'acceptable' : 'slow'}
                </Alert>
              </Box>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={currentTab} index={3}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>I/O Performance</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="textSecondary" gutterBottom>
                        Operations/sec
                      </Typography>
                      <Typography variant="h6">
                        {metrics.io.operationsPerSecond.toFixed(1)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="textSecondary" gutterBottom>
                        Average Latency
                      </Typography>
                      <Typography variant="h6">
                        {formatDuration(metrics.io.averageLatency)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="textSecondary" gutterBottom>
                        Error Rate
                      </Typography>
                      <Typography variant="h6">
                        {(metrics.io.errorRate * 100).toFixed(2)}%
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="textSecondary" gutterBottom>
                        Throughput
                      </Typography>
                      <Typography variant="h6">
                        {formatBytes(metrics.io.throughput)}/s
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={currentTab} index={4}>
          <Typography variant="h6" gutterBottom>Recent Alerts</Typography>
          {alerts.length === 0 ? (
            <Alert severity="success">No alerts - system is running smoothly</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {alerts.slice(0, 20).map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        {new Date(alert.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Chip label={alert.type} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          icon={getSeverityIcon(alert.severity)}
                          label={alert.severity} 
                          color={getSeverityColor(alert.severity) as any}
                          size="small" 
                        />
                      </TableCell>
                      <TableCell>{alert.message}</TableCell>
                      <TableCell>
                        <Chip 
                          label={alert.resolved ? 'Resolved' : 'Active'} 
                          color={alert.resolved ? 'success' : 'warning'}
                          size="small" 
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>
      </Paper>

      {/* Report Generation Dialog */}
      <Dialog open={reportDialog} onClose={() => setReportDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Performance Report</DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            This will generate a comprehensive performance report including:
          </Typography>
          <ul>
            <li>Memory usage analysis and trends</li>
            <li>CPU utilization patterns and bottlenecks</li>
            <li>Network performance metrics</li>
            <li>Cache hit rates and efficiency</li>
            <li>I/O operation analysis</li>
            <li>Performance recommendations</li>
          </ul>
          <Typography variant="body2" color="textSecondary" mt={2}>
            The report will be downloaded as a JSON file.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportDialog(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              generateReport();
              setReportDialog(false);
            }} 
            variant="contained"
          >
            Generate Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};