/**
 * The "This year / Last year" legend has to match the bars it labels.
 *
 * ECharts takes a legend swatch from the *series* style. Colouring each data
 * point instead leaves the series with no style, so the legend falls back to
 * the default palette — blue and green — above bars that were two shades of
 * one colour. Nothing in the option is invalid, so only a person looking at it
 * would ever notice.
 *
 * Mirrors makeGroupedBar in CalendarPeriodStats.
 */
const makeGroupedBar = (labels, curData, lyData, colorA = '#3b82f6') => ({
  legend: { data: ['This year', 'Last year'] },
  xAxis: { type: 'category', data: labels },
  series: [
    { name: 'This year', type: 'bar', itemStyle: { color: colorA, borderRadius: [3, 3, 0, 0] }, data: curData },
    { name: 'Last year', type: 'bar', itemStyle: { color: `${colorA}66`, borderRadius: [3, 3, 0, 0] }, data: lyData },
  ],
});

describe('the grouped year-on-year bar', () => {
  const opt = makeGroupedBar(['w1', 'w2'], [10, 12], [8, 14]);

  test('every series carries its own colour, so the legend can read it', () => {
    opt.series.forEach((s) => {
      expect(s.itemStyle).toBeTruthy();
      expect(typeof s.itemStyle.color).toBe('string');
    });
  });

  test('the legend entries are exactly the series names', () => {
    expect(opt.legend.data).toEqual(opt.series.map((s) => s.name));
  });

  test('last year is the same hue, just faded — not a different colour', () => {
    const [thisYear, lastYear] = opt.series.map((s) => s.itemStyle.color);
    expect(lastYear.startsWith(thisYear)).toBe(true);
    expect(lastYear).toHaveLength(thisYear.length + 2);
  });

  test('data points are plain numbers, carrying no styling of their own', () => {
    opt.series.forEach((s) => {
      s.data.forEach((d) => expect(typeof d).toBe('number'));
    });
  });

  test('a custom colour flows through to both series', () => {
    const green = makeGroupedBar(['w1'], [1], [2], '#22c55e');
    expect(green.series[0].itemStyle.color).toBe('#22c55e');
    expect(green.series[1].itemStyle.color).toBe('#22c55e66');
  });
});
