// Type definitions for Telegram Web App
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    query_id?: string;
    auth_date: number;
    hash: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText(text: string): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    setParams(params: {
      text?: string;
      color?: string;
      text_color?: string;
      is_active?: boolean;
      is_visible?: boolean;
    }): void;
  };
  BackButton: {
    isVisible: boolean;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  ready(): void;
  expand(): void;
  close(): void;
  sendData(data: string): void;
  onEvent(eventType: string, eventHandler: () => void): void;
  offEvent(eventType: string, eventHandler: () => void): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export class TelegramBridge {
  private static instance: TelegramBridge;
  private webApp: TelegramWebApp | null = null;

  private constructor() {
    this.init();
  }

  public static getInstance(): TelegramBridge {
    if (!TelegramBridge.instance) {
      TelegramBridge.instance = new TelegramBridge();
    }
    return TelegramBridge.instance;
  }

  private init() {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      this.webApp = window.Telegram.WebApp;
      this.webApp.ready();
      this.webApp.expand();
      
      // Set theme colors for chess board
      this.updateTheme();
    } else {
      console.warn('Telegram Web App not available - running in development mode');
    }
  }

  private updateTheme() {
    if (!this.webApp) return;

    // Update CSS variables based on Telegram theme
    const root = document.documentElement;
    const theme = this.webApp.themeParams;
    
    if (theme.bg_color) {
      root.style.setProperty('--tg-bg-color', theme.bg_color);
    }
    if (theme.text_color) {
      root.style.setProperty('--tg-text-color', theme.text_color);
    }
    if (theme.button_color) {
      root.style.setProperty('--tg-button-color', theme.button_color);
    }
  }

  public isAvailable(): boolean {
    return this.webApp !== null;
  }

  public getUser() {
    return this.webApp?.initDataUnsafe.user || null;
  }

  public getInitData(): string {
    return this.webApp?.initData || '';
  }

  public showMainButton(text: string, onClick: () => void) {
    if (!this.webApp) return;
    
    this.webApp.MainButton.setText(text);
    this.webApp.MainButton.onClick(onClick);
    this.webApp.MainButton.show();
  }

  public hideMainButton() {
    if (!this.webApp) return;
    this.webApp.MainButton.hide();
  }

  public showBackButton(onClick: () => void) {
    if (!this.webApp) return;
    
    this.webApp.BackButton.onClick(onClick);
    this.webApp.BackButton.show();
  }

  public hideBackButton() {
    if (!this.webApp) return;
    this.webApp.BackButton.hide();
  }

  public hapticFeedback(type: 'impact' | 'notification' | 'selection', style?: string) {
    if (!this.webApp) return;

    switch (type) {
      case 'impact':
        this.webApp.HapticFeedback.impactOccurred(style as any || 'medium');
        break;
      case 'notification':
        this.webApp.HapticFeedback.notificationOccurred(style as any || 'success');
        break;
      case 'selection':
        this.webApp.HapticFeedback.selectionChanged();
        break;
    }
  }

  public sendMove(sessionId: string, move: string) {
    if (!this.webApp) {
      // In development mode, log to console
      console.log('Move:', { sessionId, move });
      return;
    }

    // Send data back to bot
    this.webApp.sendData(JSON.stringify({
      type: 'move',
      sessionId,
      move
    }));
  }

  public close() {
    if (!this.webApp) return;
    this.webApp.close();
  }

  public getTheme() {
    return {
      colorScheme: this.webApp?.colorScheme || 'light',
      isDark: this.webApp?.colorScheme === 'dark'
    };
  }
} 