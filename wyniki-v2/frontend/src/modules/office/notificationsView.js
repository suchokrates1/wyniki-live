export function createOfficeNotificationsView() {
  return {
    hydrateNotificationPreferences() {
      const savedValue = window.localStorage.getItem(this.officeNotificationsKey());
      if (savedValue !== null) {
        this.notificationsEnabled = savedValue === 'true';
      }
      if (typeof Notification !== 'undefined') {
        this.notificationPermission = Notification.permission;
      }
    },

    setNotificationsEnabled(nextValue) {
      this.notificationsEnabled = !!nextValue;
      window.localStorage.setItem(this.officeNotificationsKey(), String(this.notificationsEnabled));
    },

    async toggleNotifications() {
      const nextValue = !this.notificationsEnabled;
      this.setNotificationsEnabled(nextValue);
      if (nextValue) {
        await this.ensureNotificationPermission(false);
        this.showToast(this.ot('toast.notificationsOn'), 'success');
        return;
      }
      this.showToast(this.ot('toast.notificationsOff'), 'info');
    },

    async ensureNotificationPermission(showWarning = true) {
      if (typeof Notification === 'undefined') {
        this.notificationPermission = 'unsupported';
        if (showWarning) {
          this.showToast(this.ot('toast.notificationsUnsupported'), 'warning');
        }
        return false;
      }

      this.notificationPermission = Notification.permission;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') {
        if (showWarning) {
          this.showToast(this.ot('toast.notificationsBlocked'), 'warning');
        }
        return false;
      }

      try {
        const permission = await Notification.requestPermission();
        this.notificationPermission = permission;
        if (permission !== 'granted' && showWarning) {
          this.showToast(this.ot('toast.notificationsDenied'), 'warning');
        }
        return permission === 'granted';
      } catch (error) {
        console.error('Failed to request notification permission:', error);
        if (showWarning) {
          this.showToast(this.ot('toast.notificationsFailed'), 'warning');
        }
        return false;
      }
    },

    playNotificationSound() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;

      try {
        const audioContext = new AudioContextClass();
        const now = audioContext.currentTime;
        const frequencies = [784, 988];

        frequencies.forEach((frequency, index) => {
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, now + index * 0.16);
          gain.gain.exponentialRampToValueAtTime(0.14, now + index * 0.16 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.26);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(now + index * 0.16);
          oscillator.stop(now + index * 0.16 + 0.28);
        });

        window.setTimeout(() => {
          audioContext.close().catch(() => {});
        }, 700);
        return true;
      } catch (error) {
        console.error('Failed to play notification sound:', error);
        return false;
      }
    },

    async showBrowserNotification(title, body) {
      if (typeof Notification === 'undefined') {
        this.notificationPermission = 'unsupported';
        return false;
      }

      this.notificationPermission = Notification.permission;
      if (Notification.permission !== 'granted') return false;

      try {
        const notification = new Notification(title, {
          body,
          tag: `office-slot-${this.slot}`,
          renotify: true,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        return true;
      } catch (error) {
        console.error('Failed to show browser notification:', error);
        return false;
      }
    },

    async triggerOfficeNotification({ title, body, toastMessage = '' }) {
      const soundPlayed = this.playNotificationSound();
      const browserShown = await this.showBrowserNotification(title, body);

      if (toastMessage) {
        this.showToast(toastMessage, browserShown || soundPlayed ? 'success' : 'info');
        return;
      }

      if (!soundPlayed && !browserShown) {
        this.showToast(body, 'info');
      }
    },

    buildNewMatchNotification(newMatches) {
      const tournamentName = this.tournamentMeta?.name || this.dashboard?.tournament?.name || this.ot('notifications.defaultTitle');
      if (newMatches.length === 1) {
        const match = newMatches[0];
        return {
          title: this.ot('notifications.newResult', { tournament: tournamentName }),
          body: `${match.player1_name || this.ot('notifications.playerA')} ${this.ot('versus')} ${match.player2_name || this.ot('notifications.playerB')}${match.score_text ? `, ${match.score_text}` : ''}`,
        };
      }

      return {
        title: this.ot('notifications.newResults', { tournament: tournamentName, count: newMatches.length }),
        body: newMatches.slice(0, 2).map(match => `${match.player1_name || 'A'} ${this.ot('versus')} ${match.player2_name || 'B'}`).join(' • '),
      };
    },

    async notifyAboutNewMatches(newMatches) {
      if (!this.notificationsEnabled || !newMatches.length) return;
      const notification = this.buildNewMatchNotification(newMatches);
      await this.triggerOfficeNotification({
        ...notification,
        toastMessage: newMatches.length === 1
          ? this.ot('toast.newMatchOne')
          : this.ot('toast.newMatchMany', { count: newMatches.length }),
      });
    },

    async testNotifications() {
      await this.ensureNotificationPermission(false);
      await this.triggerOfficeNotification({
        title: this.ot('notifications.testTitle', {
          tournament: this.tournamentMeta?.name || this.ot('notifications.defaultTitle'),
        }),
        body: this.ot('toast.testBody'),
        toastMessage: this.ot('toast.testStarted'),
      });
    },
  };
}
