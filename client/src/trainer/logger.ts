/**
 * Logger utility for trainer connectivity
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class TrainerLogger {
  private level: LogLevel = 'info';
  private enabled: boolean = true;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): void {
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
    }
  }

  debug(message: string, ...args: any[]) {
    this.formatMessage('debug', message, ...args);
  }

  info(message: string, ...args: any[]) {
    this.formatMessage('info', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.formatMessage('warn', message, ...args);
  }

  error(message: string, ...args: any[]) {
    this.formatMessage('error', message, ...args);
  }
}

export const logger = new TrainerLogger();
