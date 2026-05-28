const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { generateEmailTemplate, getClientUrl } = require('../utils/emailTemplate');

function createTransporter() {
  return createEmailTransporter();
}

/**
 * Send email verification email to user
 * @param {Object} user - User object with name, surname, email
 * @param {String} verificationToken - Token for email verification
 * @returns {Promise<Object>} Result object with sent status
 */
async function sendEmailVerificationEmail(user, verificationToken) {
  if (!user?.email) {
    return { sent: false, reason: 'no_email' };
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { sent: false, reason: 'transporter_not_created' };
  }

  const clientUrl = getClientUrl();
  const verificationUrl = `${clientUrl}/verify-email/${verificationToken}`;

  // Single hero image — the old mail had three product screenshots stacked
  // which pushed the verify button below the fold and felt like a sales pitch
  // rather than a transactional mail. One image at the top sets the visual
  // tone without burying the CTA.
  const lactateTestingImage = `${clientUrl}/images/lactate_testing.png`;

  const userName = user.name || 'there';
  const stravaConnectUrl = `${clientUrl}/settings?tab=integrations`;

  // Refreshed copy (2026-05) — replaces the old "here are 3 generic screenshots"
  // verification mail with a tighter intro that explains what LaChart can do
  // for a new signup, paired with a single hero image and a Strava-connect
  // callout. The latter is intentionally visible BEFORE the user has even
  // verified, because most users skim the email, click verify, and never come
  // back — the Strava connect callout is the highest-leverage post-verify
  // action, so we tease it here.
  const emailContent = `
    <p>Hi <strong>${userName}</strong>,</p>

    <p>Welcome to LaChart — the home for blood-lactate tests, training zones, and the data that actually tells you whether you're getting faster.</p>

    <p>One click and you're in:</p>

    <div style="margin: 22px 0; text-align: center;">
      <img src="${lactateTestingImage}" alt="" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);" />
    </div>

    <p style="margin-top: 26px; font-size: 15.5px; color: #1D2C4C;"><strong>Here's what's waiting for you once you verify:</strong></p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin: 14px 0; border-collapse: separate; border-spacing: 0 8px;">
      <tr>
        <td style="background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;">
          <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">📈 Lactate curve from any step test</div>
          <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">Paste your test values, instantly get LT1, LT2, OBLA, IAT, D-max — and matching training zones.</div>
        </td>
      </tr>
      <tr>
        <td style="background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;">
          <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">📅 Plan structured workouts in the calendar</div>
          <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">Warm-up · intervals with target zones · recoveries · cooldown — drop them on any day and run them from the app.</div>
        </td>
      </tr>
      <tr>
        <td style="background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;">
          <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">💧 Add lactate samples to any interval</div>
          <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">Tag any interval of a workout with a blood lactate value. Each sample re-builds your curve.</div>
        </td>
      </tr>
      <tr>
        <td style="background-color: #E9ECF6; border-radius: 10px; padding: 14px 16px;">
          <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">❤️ Form, fitness & fatigue tracking</div>
          <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">CTL · ATL · TSB charted over weeks. See when you're peaking and when to back off.</div>
        </td>
      </tr>
      <tr>
        <td style="background-color: #FFE6DF; border-radius: 10px; padding: 14px 16px;">
          <div style="font-weight: 700; color: #0A0E1A; font-size: 15px;">⚡ Auto-import every workout from Strava</div>
          <div style="color: #4A5E82; font-size: 14px; line-height: 1.5; margin-top: 2px;">Connect once — every ride, run and swim flows in automatically with power, HR, pace and laps. <a href="${stravaConnectUrl}" style="color: #E85535; font-weight: 600; text-decoration: none;">Set it up after verifying →</a></div>
        </td>
      </tr>
    </table>

    <p style="margin-top: 24px;">Verify your email below, then sign in and you're set.</p>

    <p style="margin-top: 22px; color: #6B7280; font-size: 13.5px;">
      <strong>Note:</strong> this link expires in 24 hours. Didn't sign up for LaChart? You can ignore this — we won't email you again.
    </p>
  `;

  try {
    await transporter.sendMail({
      from: {
        name: 'LaChart',
        address: process.env.EMAIL_USER
      },
      to: user.email,
      subject: 'One click and you\'re in — verify your LaChart email',
      html: generateEmailTemplate({
        title: 'Confirm your email and let\'s go',
        content: emailContent,
        buttonText: 'Verify my email',
        buttonUrl: verificationUrl,
        footerText: 'Button not working? Copy &amp; paste this link into your browser: ' + verificationUrl
      })
    });

    return { sent: true };
  } catch (error) {
    console.error('Email verification email error:', error);
    return { sent: false, reason: error.message || 'send_failed' };
  }
}

module.exports = {
  sendEmailVerificationEmail
};
