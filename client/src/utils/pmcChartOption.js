/**
 * The ECharts option for the combined Fitness / Fatigue / Form chart.
 *
 * Pure: series in, option out. Kept apart from the component so the two
 * layouts — a phone that scrolls the page over a full-width plot, and a
 * desktop with axes, a tooltip and a zoom slider — can be checked without
 * mounting anything.
 */

import { PMC_COLORS, pmcDefaultZoomWindow } from './pmcChartAxes';

/** iOS system palette for the chrome; the three series keep their own colours. */
export const PMC_CHROME = {
  label: '#000000',
  secondary: 'rgba(60,60,67,0.6)',
  tertiary: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.14)',
  fill: 'rgba(118,118,128,0.12)',
};
export const PMC_FONT = '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';

const IOS = PMC_CHROME;
const FONT = PMC_FONT;

/**
 * @param {object} args
 * @param {Array}  args.chartSeries  rows of { date, dateLabel?, Fitness, Fatigue, Form, TSS, projected, fitnessProj… }
 * @param {number} args.viewDays     the span the athlete picked
 * @param {boolean} args.isMobile
 * @param {boolean} args.hasProjection  planned rows follow the actual ones
 * @param {{tssMax:number,min:number,max:number}} args.axisDomains
 * @param {number} args.actualCount  rows that are not projected
 */
export function buildPmcChartOption({ chartSeries, viewDays, isMobile, hasProjection, axisDomains, actualCount }) {
  if (!chartSeries?.length) return null;

  const labels = chartSeries.map((d) => {
    if (d.dateLabel) return d.dateLabel;
    const [, m, day] = d.date.split('-');
    return `${day}.${m}.`;
  });

  const todayLabel = actualCount > 0
    ? labels[actualCount - 1]
    : null;

  const defaultWindow = pmcDefaultZoomWindow(viewDays, actualCount || chartSeries.length);
  const zoomStart = chartSeries.length > defaultWindow
    ? Math.round(((chartSeries.length - defaultWindow) / chartSeries.length) * 100)
    : 0;

  // Dots for the three lines, a dashed stroke for their continuation.
  const legendItems = [
    { name: 'Fitness', icon: 'circle' },
    { name: 'Fatigue', icon: 'circle' },
    { name: 'Form', icon: 'circle' },
  ];
  if (hasProjection) {
    legendItems.push({
      name: 'Planned',
      lineStyle: { type: [4, 3], color: IOS.secondary, width: 2 },
      itemStyle: { color: 'transparent', borderWidth: 0 },
    });
  }

  const axisText = { fontSize: 10, color: IOS.tertiary, fontFamily: FONT };
  const lineWidth = isMobile ? 2 : 2.5;
  const projected = (color, data, yAxisIndex) => ({
    name: 'Planned',
    type: 'line',
    yAxisIndex,
    smooth: 0.35,
    symbol: 'none',
    connectNulls: true,
    lineStyle: { color, width: isMobile ? 1.5 : 2, type: [5, 4] },
    itemStyle: { color },
    data,
    z: 0,
  });

  return {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { fontFamily: FONT },
    // Tapping a legend entry hides that line; "Planned" hides all three
    // dashed continuations at once, which is the projection toggle.
    legend: {
      data: legendItems,
      bottom: 0,
      left: 'center',
      itemWidth: 16,
      itemHeight: 8,
      itemGap: isMobile ? 14 : 18,
      textStyle: { fontSize: 11, color: IOS.secondary, fontFamily: FONT },
      inactiveColor: IOS.tertiary,
    },
    // On a phone the numbers live in the headline, so the box would only
    // cover the line it describes; a hairline marks the day instead.
    tooltip: {
      trigger: 'axis',
      showContent: !isMobile,
      confine: true,
      axisPointer: {
        type: isMobile ? 'line' : 'cross',
        lineStyle: { color: IOS.tertiary, width: 1 },
        crossStyle: { color: IOS.tertiary },
        label: { show: !isMobile, fontFamily: FONT },
      },
      backgroundColor: '#fff',
      borderColor: '#e5e7eb',
      textStyle: { fontSize: 12, color: '#111827', fontFamily: FONT },
      formatter(params) {
        if (!Array.isArray(params) || !params[0]) return '';
        const idx = params[0].dataIndex;
        const d = chartSeries[idx];
        if (!d) return '';
        const planned = d.projected ? ' · Planned' : '';
        const v = (a, b) => (d.projected ? b : a);
        let html = `<div style="font-weight:600;margin-bottom:4px">${d.date}${planned}</div>`;
        const fit = v(d.Fitness, d.fitnessProj);
        const fat = v(d.Fatigue, d.fatigueProj);
        const frm = v(d.Form, d.formProj);
        if (fit != null) html += `<div><span style="color:${PMC_COLORS.fitness}">●</span> Fitness: <b>${fit}</b></div>`;
        if (fat != null) html += `<div><span style="color:${PMC_COLORS.fatigue}">●</span> Fatigue: <b>${fat}</b></div>`;
        if (frm != null) html += `<div><span style="color:${PMC_COLORS.form}">●</span> Form: <b>${frm}</b></div>`;
        if (d.TSS > 0) {
          html += `<div style="color:#6b7280;margin-top:2px">${d.projected ? 'Planned' : 'Daily'} TSS: ${d.TSS}</div>`;
        }
        return html;
      },
    },
    // Full width on a phone: the axis numbers sit inside the plot, so the
    // curve gets every pixel the card has.
    grid: isMobile
      ? { left: 4, right: 4, top: 18, bottom: 46, containLabel: false }
      : { left: 48, right: 44, top: 22, bottom: 74, containLabel: false },
    // A phone scrolls the page over the chart and picks the span with the
    // control underneath; a pointer still wheels and drags the slider.
    dataZoom: isMobile ? [] : [
      {
        type: 'inside',
        start: zoomStart,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
      {
        type: 'slider',
        start: zoomStart,
        end: 100,
        height: 18,
        bottom: 26,
        borderColor: 'transparent',
        backgroundColor: IOS.fill,
        fillerColor: 'rgba(94, 101, 144, 0.16)',
        handleStyle: { color: '#fff', borderColor: IOS.separator },
        moveHandleStyle: { color: IOS.tertiary },
        dataBackground: { lineStyle: { color: IOS.tertiary }, areaStyle: { color: 'rgba(60,60,67,0.08)' } },
        textStyle: { fontSize: 10, color: IOS.tertiary, fontFamily: FONT },
      },
    ],
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLabel: { ...axisText, interval: 'auto', hideOverlap: true, margin: 8 },
      axisLine: { lineStyle: { color: IOS.separator } },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: isMobile ? '' : 'TSS/d',
        nameLocation: 'middle',
        nameGap: 34,
        nameTextStyle: { ...axisText },
        min: 0,
        max: axisDomains.tssMax,
        interval: axisDomains.tssMax <= 150 ? 25 : 50,
        position: 'left',
        axisLabel: { ...axisText, inside: isMobile, showMinLabel: !isMobile, showMaxLabel: !isMobile, verticalAlign: 'bottom', margin: isMobile ? 4 : 8 },
        splitLine: { lineStyle: { color: 'rgba(60,60,67,0.08)' } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      {
        type: 'value',
        name: isMobile ? '' : 'Form (TSB)',
        nameLocation: 'middle',
        nameGap: 34,
        nameTextStyle: { ...axisText, color: PMC_COLORS.form },
        min: axisDomains.min,
        max: axisDomains.max,
        interval: axisDomains.max <= 60 ? 15 : 25,
        position: 'right',
        axisLabel: { ...axisText, color: PMC_COLORS.form, inside: isMobile, showMinLabel: !isMobile, showMaxLabel: !isMobile, verticalAlign: 'bottom', margin: isMobile ? 4 : 8 },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      },
    ],
    series: [
      {
        name: 'Fitness',
        type: 'line',
        yAxisIndex: 0,
        smooth: 0.35,
        symbol: 'none',
        connectNulls: false,
        lineStyle: { color: PMC_COLORS.fitness, width: lineWidth },
        itemStyle: { color: PMC_COLORS.fitness },
        areaStyle: { color: 'rgba(37, 99, 235, 0.12)' },
        data: chartSeries.map((d) => (d.projected ? null : d.Fitness)),
        z: 3,
        markLine: todayLabel && hasProjection ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: IOS.tertiary, type: 'dashed' },
          data: [{ xAxis: todayLabel, label: { formatter: 'Today', position: 'end', fontSize: 10, color: IOS.secondary, fontFamily: FONT } }],
        } : undefined,
      },
      {
        name: 'Fatigue',
        type: 'line',
        yAxisIndex: 0,
        smooth: 0.35,
        symbol: 'none',
        connectNulls: false,
        lineStyle: { color: PMC_COLORS.fatigue, width: lineWidth },
        itemStyle: { color: PMC_COLORS.fatigue },
        data: chartSeries.map((d) => (d.projected ? null : d.Fatigue)),
        z: 2,
      },
      {
        name: 'Form',
        type: 'line',
        yAxisIndex: 1,
        smooth: 0.35,
        symbol: 'none',
        connectNulls: false,
        lineStyle: { color: PMC_COLORS.form, width: isMobile ? 1.5 : 2 },
        itemStyle: { color: PMC_COLORS.form },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: IOS.separator, type: 'dashed' },
          data: [{ yAxis: 0 }],
          label: { show: false },
        },
        data: chartSeries.map((d) => (d.projected ? null : d.Form)),
        z: 1,
      },
      ...(hasProjection ? [
        projected(PMC_COLORS.fitness, chartSeries.map((d) => d.fitnessProj ?? null), 0),
        projected(PMC_COLORS.fatigue, chartSeries.map((d) => d.fatigueProj ?? null), 0),
        projected(PMC_COLORS.form, chartSeries.map((d) => d.formProj ?? null), 1),
      ] : []),
    ],
  };
}
