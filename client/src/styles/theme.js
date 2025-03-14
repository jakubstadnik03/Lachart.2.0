// Centrální definice barev a stylů
export const COLORS = {
  primary: {
    main: '#2196F3',
    light: 'rgba(33, 150, 243, 0.1)',
    dark: '#1976D2'
  },
  zones: {
    'Measured data': '#000000',
    'Log-log': '#52525b',
    'OBLA 2.0': '#86efac',
    'OBLA 2.5': '#fdba74',
    'OBLA 3.0': '#818cf8',
    'OBLA 3.5': '#fda4af',
    'Bsln + 0.5': '#0d9488',
    'Bsln + 1.0': '#c026d3',
    'Bsln + 1.5': '#99f6e4',
    'LTP1': '#bef264',
    'LTP2': '#fcd34d',
    'LTRatio': '#94a3b8'
  },
  chart: {
    grid: 'rgba(0, 0, 0, 0.15)',
    tooltip: {
      background: 'rgba(255, 255, 255, 0.9)',
      border: '#ddd',
      text: '#000'
    }
  }
};

export const CHART_STYLES = {
  point: {
    radius: 6,
    hoverRadius: 8,
    borderWidth: 2
  },
  line: {
    tension: 0.4,
    borderWidth: 2
  },
  font: {
    family: 'Inter, system-ui, sans-serif',
    size: 12
  }
};

export const CHART_OPTIONS = {
  base: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 15,
          font: CHART_STYLES.font
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: COLORS.chart.grid,
          borderDash: [4, 4]
        }
      },
      x: {
        grid: {
          color: COLORS.chart.grid,
          borderDash: [4, 4]
        }
      }
    }
  }
}; 