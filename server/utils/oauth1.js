const crypto = require('crypto');
const querystring = require('querystring');

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateNonce(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function generateTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function normalizeParams(params) {
  // Flatten and sort
  const pairs = [];
  Object.keys(params).forEach(key => {
    const value = params[key];
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach(v => pairs.push([percentEncode(key), percentEncode(String(v))]));
    } else {
      pairs.push([percentEncode(key), percentEncode(String(value))]);
    }
  });
  pairs.sort((a, b) => {
    if (a[0] === b[0]) return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    return a[0] < b[0] ? -1 : 1;
  });
  return pairs.map(p => `${p[0]}=${p[1]}`).join('&');
}

function buildBaseString(method, url, allParams) {
  return [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(normalizeParams(allParams))
  ].join('&');
}

function signHmacSha1(baseString, consumerSecret, tokenSecret = '') {
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac('sha1', key).update(baseString).digest('base64');
}

/**
 * Create OAuth 1.0a Authorization header and oauth params
 * @param {Object} options
 * @param {string} options.method
 * @param {string} options.url
 * @param {Object} options.params - extra query/body params to sign with
 * @param {string} options.consumerKey
 * @param {string} options.consumerSecret
 * @param {string} [options.token]
 * @param {string} [options.tokenSecret]
 * @param {string} [options.callback]
 * @param {string} [options.verifier]
 */
function buildOAuthHeader({
  method,
  url,
  params = {},
  consumerKey,
  consumerSecret,
  token,
  tokenSecret,
  callback,
  verifier
}) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: generateNonce(16),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(generateTimestamp()),
    oauth_version: '1.0'
  };
  if (token) oauthParams.oauth_token = token;
  if (callback) oauthParams.oauth_callback = callback;
  if (verifier) oauthParams.oauth_verifier = verifier;

  const allParams = { ...params, ...oauthParams };
  const baseString = buildBaseString(method, url, allParams);
  const signature = signHmacSha1(baseString, consumerSecret, tokenSecret);

  const authHeader = 'OAuth ' + Object.entries({ ...oauthParams, oauth_signature: signature })
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(', ');

  return { header: authHeader, oauthParams: oauthParams, signature };
}

module.exports = {
  buildOAuthHeader
};


