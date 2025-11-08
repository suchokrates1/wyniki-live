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
  tournaments: [],
  selectedTournament: null,
  players: [],
  newTournament: { name: '', start_date: '', end_date: '' },
  newPlayer: { name: '', category: '', country: '' },
  importText: '',
  playerSearchQuery: '',
  loading: { tournaments: false, players: false, courts: false, history: false },
  toast: { show: false, message: '', type: 'info' },

  async init() {
    console.log('🎾 Admin Panel - Initializing...');
    await this.loadUnoStatus()
    await this.loadCourts()
    await this.loadHistory()
    await this.loadTournaments()
    
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

  // ==================== TOURNAMENTS ====================

  async loadTournaments() {
    this.loading.tournaments = true
    try {
      const res = await fetch('/admin/api/tournaments')
      if (res.ok) {
        this.tournaments = await res.json()
        // Load active tournament players
        const activeTournament = this.tournaments.find(t => t.active)
        if (activeTournament) {
          this.selectedTournament = activeTournament.id
          await this.loadPlayers(activeTournament.id)
        }
      }
    } catch (e) {
      console.error('Failed to load tournaments:', e)
    } finally {
      this.loading.tournaments = false
    }
  },

  async createTournament() {
    if (!this.newTournament.name || !this.newTournament.start_date || !this.newTournament.end_date) {
      this.showToast('Wypełnij wszystkie pola', 'warning')
      return
    }

    // Validate dates: start_date must be before end_date
    if (new Date(this.newTournament.start_date) >= new Date(this.newTournament.end_date)) {
      this.showToast('Data rozpoczęcia musi być wcześniej niż data zakończenia', 'warning')
      return
    }

    try {
      const res = await fetch('/admin/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.newTournament)
      })

      if (res.ok) {
        this.showToast('Turniej utworzony', 'success')
        this.newTournament = { name: '', start_date: '', end_date: '' }
        await this.loadTournaments()
      } else {
        this.showToast('Błąd tworzenia turnieju', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  async deleteTournament(tournamentId) {
    if (!confirm('Czy na pewno usunąć ten turniej? Zostaną usunięci wszyscy gracze!')) return

    try {
      const res = await fetch(`/admin/api/tournaments/${tournamentId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        this.showToast('Turniej usunięty', 'success')
        await this.loadTournaments()
      } else {
        this.showToast('Błąd usuwania turnieju', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  async activateTournament(tournamentId) {
    try {
      const res = await fetch(`/admin/api/tournaments/${tournamentId}/activate`, {
        method: 'POST'
      })

      if (res.ok) {
        this.showToast('Turniej aktywowany', 'success')
        await this.loadTournaments()
      } else {
        this.showToast('Błąd aktywacji turnieju', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  async selectTournament(tournamentId) {
    this.selectedTournament = tournamentId
    await this.loadPlayers(tournamentId)
  },

  // ==================== PLAYERS ====================

  async loadPlayers(tournamentId) {
    if (!tournamentId) return

    this.loading.players = true
    try {
      const res = await fetch(`/admin/api/tournaments/${tournamentId}/players`)
      if (res.ok) {
        this.players = await res.json()
      }
    } catch (e) {
      console.error('Failed to load players:', e)
    } finally {
      this.loading.players = false
    }
  },

  async addPlayer() {
    if (!this.selectedTournament) {
      this.showToast('Wybierz turniej', 'warning')
      return
    }

    if (!this.newPlayer.name) {
      this.showToast('Podaj imię i nazwisko gracza', 'warning')
      return
    }

    try {
      const res = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.newPlayer)
      })

      if (res.ok) {
        this.showToast('Gracz dodany', 'success')
        this.newPlayer = { name: '', category: '', country: '' }
        await this.loadPlayers(this.selectedTournament)
      } else {
        this.showToast('Błąd dodawania gracza', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  async deletePlayer(playerId) {
    if (!confirm('Czy na pewno usunąć tego gracza?')) return

    try {
      const res = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/${playerId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        this.showToast('Gracz usunięty', 'success')
        await this.loadPlayers(this.selectedTournament)
      } else {
        this.showToast('Błąd usuwania gracza', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  async importPlayers() {
    if (!this.selectedTournament) {
      this.showToast('Wybierz turniej', 'warning')
      return
    }

    if (!this.importText.trim()) {
      this.showToast('Wklej listę graczy', 'warning')
      return
    }

    try {
      const res = await fetch(`/admin/api/tournaments/${this.selectedTournament}/players/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: this.importText })
      })

      if (res.ok) {
        const data = await res.json()
        this.showToast(data.message, 'success')
        this.importText = ''
        await this.loadPlayers(this.selectedTournament)
      } else {
        this.showToast('Błąd importu graczy', 'error')
      }
    } catch (e) {
      this.showToast('Błąd połączenia', 'error')
    }
  },

  get filteredPlayers() {
    if (!this.playerSearchQuery) return this.players
    
    const query = this.playerSearchQuery.toLowerCase()
    return this.players.filter(p => 
      p.name.toLowerCase().includes(query) ||
      (p.category && p.category.toLowerCase().includes(query)) ||
      (p.country && p.country.toLowerCase().includes(query))
    )
  },

  exportPlayersCSV() {
    if (!this.selectedTournament || this.filteredPlayers.length === 0) {
      this.showToast('Brak graczy do eksportu', 'warning')
      return
    }

    // CSV header
    const header = 'Imię i nazwisko,Kategoria,Państwo\n'
    
    // CSV rows
    const rows = this.filteredPlayers.map(p => 
      `"${p.name}","${p.category || ''}","${p.country || ''}"`
    ).join('\n')
    
    const csv = header + rows
    
    // Create download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    const tournament = this.tournaments.find(t => t.id === this.selectedTournament)
    const filename = `gracze_${tournament?.name || 'turniej'}_${new Date().toISOString().split('T')[0]}.csv`
    
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    this.showToast(`Wyeksportowano ${this.filteredPlayers.length} graczy`, 'success')
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
