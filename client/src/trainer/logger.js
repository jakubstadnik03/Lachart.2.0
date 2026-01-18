/**
 * Logger utility for trainer connectivity
 */

class TrainerLogger {
  constructor() {
    this.level = 'info';
    this.enabled = true;
  }

  setLevel(level) {
    this.level = level;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  shouldLog(level) {
    if (!this.enabled) return false;
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  formatMessage(level, message, ...args) {
    if (!this.shouldLog(level)) return;
    
    const timestamp = new Date().toISOString();
    const prefix = `[Trainer:${level.toUpperCase()}] ${timestamp}`;
    
    switch (level) {
      case 'debug':
        console.debug(prefix, message, ...args);
        break;
      case 'info':
        console.info(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'error':
        console.error(prefix, message, ...args);
        break;
      default:
        console.log(prefix, message, ...args);
        break;
    }
  }

  debug(message, ...args) {
    this.formatMessage('debug', message, ...args);
  }

  info(message, ...args) {
    this.formatMessage('info', message, ...args);
  }

  warn(message, ...args) {
    this.formatMessage('warn', message, ...args);
  }

  error(message, ...args) {
    this.formatMessage('error', message, ...args);
  }
}

export const logger = new TrainerLogger();
