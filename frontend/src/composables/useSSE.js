// SSE Connection Manager
export function useSSE() {
  let eventSource = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  const maxReconnectDelay = 30000;

  function connect(onData, onError) {
    if (eventSource) {
      eventSource.close();
    }

    console.log('🔌 Connecting to SSE stream...');
    eventSource = new EventSource('/api/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onData(data);
        reconnectDelay = 1000; // Reset delay on successful connection
      } catch (err) {
        console.error('Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
      
      // Exponential backoff reconnection
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
        connect(onData, onError);
      }, reconnectDelay);
      
      onError?.('Connection lost. Reconnecting...');
    };

    eventSource.onopen = () => {
      console.log('✅ SSE connected');
    };
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  return { connect, disconnect };
}
