/**
 * The App Store purchase must always be made as the LaChart user — the
 * webhook throws away anything bought under an anonymous RevenueCat id.
 */
const mockPurchases = {};
const setUpStore = () => Object.assign(mockPurchases, {
  configure: jest.fn(async () => {}),
  logIn: jest.fn(async () => ({})),
  logOut: jest.fn(async () => ({})),
  getProducts: jest.fn(async ({ productIdentifiers }) => ({
    products: productIdentifiers.map((id) => ({ identifier: id, priceString: '€6.99', introPrice: { periodNumberOfUnits: 14 } })),
  })),
  checkTrialOrIntroductoryPriceEligibility: jest.fn(async () => ({})),
  purchaseStoreProduct: jest.fn(async () => ({ customerInfo: {} })),
  restorePurchases: jest.fn(async () => ({ customerInfo: { entitlements: { active: {} } } })),
  // Like the real Capacitor proxy, which answers `then` too: awaiting the
  // plugin itself never settles. Build 146 hung on exactly this.
  then: jest.fn(() => {}),
});

jest.mock('@revenuecat/purchases-capacitor', () => ({ Purchases: mockPurchases }));
// Mutable so the availability tests below can stand on another platform.
let mockPlatform = 'ios';
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mockPlatform !== 'web', getPlatform: () => mockPlatform },
}));
jest.mock('../services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const load = (key = 'appl_test') => {
  let mod;
  jest.isolateModules(() => {
    process.env.REACT_APP_REVENUECAT_IOS_KEY = key;
    // eslint-disable-next-line global-require
    mod = require('./storePurchases');
  });
  return mod;
};

// CRA resets mock implementations before every test, so build them here.
beforeEach(() => { setUpStore(); mockPlatform = 'ios'; }); // not returned: the mock is thenable

/**
 * Why the store said no, which is the whole point of the telemetry: a build
 * that cannot sell on any iPhone and a user who simply did not buy produce
 * the same empty funnel, and only this distinguishes them.
 */
describe('storeUnavailableReason', () => {
  it('is null on an iOS build that has the key — nothing to report', () => {
    expect(load().storeUnavailableReason()).toBeNull();
  });

  it('names a build shipped without the RevenueCat key', () => {
    // The release mistake this exists for. Nothing about it looks broken.
    const s = load('');
    expect(s.storePurchasesAvailable()).toBe(false);
    expect(s.storeUnavailableReason()).toBe('no_key');
  });

  it('tells Android and the browser apart, because only one of them is a gap', () => {
    mockPlatform = 'android';
    expect(load().storeUnavailableReason()).toBe('android');
    mockPlatform = 'web';
    expect(load().storeUnavailableReason()).toBe('web');
  });
});

describe('storePurchases', () => {
  it('never awaits the plugin itself, which a Capacitor proxy turns into a hang', async () => {
    const s = load();
    const offer = await s.getStoreOffer('pro', 'u1');
    expect(offer.priceString).toBe('€6.99');
    await expect(s.purchasePlan('pro', 'u1', offer)).resolves.toBe('purchased');
    expect(mockPurchases.then).not.toHaveBeenCalled();
  });

  it('configures once with the LaChart id, even when asked concurrently', async () => {
    const s = load();
    await Promise.all([s.ensureStoreUser('u1'), s.ensureStoreUser('u1'), s.getStoreOffer('pro', 'u1')]);
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
    expect(mockPurchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_test', appUserID: 'u1' });
    expect(mockPurchases.logIn).not.toHaveBeenCalled();
  });

  it('switches with logIn when another account signs in', async () => {
    const s = load();
    await s.ensureStoreUser('u1');
    await s.resetStoreUser();
    await s.ensureStoreUser('u2');
    expect(mockPurchases.logOut).toHaveBeenCalledTimes(1);
    expect(mockPurchases.logIn).toHaveBeenCalledWith({ appUserID: 'u2' });
  });

  it('refuses to buy without a signed-in user', async () => {
    const s = load();
    await expect(s.purchasePlan('pro', null)).rejects.toThrow(/Sign in/);
    expect(mockPurchases.purchaseStoreProduct).not.toHaveBeenCalled();
  });

  it('buys the product that matches the plan', async () => {
    const s = load();
    await expect(s.purchasePlan('coach', 'u1')).resolves.toBe('purchased');
    const { product } = mockPurchases.purchaseStoreProduct.mock.calls[0][0];
    expect(product.identifier).toBe(s.STORE_PRODUCT_IDS.coach);
  });

  it('treats closing the App Store sheet as a cancel, not an error', async () => {
    const s = load();
    mockPurchases.purchaseStoreProduct.mockRejectedValueOnce({ code: '1', userCancelled: true });
    await expect(s.purchasePlan('pro', 'u1')).resolves.toBe('cancelled');
  });

  it('drops the trial wording only when Apple says the trial is used', async () => {
    const s = load();
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValueOnce({
      [s.STORE_PRODUCT_IDS.pro]: { status: 1 },
    });
    const offer = await s.getStoreOffer('pro', 'u1');
    expect(offer.trialEligible).toBe(false);
    expect(offer.priceString).toBe('€6.99');
  });
});
