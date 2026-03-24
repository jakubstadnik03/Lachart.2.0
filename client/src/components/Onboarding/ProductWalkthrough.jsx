import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Joyride, { ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const COACH_LIKE = ['coach', 'tester', 'testing'];
const WALKTHROUGH_DISMISSED_KEY = 'lachart:walkthroughDismissed';

async function persistWalkthroughDone() {
  try {
    const res = await api.put('/user/edit-profile', { onboarding: { walkthroughDone: true } });
    if (res.data) {
      window.dispatchEvent(new CustomEvent('userUpdated', { detail: res.data }));
    }
  } catch (e) {
    console.error('Tour: could not save completion', e);
  }
}

function stepContent(title, body) {
  return (
    <div className="text-left max-w-sm">
      {title ? <p className="font-bold text-gray-900 mb-2">{title}</p> : null}
      <p className="text-sm text-gray-700 leading-relaxed">{body}</p>
    </div>
  );
}

/**
 * Interactive app tour (react-joyride). English copy. Tooltips point at real UI (`data-tour` targets).
 * Overlay is disabled so the page is not dimmed and stays fully clickable during the tour.
 * Completion: user.onboarding.walkthroughDone (server).
 */
const ProductWalkthrough = ({ open, onClose, userRole }) => {
  const navigate = useNavigate();
  const roleLower = String(userRole || '').toLowerCase();
  const isCoachLike = COACH_LIKE.includes(roleLower);

  const steps = useMemo(() => {
    if (isCoachLike) {
      return [
        {
          target: 'body',
          placement: 'center',
          disableBeacon: true,
          content: stepContent(
            'Welcome, coach',
            'This hands-on tour walks through inviting athletes, recording a lactate test, and sharing results (email / PDF). Use Next, or Skip tour anytime.'
          ),
        },
        {
          target: '[data-tour="tour-add-athlete"]',
          placement: 'bottom',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Add an athlete',
            'Use Add New Athlete to create a profile, or Add Existing Athlete to send an email invitation. The athlete must accept before you see their data.'
          ),
        },
        {
          target: '[data-tour="tour-athletes-sidebar"]',
          placement: 'right',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Select an athlete',
            'Click an athlete here so Dashboard, Training, and Testing load their data. Strava is connected by each athlete in their own Settings → Integrations.'
          ),
        },
        {
          target: '[data-tour="tour-new-testing"]',
          placement: 'left',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'New testing',
            'Turn this on (or press Next) to open the create-test workspace. You will enter each stage’s power or pace, HR, and lactate, then save.'
          ),
        },
        {
          target: '[data-tour="tour-create-test-form"]',
          placement: 'top',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Create a test',
            'Left: live lactate curve. Right: form and measurement grid. Fill details first, then add one row per protocol stage.'
          ),
        },
        {
          target: '[data-tour="tour-live-curve-preview"]',
          placement: 'bottom',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Live curve',
            'The graph updates as you enter valid rows (power or pace + lactate). Use it to spot odd points before saving.'
          ),
        },
        {
          target: '[data-tour="tour-test-details"]',
          placement: 'bottom',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Test details',
            'Set title, sport, baseline lactate (required), date, and weight. For run/swim you can switch pace vs speed and units here.'
          ),
        },
        {
          target: '[data-tour="tour-measurements-table"]',
          placement: 'top',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Measurement rows',
            'Each row is one stage after warm-up: power or pace, heart rate, lactate (and optional RPE, glucose, VO₂ if you enable columns).'
          ),
        },
        {
          target: '[data-tour="tour-add-interval"]',
          placement: 'top',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Add Interval',
            'Add a row for every new workload step. Remove mistakes with the trash icon in the last column.'
          ),
        },
        {
          target: '[data-tour="tour-save-test"]',
          placement: 'top',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Save Test',
            'When the protocol is complete, save. The test appears under Previous tests; open it to see thresholds, email the report, or download PDF.'
          ),
        },
        {
          target: '[data-tour="tour-test-list"]',
          placement: 'top',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Previous tests',
            'Open a saved test to view the lactate curve and thresholds.'
          ),
        },
        {
          target: 'body',
          placement: 'center',
          disableBeacon: true,
          content: stepContent(
            'Share with your athlete',
            'On the curve view, use Send results to email or Download PDF so your athlete gets the report. You can try it on any saved test.'
          ),
        },
        {
          target: '[data-tour="tour-lactate-share"]',
          placement: 'left',
          disableBeacon: true,
          spotlightClicks: true,
          content: stepContent(
            'Email & PDF',
            'These actions use the current curve on screen. If you do not see them, open a test from the list first, then restart this step from Settings.'
          ),
        },
        {
          target: 'body',
          placement: 'center',
          disableBeacon: true,
          content: stepContent(
            'You are set',
            'Explore Dashboard and Training for load and calendar. Re-run this tour anytime from Settings → Profile → App walkthrough.'
          ),
        },
      ];
    }

    return [
      {
        target: 'body',
        placement: 'center',
        disableBeacon: true,
        content: stepContent(
          'Welcome to LaChart',
            'We will connect Strava (optional but recommended), then use Testing for a demo or new test, and show how to share results. Follow the highlights and click the real buttons where indicated.'
        ),
      },
      {
        target: '[data-tour="tour-strava-card"]',
        placement: 'left',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'Connect Strava',
          'Click Connect to authorize LaChart. Turn on auto-sync if you want new activities imported. You can press Next if you prefer to skip for now.'
        ),
      },
      {
        target: '[data-tour="tour-new-testing"]',
        placement: 'left',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'New testing',
          'Turn this on (or press Next) to create a lactate step test. You can also skip and open an older test from the list below later.'
        ),
      },
      {
        target: '[data-tour="tour-create-test-form"]',
        placement: 'top',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'Create a test',
          'Left: live curve preview. Right: form and table. Work top to bottom: details → rows → Save Test.'
        ),
      },
      {
        target: '[data-tour="tour-live-curve-preview"]',
        placement: 'bottom',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'Live curve',
          'The chart builds as you add stages with power (or pace) and lactate values.'
        ),
      },
      {
        target: '[data-tour="tour-test-details"]',
        placement: 'bottom',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'Test details',
          'Title, sport, and baseline lactate are required. Add date and weight for your records.'
        ),
      },
      {
        target: '[data-tour="tour-measurements-table"]',
        placement: 'top',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'Stages table',
          'Enter one row per step: intensity (W or pace), HR, blood lactate. Optional: RPE, glucose, VO₂ columns.'
        ),
      },
      {
        target: '[data-tour="tour-add-interval"]',
        placement: 'top',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'Add Interval',
          'Tap here for each new stage. Delete a row with the bin icon if you need to correct the protocol.'
        ),
      },
      {
        target: '[data-tour="tour-save-test"]',
        placement: 'top',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'Save Test',
          'Saves to your account and lists the test below. Then you can share by email or PDF from the curve view.'
        ),
      },
      {
        target: '[data-tour="tour-test-list"]',
        placement: 'top',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'Previous tests',
          'Select a test here to open the lactate curve, zones, and export options.'
        ),
      },
      {
        target: 'body',
        placement: 'center',
        disableBeacon: true,
        content: stepContent(
          'Share results',
          'With a test open, use Send results to email or Download PDF on the curve card. That is how you or your coach archive and share the report.'
        ),
      },
      {
        target: '[data-tour="tour-lactate-share"]',
        placement: 'left',
        disableBeacon: true,
        spotlightClicks: true,
        content: stepContent(
          'Email & PDF',
          'Try these when a test is displayed. If this step is empty, open a test from the list above, or press Next to finish.'
        ),
      },
      {
        target: 'body',
        placement: 'center',
        disableBeacon: true,
        content: stepContent(
          'Done',
          'Use Dashboard for your calendar and Training for planning. Run this walkthrough again from Settings → Profile whenever you like.'
        ),
      },
    ];
  }, [isCoachLike]);

  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const persistLocalDismiss = useCallback(() => {
    try {
      localStorage.setItem(WALKTHROUGH_DISMISSED_KEY, 'true');
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setRun(true);
    } else {
      setRun(false);
      setStepIndex(0);
    }
  }, [open, userRole]);

  const afterClose = useCallback(async () => {
    // Make sure it never auto-opens again even if API persistence fails.
    persistLocalDismiss();
    await persistWalkthroughDone();
    onClose();
  }, [onClose, persistLocalDismiss]);

  const navigateForStepIndex = useCallback(
    (index) => {
      if (isCoachLike) {
        if (index === 1) navigate('/athletes');
        return;
      }
      if (index === 1) navigate('/settings?tab=integrations');
      else if (index === 2) navigate('/testing');
    },
    [navigate, isCoachLike]
  );

  const handleCallback = useCallback(
    (data) => {
      const { action, index, status, type } = data;

      if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
        setRun(false);
        setStepIndex(0);
        afterClose();
        return;
      }

      if (type === EVENTS.TARGET_NOT_FOUND) {
        if (index >= steps.length - 1) return;
        setStepIndex(index + 1);
        return;
      }

      if (type === EVENTS.STEP_AFTER) {
        // With controlled `stepIndex`, Joyride does not set status to FINISHED on X / Esc — only STEP_AFTER + CLOSE.
        if (action === ACTIONS.CLOSE) {
          setRun(false);
          setStepIndex(0);
          afterClose();
          return;
        }
        if (action === ACTIONS.PREV) {
          setStepIndex(Math.max(0, index - 1));
          return;
        }
        if (action === ACTIONS.NEXT) {
          const next = index + 1;
          // Last step: primary button is "Finish" but Joyride still sends NEXT; controlled mode never reaches FINISHED status here.
          if (next >= steps.length) {
            setRun(false);
            setStepIndex(0);
            afterClose();
            return;
          }

          // Open New testing panel before create-test spotlight steps
          const openNewTestingStep =
            (!isCoachLike && index === 2) || (isCoachLike && index === 3);
          if (openNewTestingStep) {
            window.dispatchEvent(new CustomEvent('lachart:ensureNewTesting'));
            setTimeout(() => setStepIndex(next), 550);
            return;
          }

          const needsNav =
            (!isCoachLike && (index === 0 || index === 1)) ||
            (isCoachLike && (index === 0 || index === 2));

          if (needsNav) {
            if (index === 0) {
              navigateForStepIndex(1);
              setTimeout(() => setStepIndex(1), 450);
              return;
            }
            if (!isCoachLike && index === 1) {
              navigate('/testing');
              setTimeout(() => setStepIndex(2), 450);
              return;
            }
            if (isCoachLike && index === 2) {
              navigate('/testing');
              setTimeout(() => setStepIndex(3), 450);
              return;
            }
          }

          setStepIndex(next);
        }
      }
    },
    [steps.length, afterClose, navigateForStepIndex, isCoachLike, navigate]
  );

  const joyrideStyles = {
    options: {
      zIndex: 100000,
      primaryColor: '#0d9488',
      textColor: '#111827',
      // Unused while disableOverlay is true; kept for consistency if overlay is re-enabled.
      overlayColor: 'transparent',
      arrowColor: '#fff',
    },
    tooltip: {
      borderRadius: 12,
    },
    buttonNext: {
      backgroundColor: '#0d9488',
      fontSize: 14,
    },
    buttonBack: {
      color: '#475569',
      marginRight: 8,
    },
  };

  if (!open && !run) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableScrollParentFix
      disableOverlay
      spotlightClicks
      callback={handleCallback}
      styles={joyrideStyles}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip tour',
      }}
    />
  );
};

export default ProductWalkthrough;
