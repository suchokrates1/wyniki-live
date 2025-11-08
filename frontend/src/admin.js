import Alpine from 'alpinejs';
import '../src/main.css';

// Initialize Alpine.js
window.Alpine = Alpine;

// Admin App Component
Alpine.data('adminApp', () => ({
  activeTab: 'uno',
  unoStatus: { enabled: false },
  unoConfig: { limit: 100, threshold: 80, slowdown_factor: 2, slowdown_sleep: 1 },
  unoCourtStatus: {},
  courts: [],
  history: [],
  toast: { show: false, message: '', type: 'info' },

  async init() {
    console.log('🎾 Admin Panel - Initializing...');
    await this.loadUnoStatus()
    await this.loadCourts()
    await this.loadHistory()
    
    // Refresh UNO status every 10s
    setInterval(() => this.loadUnoStatus(), 10000)
  },

  async loadUnoStatus() {
    try {
      const [configRes, statusRes] = await Promise.all([
        fetch('/admin/api/uno/config'),
        fetch('/admin/api/uno/status')
      ])
      
      if (configRes.ok) {
        const config = await configRes.json()
        this.unoConfig = {
          limit: config.limit,
          threshold: config.threshold_percent || config.threshold * 100,
          slowdown_factor: config.slowdown_factor,
          slowdown_sleep: config.slowdown_sleep
        }
      }
      
      if (statusRes.ok) {
        const status = await statusRes.json()
        this.unoStatus.enabled = status.enabled
        this.unoCourtStatus = status.courts || {}
      }
    } catch (e) {
      console.error('Failed to load UNO status:', e)
    }
  },

  async saveUnoConfig() {
    try {
      const res = await fetch('/admin/api/uno/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: parseInt(this.unoConfig.limit),
          threshold: parseFloat(this.unoConfig.threshold) / 100,
          slowdown_factor: parseFloat(this.unoConfig.slowdown_factor),
          slowdown_sleep: parseFloat(this.unoConfig.slowdown_sleep)
        })
      })
      
      if (res.ok) {
        this.showToast('Konfiguracja zapisana', 'success')
        await this.loadUnoStatus()
      } else {
        this.showToast('Błąd zapisu konfiguracji', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  async toggleUno() {
    try {
      const res = await fetch('/admin/api/uno/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: !this.unoStatus.enabled,
          reason: 'manual toggle from admin panel'
        })
      })
      
      if (res.ok) {
        await this.loadUnoStatus()
        this.showToast('Status UNO zmieniony', 'success')
      } else {
        this.showToast('Błąd zmiany statusu', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  async loadCourts() {
    try {
      const res = await fetch('/admin/api/courts')
      if (res.ok) {
        this.courts = await res.json()
      }
    } catch (e) {
      console.error('Failed to load courts:', e)
    }
  },

  async updateCourtOverlay(kortId, overlayId) {
    try {
      const res = await fetch(`/admin/api/courts/${kortId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overlay_id: overlayId || null })
      })
      
      if (res.ok) {
        this.showToast('Overlay zaktualizowane', 'success')
        await this.loadCourts()
      } else {
        this.showToast('Błąd aktualizacji', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  async addCourt() {
    const newId = prompt('Podaj ID nowego kortu (np. 5):')
    if (!newId) return
    
    try {
      const res = await fetch('/admin/api/courts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kort_id: newId, overlay_id: null })
      })
      
      if (res.ok) {
        this.showToast('Kort dodany', 'success')
        await this.loadCourts()
      } else {
        this.showToast('Błąd dodawania kortu', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  async testCourt(kortId) {
    this.showToast(`Test kortu ${kortId}...`, 'info')
  },

  async loadHistory() {
    try {
      const res = await fetch('/api/history')
      if (res.ok) {
        this.history = await res.json()
      }
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  },

  async deleteMatch(idx) {
    if (!confirm('Czy na pewno usunąć ten mecz z historii?')) return
    
    try {
      const res = await fetch('/admin/api/history/latest', {
        method: 'DELETE'
      })
      
      if (res.ok) {
        this.showToast('Mecz usunięty', 'success')
        await this.loadHistory()
      } else {
        this.showToast('Błąd usuwania', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  formatScore(scoreArray) {
    return scoreArray ? scoreArray.join('-') : '0-0-0'
  },

  formatResetTime(isoString) {
    if (!isoString) return '-'
    const date = new Date(isoString)
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  },

  showToast(message, type = 'info') {
    this.toast = { show: true, message, type }
    setTimeout(() => {
      this.toast.show = false
    }, 3000)
  }
}))

// Start Alpine
Alpine.start();
console.log('✅ Alpine.js initialized');
