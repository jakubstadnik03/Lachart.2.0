/**
 * Buying LaChart inside the iOS app — App Store subscriptions via RevenueCat.
 *
 * The web keeps Stripe. In the native app a purchase goes through StoreKit,
 * RevenueCat sees it, and RevenueCat's webhook
 * (POST /api/subscription/revenuecat/webhook) writes the Subscription row that
 * makes user.isPremium true. So the client never decides who is premium: it
 * buys, then waits for the server to agree.
 *
 * The one thing that links a store purchase to a LaChart account is the
 * RevenueCat app user id, which is set to the LaChart user id before anything
 * is bought. A purchase made under an anonymous id is rejected by the webhook
 * (server/utils/revenueCatEvent.js), so `ensureStoreUser` runs first, always.
 *
 * Without REACT_APP_REVENUECAT_IOS_KEY in the build, `storePurchasesAvailable`
 * is false and every caller falls back to sending people to lachart.net, as
 * the app did before — a build made before App Store Connect is set up still
 * works.
 */
import { Capacitor } from '@capacitor/core';
import api from '../services/api';

/** App Store product ids. Must match App Store Connect and server DEFAULT_PLAN_MAP. */
export const STORE_PRODUCT_IDS = {
  pro: 'net.lachart.athlete.monthly',
  coach: 'net.lachart.coach.monthly',
};

const IOS_API_KEY = process.env.REACT_APP_REVENUECAT_IOS_KEY || '';

export function storePurchasesAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios' && Boolean(IOS_API_KEY);
}

let pluginPromise = null;
let configuredFor = null; // the app user id RevenueCat is currently identified as
const offerCache = new Map(); // `${userId}:${productId}` → Promise of the offer

// A Capacitor plugin is a Proxy that answers every property — `then`
// included — with a native call. Resolve a promise with it and the promise
// takes it for a thenable, calls `Purchases.then(...)` and waits for ever,
// with no error and nothing sent to StoreKit. That is exactly how build 146
// sat on "Opening the App Store…". So the plugin only ever travels inside a
// plain box, and nothing here returns it bare from an async function.
function loadPlugin() {
  if (!pluginPromise) {
    pluginPromise = import('@revenuecat/purchases-capacitor').then((m) => ({ plugin: m.Purchases }));
  }
  return pluginPromise;
}

/**
 * Identify RevenueCat as this LaChart user, configuring the SDK on first use.
 * Safe to call repeatedly; a different user switches with logIn.
 */
let identifyChain = Promise.resolve();

export function ensureStoreUser(userId) {
  if (!storePurchasesAvailable()) return Promise.reject(new Error('In-app purchases are not available'));
  const id = userId ? String(userId) : '';
  if (!id) return Promise.reject(new Error('Sign in before buying'));
  // One at a time: AuthProvider and every lock on the page ask at once, and
  // configure must run exactly once.
  const run = identifyChain.then(async () => {
    const box = await loadPlugin();
    const Purchases = box.plugin;
    if (configuredFor === id) return box;
    if (configuredFor === null) {
      await Purchases.configure({ apiKey: IOS_API_KEY, appUserID: id });
    } else {
      await Purchases.logIn({ appUserID: id });
    }
    configuredFor = id;
    return box;
  });
  identifyChain = run.catch(() => {});
  return run;
}

/** On logout, so the next person on this phone does not buy into the last account. */
export function resetStoreUser() {
  const run = identifyChain.then(async () => {
    if (configuredFor === null) return;
    try {
      const { plugin: Purchases } = await loadPlugin();
      await Purchases.logOut();
    } catch {
      // logOut rejects for an anonymous user; there is nothing to undo then.
    }
    // Leave the SDK configured; the next ensureStoreUser logs the new user in.
    configuredFor = 'logged-out';
    offerCache.clear();
  });
  identifyChain = run.catch(() => {});
  return run;
}

const productIdFor = (plan) => STORE_PRODUCT_IDS[plan === 'coach' ? 'coach' : 'pro'];

/**
 * The App Store product for a plan, and whether this Apple ID still gets the
 * free trial. `trialEligible` is false only when Apple says so — on "unknown"
 * the App Store sheet itself shows the real terms.
 */
export function getStoreOffer(plan, userId) {
  const key = `${userId}:${productIdFor(plan)}`;
  if (!offerCache.has(key)) {
    // Every lock on a page asks; the App Store is asked once.
    const pending = loadStoreOffer(plan, userId).catch((err) => {
      offerCache.delete(key);
      throw err;
    });
    offerCache.set(key, pending);
  }
  return offerCache.get(key);
}

async function loadStoreOffer(plan, userId) {
  const { plugin: Purchases } = await ensureStoreUser(userId);
  const productId = productIdFor(plan);
  const { products } = await Purchases.getProducts({ productIdentifiers: [productId] });
  const product = (products || []).find((p) => p.identifier === productId) || null;
  if (!product) throw new Error(`App Store product ${productId} not found`);

  let trialEligible = true;
  try {
    const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: [productId] });
    // INTRO_ELIGIBILITY_STATUS_INELIGIBLE === 1
    if (eligibility?.[productId]?.status === 1) trialEligible = false;
  } catch {
    // Not knowing is not a reason to hide the offer.
  }
  return { product, priceString: product.priceString, trialEligible: trialEligible && Boolean(product.introPrice) };
}

const isCancelled = (err) => err?.userCancelled === true || String(err?.code) === '1';

/**
 * Show the App Store sheet for a plan.
 * @returns {Promise<'purchased'|'cancelled'>} — throws on a real failure.
 */
export async function purchasePlan(plan, userId, offer = null) {
  const { plugin: Purchases } = await ensureStoreUser(userId);
  const product = offer?.product || (await getStoreOffer(plan, userId)).product;
  try {
    await Purchases.purchaseStoreProduct({ product });
    offerCache.clear(); // the trial is used up now
    return 'purchased';
  } catch (err) {
    if (isCancelled(err)) return 'cancelled';
    throw err;
  }
}

/**
 * Restore Purchases, required by Apple. Re-links this Apple ID's subscription
 * to the signed-in LaChart account and, through RevenueCat, re-sends it to
 * our webhook.
 * @returns {Promise<boolean>} whether an active LaChart subscription was found
 */
export async function restoreStorePurchases(userId) {
  const { plugin: Purchases } = await ensureStoreUser(userId);
  const { customerInfo } = await Purchases.restorePurchases();
  return Object.keys(customerInfo?.entitlements?.active || {}).length > 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Re-read the profile until the server says premium (the webhook usually
 * lands within seconds), pushing each fresh copy to AuthProvider through the
 * existing `userUpdated` event so every lock re-renders.
 * @returns {Promise<boolean>} whether premium arrived before the timeout
 */
export async function waitForServerPremium({ timeoutMs = 45000, intervalMs = 2500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { data } = await api.get('/user/profile', { noCache: true });
      if (data) {
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: data }));
        if (data.isPremium === true) return true;
      }
    } catch {
      // A blip while waiting is not a failure of the purchase.
    }
    await sleep(intervalMs);
  }
  return false;
}
