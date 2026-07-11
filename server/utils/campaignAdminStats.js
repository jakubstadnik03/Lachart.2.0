/**
 * Admin-facing stats + paginated recipient lists for paced email campaigns.
 * Each campaign stores its sent-marker on user.retentionEmails.<campaignKey>.
 */

const User = require('../models/UserModel');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sentField(campaignKey) {
  return `retentionEmails.${campaignKey}`;
}

function baseEmailQuery() {
  return { email: { $exists: true, $ne: null, $ne: '' } };
}

function eligiblePendingQuery(campaignKey, { requireMarketing = false } = {}) {
  const field = sentField(campaignKey);
  const q = {
    ...baseEmailQuery(),
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    $or: [{ [field]: { $exists: false } }, { [field]: null }],
  };
  if (requireMarketing) {
    q['notifications.marketingEmails'] = { $ne: false };
  }
  return q;
}

function ineligibleQuery(campaignKey, { requireMarketing = false } = {}) {
  const field = sentField(campaignKey);
  const reasons = [
    { isActive: false },
    { 'notifications.emailNotifications': false },
  ];
  if (requireMarketing) reasons.push({ 'notifications.marketingEmails': false });

  return {
    ...baseEmailQuery(),
    $or: [{ [field]: { $exists: false } }, { [field]: null }],
    $and: [{ $or: reasons }],
  };
}

function classifyUser(user, campaignKey, { requireMarketing = false } = {}) {
  const sentAt = user?.retentionEmails?.[campaignKey] || null;
  if (sentAt) return { status: 'sent', reason: null, sentAt };

  if (!user?.email) return { status: 'ineligible', reason: 'no_email', sentAt: null };
  if (user.isActive === false) return { status: 'ineligible', reason: 'inactive', sentAt: null };
  if (user.notifications?.emailNotifications === false) {
    return { status: 'ineligible', reason: 'email_opted_out', sentAt: null };
  }
  if (requireMarketing && user.notifications?.marketingEmails === false) {
    return { status: 'ineligible', reason: 'marketing_opted_out', sentAt: null };
  }
  return { status: 'pending', reason: null, sentAt: null };
}

function applySearchFilter(query, search) {
  const term = String(search || '').trim();
  if (!term) return query;
  const rx = new RegExp(escapeRegex(term), 'i');
  return {
    $and: [
      query,
      { $or: [{ email: rx }, { name: rx }, { surname: rx }] },
    ],
  };
}

function buildRecipientQuery(campaignKey, status, options = {}) {
  const field = sentField(campaignKey);
  let query;

  switch (status) {
    case 'sent':
      query = { [field]: { $ne: null, $exists: true } };
      break;
    case 'pending':
      query = eligiblePendingQuery(campaignKey, options);
      break;
    case 'ineligible':
      query = ineligibleQuery(campaignKey, options);
      break;
    case 'all':
    default:
      query = baseEmailQuery();
      break;
  }

  return applySearchFilter(query, options.search);
}

async function getCampaignAdminStats(campaignKey, { requireMarketing = false } = {}) {
  const field = sentField(campaignKey);
  const [
    sent,
    pending,
    emailOptedOut,
    marketingOptedOut,
    inactive,
    totalWithEmail,
    sentBounds,
  ] = await Promise.all([
    User.countDocuments({ [field]: { $ne: null, $exists: true } }),
    User.countDocuments(eligiblePendingQuery(campaignKey, { requireMarketing })),
    User.countDocuments({
      ...baseEmailQuery(),
      $or: [{ [field]: { $exists: false } }, { [field]: null }],
      'notifications.emailNotifications': false,
    }),
    requireMarketing
      ? User.countDocuments({
        ...baseEmailQuery(),
        $or: [{ [field]: { $exists: false } }, { [field]: null }],
        'notifications.marketingEmails': false,
        'notifications.emailNotifications': { $ne: false },
        isActive: { $ne: false },
      })
      : Promise.resolve(0),
    User.countDocuments({
      ...baseEmailQuery(),
      $or: [{ [field]: { $exists: false } }, { [field]: null }],
      isActive: false,
    }),
    User.countDocuments(baseEmailQuery()),
    User.aggregate([
      { $match: { [field]: { $ne: null, $exists: true } } },
      {
        $group: {
          _id: null,
          firstSentAt: { $min: `$${field}` },
          lastSentAt: { $max: `$${field}` },
        },
      },
    ]),
  ]);

  const eligible = sent + pending;

  return {
    campaignKey,
    sent,
    pending,
    eligible,
    totalWithEmail,
    ineligible: Math.max(0, totalWithEmail - sent - pending),
    breakdown: {
      email_opted_out: emailOptedOut,
      marketing_opted_out: marketingOptedOut,
      inactive,
    },
    firstSentAt: (sentBounds?.[0] || {}).firstSentAt || null,
    lastSentAt: (sentBounds?.[0] || {}).lastSentAt || null,
    progressPct: eligible > 0 ? Math.round((sent / eligible) * 100) : (sent > 0 ? 100 : 0),
  };
}

async function getCampaignRecipients(
  campaignKey,
  {
    status = 'sent',
    search = '',
    page = 1,
    limit = 50,
    requireMarketing = false,
  } = {}
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const skip = (safePage - 1) * safeLimit;
  const field = sentField(campaignKey);

  const filter = buildRecipientQuery(campaignKey, status, { search, requireMarketing });

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select(`_id email name surname role isActive notifications createdAt ${field}`)
      .sort(status === 'sent' ? { [field]: -1 } : { createdAt: 1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  const items = users.map((user) => {
    const cls = classifyUser(user, campaignKey, { requireMarketing });
    return {
      _id: user._id,
      email: user.email,
      name: user.name || '',
      surname: user.surname || '',
      role: user.role || '',
      status: cls.status,
      reason: cls.reason,
      sentAt: user.retentionEmails?.[campaignKey] || cls.sentAt || null,
    };
  });

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
    status,
    search: String(search || '').trim(),
  };
}

module.exports = {
  getCampaignAdminStats,
  getCampaignRecipients,
  classifyUser,
};
