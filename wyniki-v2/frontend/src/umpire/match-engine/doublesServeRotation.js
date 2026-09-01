export const DoublesServeRotation = {
  nextServer(currentServer) {
    switch (currentServer) {
      case 1:
        return 2;
      case 2:
        return 3;
      case 3:
        return 4;
      case 4:
        return 1;
      default:
        return 1;
    }
  },

  isTeamOneServing(currentServer) {
    return currentServer === 1 || currentServer === 3;
  },

  rotate(state) {
    state.currentServer = this.nextServer(state.currentServer);
    state.isPlayer1Serving = this.isTeamOneServing(state.currentServer);
  },
};
