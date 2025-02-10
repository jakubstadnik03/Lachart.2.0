import React from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import regression from "regression";

// Registrace Chart.js komponent
ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

const LactateCurveGraph = ({ mockData }) => {
  if (!mockData || !mockData.results) return null;

  // Extrahování dat
  const dataPoints = mockData.results.map((d) => [d.power, d.lactate]);

  // Výpočet polynomu třetího stupně
  const regressionResult = regression.polynomial(dataPoints, { order: 3 });

  // Generování hladké křivky na základě modelu
  const xValues = Array.from({ length: 100 }, (_, i) =>
    Math.min(...dataPoints.map((d) => d[0])) +
    (i * (Math.max(...dataPoints.map((d) => d[0])) - Math.min(...dataPoints.map((d) => d[0]))) / 99)
  );
  const yValues = xValues.map((x) => regressionResult.predict(x)[1]);

  // Definování barev bodů
  const pointColors = [
    "black", // Data points
    "#d9f99d", // Log-log
    "#34d399", // OBLA 2.0
    "#fb923c", // OBLA 2.5
    "#60a5fa", // OBLA 3.0
    "#f472b6", // OBLA 3.5
    "#22d3ee", // Bsin + 0.5
    "#e879f9", // Bsin + 1.0
    "#bef264", // Bsin + 1.5
    "#a3e635", // LTP1
    "#fde047", // LTP2
    "#a8a29e", // LTRatio
  ];

  const chartData = {
    labels: xValues,
    datasets: [
      {
        label: "Lactate Curve",
        data: yValues,
        borderColor: "blue",
        borderWidth: 2,
        tension: 0.4, // Vytvoří hladší křivku
        fill: false,
      },
      {
        label: "Data Points",
        data: mockData.results.map((d) => ({ x: d.power, y: d.lactate })),
        borderColor: "black",
        backgroundColor: pointColors[0],
        pointRadius: 5,
        pointHoverRadius: 7,
        type: "scatter",
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "right",
        labels: {
          color: "#000", // Barva textu legendy
        },
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            return `${context.dataset.label}: ${context.raw.x} W, ${context.raw.y} mmol/L`;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Power (W)",
          color: "#000",
          font: { size: 14, weight: "bold" },
        },
        ticks: { color: "#000" },
        grid: { color: "#e5e7eb" },
      },
      y: {
        title: {
          display: true,
          text: "Lactate (mmol/L)",
          color: "#000",
          font: { size: 14, weight: "bold" },
        },
        ticks: { color: "#000" },
        grid: { color: "#e5e7eb" },
      },
    },
  };

  return <Line data={chartData} options={chartOptions} />;
};

export default LactateCurveGraph;
