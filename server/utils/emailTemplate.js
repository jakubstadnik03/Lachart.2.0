/**
 * Unified email template helper for LaChart
 * Provides consistent email design with logo and branding
 */

// Always use production URL for emails to avoid localhost issues
const CLIENT_URL = process.env.NODE_ENV === 'production' 
  ? 'https://lachart.net'
  : (process.env.CLIENT_URL || process.env.FRONTEND_URL || 'https://lachart.net');
const LOGO_URL = `${CLIENT_URL}/logo192.png`;

/**
 * Generate email HTML with unified design
 * @param {Object} options - Email options
 * @param {String} options.title - Email title/heading
 * @param {String} options.content - Main email content (HTML)
 * @param {String} options.buttonText - Button text (optional)
 * @param {String} options.buttonUrl - Button URL (optional)
 * @param {String} options.loginButtonText - Login button text (optional)
 * @param {String} options.loginButtonUrl - Login button URL (optional)
 * @param {String} options.footerText - Additional footer text (optional)
 * @returns {String} HTML email template
 */
function generateEmailTemplate({ title, content, buttonText, buttonUrl, loginButtonText, loginButtonUrl, footerText }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 760px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-collapse: collapse;">
                    <!-- Header with Logo -->
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #767EB5 0%, #5E6590 100%); border-radius: 8px 8px 0 0;">
                            <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 10px;">
                                <img src="${LOGO_URL}" alt="LaChart Logo" style="height: 50px; width: auto;" />
                                <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">LaChart</h1>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 40px 30px;">
                            <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 24px; font-weight: 600; line-height: 1.3;">${title}</h2>
                            <div style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                                ${content}
                            </div>
                            
                            ${buttonText && buttonUrl ? `
                            <!-- Button -->
                            <table role="presentation" style="width: 100%; margin: 30px 0;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="${buttonUrl}" style="display: inline-block; padding: 14px 32px; background-color: #767EB5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(118, 126, 181, 0.3);">${buttonText}</a>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}
                            
                            ${loginButtonText && loginButtonUrl ? `
                            <!-- Login Button -->
                            <table role="presentation" style="width: 100%; margin: 10px 0 30px;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="${loginButtonUrl}" style="display: inline-block; padding: 14px 32px; background-color: #ffffff; color: #767EB5; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; border: 2px solid #767EB5; box-shadow: 0 2px 4px rgba(118, 126, 181, 0.2);">${loginButtonText}</a>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}
                            
                            ${footerText ? `
                            <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                                ${footerText}
                            </p>
                            ` : ''}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px; text-align: center;">
                                <strong>LaChart</strong> - Advanced lactate testing and analysis
                            </p>
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                If you did not request this email, you can safely ignore it.
                            </p>
                            <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                <a href="${CLIENT_URL}" style="color: #767EB5; text-decoration: none;">Visit LaChart</a> | 
                                <a href="${CLIENT_URL}/about" style="color: #767EB5; text-decoration: none;">About</a> | 
                                <a href="mailto:jakub.stadnik01@gmail.com" style="color: #767EB5; text-decoration: none;">Support</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
}

/**
 * Get the client URL (always https://lachart.net for emails)
 * This ensures emails never contain localhost URLs
 */
function getClientUrl() {
  // Always use production URL for emails to prevent localhost issues
  // Only use env variable if it's explicitly set to production URL
  const envUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL;
  if (envUrl && (envUrl.includes('lachart.net') || envUrl.includes('https://'))) {
    return envUrl;
  }
  // Default to production URL
  return 'https://lachart.net';
}

module.exports = {
  generateEmailTemplate,
  getClientUrl
};

