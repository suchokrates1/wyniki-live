// Court Data Management
export function useCourtData() {
  function sortCourtIds(courts) {
    return Object.keys(courts).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      return na - nb;
    });
  }

  function isMatchActive(court) {
    return court?.match_status?.active || false;
  }

  function getPlayerScore(court, player) {
    if (!court || !court[player]) {
      return { points: '0', games: 0, sets: [] };
    }

    const playerData = court[player];
    const sets = ['set1', 'set2', 'set3']
      .map(setKey => playerData[setKey] || 0)
      .filter((s, i) => {
        const otherPlayer = player === 'A' ? 'B' : 'A';
        const otherSet = court[otherPlayer]?.[`set${i + 1}`] || 0;
        return s > 0 || otherSet > 0;
      });

    return {
      points: playerData.points || '0',
      games: playerData.current_games || 0,
      sets
    };
  }

  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '00:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  function formatTimestamp(iso) {
    if (!iso) return '-';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
  }

  return {
    sortCourtIds,
    isMatchActive,
    getPlayerScore,
    formatDuration,
    formatTimestamp
  };
}
