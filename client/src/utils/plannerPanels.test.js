import { plannerPanelsDefault, getPlannerPanelsPrefs, setPlannerPanelsPrefs } from './uiPrefs';

describe('planner side panels', () => {
  it('open only when the seven days keep their room', () => {
    expect(plannerPanelsDefault(1280)).toEqual({ library: false, progress: false });
    expect(plannerPanelsDefault(1500)).toEqual({ library: true, progress: false });
    expect(plannerPanelsDefault(1920)).toEqual({ library: true, progress: true });
    expect(plannerPanelsDefault(undefined)).toEqual({ library: false, progress: false });
  });

  it('a choice, once made, is what comes back', () => {
    localStorage.removeItem('lachart_planner_panels');
    expect(getPlannerPanelsPrefs()).toBeNull();
    setPlannerPanelsPrefs({ library: false, progress: true });
    expect(getPlannerPanelsPrefs()).toEqual({ library: false, progress: true });
    localStorage.setItem('lachart_planner_panels', 'not json');
    expect(getPlannerPanelsPrefs()).toBeNull();
  });
});
