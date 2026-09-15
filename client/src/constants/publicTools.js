/**
 * The free calculators, once.
 *
 * The sidebar listed five of them with four different icon files; the tools
 * page listed eight with heroicons. Both read this now, so a new calculator
 * appears in both places with the same name and the same icon.
 */
import {
  AdjustmentsHorizontalIcon, ArrowTrendingUpIcon, BeakerIcon, BoltIcon, BookOpenIcon,
  ChartBarIcon, DevicePhoneMobileIcon, HeartIcon, InformationCircleIcon, ScaleIcon, SunIcon, TrophyIcon,
} from '@heroicons/react/24/outline';

export const PUBLIC_TOOLS = [
  { id: 'lactate', path: '/lactate-curve-calculator',  Icon: BeakerIcon,                label: 'Lactate Test',    menu: 'Lactate Curve Calculator', desc: 'LT1, LT2, OBLA & training zones from blood lactate data' },
  { id: 'ftp',     path: '/ftp-calculator',            Icon: BoltIcon,                  label: 'FTP & Power',     menu: 'FTP Calculator',           desc: 'Functional Threshold Power, W/kg & Coggan zones' },
  { id: 'vo2max',  path: '/vo2max-calculator',         Icon: HeartIcon,                 label: 'VO2max',          menu: 'VO2max Calculator',        desc: 'Maximal oxygen uptake from 5-min all-out effort' },
  { id: 'race',    path: '/race-predictor',            Icon: TrophyIcon,                label: 'Race Predictor',  menu: 'Race Predictor',           desc: 'Predict 5K–marathon times via Riegel model' },
  { id: 'tss',     path: '/tss-calculator',            Icon: ChartBarIcon,              label: 'Training Load',   menu: 'TSS Calculator',           desc: 'TSS, Intensity Factor & session stress score' },
  { id: 'zones',   path: '/training-zones-calculator', Icon: AdjustmentsHorizontalIcon, label: 'Training Zones',  menu: 'Training Zones Calculator', desc: 'Power, HR & run pace zones from threshold values' },
  { id: 'env',     path: '/heat-altitude-calculator',  Icon: SunIcon,                   label: 'Heat & Altitude', menu: 'Heat & Altitude',          desc: 'Performance adjustments for conditions' },
  { id: 'weight',  path: '/weight-calculator',         Icon: ScaleIcon,                 label: 'Weight & Power',  menu: 'Weight & Power',           desc: 'Impact of body weight change on performance' },
];

/** Its own search landing page; on screen it is the lactate calculator. */
export const ZONE2_TOOL = { id: 'zone2', path: '/zone2-calculator', Icon: ArrowTrendingUpIcon, menu: 'Zone 2 Helper' };

export const PUBLIC_LINKS = {
  guide: { path: '/lactate-guide', Icon: BookOpenIcon, menu: 'Lactate Guide' },
  about: { path: '/about', Icon: InformationCircleIcon, menu: 'About LaChart' },
  app: { path: 'https://apps.apple.com/cz/app/lachart/id6764768876?l=cs', Icon: DevicePhoneMobileIcon, menu: 'iPhone app', external: true, badge: 'New' },
};
