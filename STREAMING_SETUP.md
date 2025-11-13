# Live Streaming Setup - Wyniki Live

## Architektura

```
Kort 1 (OBS) --RTMP--> MiniPC:1935/stream1 --> HLS --> https://score.vestmedia.pl/stream1
Kort 2 (OBS) --RTMP--> MiniPC:1935/stream2 --> HLS --> https://score.vestmedia.pl/stream2
Kort 3 (OBS) --RTMP--> MiniPC:1935/stream3 --> HLS --> https://score.vestmedia.pl/stream3
Kort 4 (OBS) --RTMP--> MiniPC:1935/stream4 --> HLS --> https://score.vestmedia.pl/stream4
```

## Uruchomienie

```bash
cd ~/count
docker compose up -d nginx-rtmp
```

## Konfiguracja OBS (na każdym korcie)

### Settings → Stream

**Kort 1:**
- Service: `Custom`
- Server: `rtmp://100.110.194.46:1935/stream1`
- Stream Key: `live` (lub puste)

**Kort 2:**
- Server: `rtmp://100.110.194.46:1935/stream2`
- Stream Key: `live`

**Kort 3:**
- Server: `rtmp://100.110.194.46:1935/stream3`
- Stream Key: `live`

**Kort 4:**
- Server: `rtmp://100.110.194.46:1935/stream4`
- Stream Key: `live`

### Rekomendowane ustawienia Video

- Base Resolution: `1920x1080`
- Output Resolution: `1920x1080` (lub `1280x720` jeśli CPU/sieć słabe)
- FPS: `30` (lub `60` jeśli masz mocny CPU)

### Rekomendowane ustawienia Output

- Output Mode: `Advanced`
- Encoder: `x264` (CPU) lub `NVENC H.264` (GPU - jeśli masz NVIDIA)
- Rate Control: `CBR`
- Bitrate: 
  - 1080p60: `6000 Kbps`
  - 1080p30: `4500 Kbps`
  - 720p60: `4500 Kbps`
  - 720p30: `3000 Kbps`
- Keyframe Interval: `2`
- Preset: `veryfast` (x264) lub `Quality` (NVENC)
- Profile: `high`
- Tune: `zerolatency`

## Dostęp do streamów

### Web Player (dla widzów)
- Kort 1: https://score.vestmedia.pl/stream1
- Kort 2: https://score.vestmedia.pl/stream2
- Kort 3: https://score.vestmedia.pl/stream3
- Kort 4: https://score.vestmedia.pl/stream4

### HLS Playlists (dla zaawansowanych)
- Kort 1: https://score.vestmedia.pl/hls/stream1/index.m3u8
- Kort 2: https://score.vestmedia.pl/hls/stream2/index.m3u8
- Kort 3: https://score.vestmedia.pl/hls/stream3/index.m3u8
- Kort 4: https://score.vestmedia.pl/hls/stream4/index.m3u8

### RTMP Stats (monitoring)
- http://100.110.194.46:8088/stat

## Testowanie

### 1. Sprawdź czy kontener działa
```bash
docker ps | grep wyniki-rtmp
docker logs wyniki-rtmp
```

### 2. Test z OBS
1. Ustaw server: `rtmp://100.110.194.46:1935/stream1`
2. Kliknij "Start Streaming"
3. Sprawdź logi: `docker logs -f wyniki-rtmp`
4. Otwórz w przeglądarce: http://100.110.194.46:8088/stream1

### 3. Test z ffmpeg (bez OBS)
```bash
# Testowy stream z koloru
ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 \
  -f lavfi -i sine=frequency=1000 \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -b:v 3000k -c:a aac -b:a 128k \
  -f flv rtmp://100.110.194.46:1935/stream1/live
```

## Troubleshooting

### OBS nie może się połączyć
1. Sprawdź czy port 1935 jest otwarty:
   ```bash
   telnet 100.110.194.46 1935
   ```
2. Sprawdź firewall na serwerze:
   ```bash
   sudo ufw allow 1935/tcp
   ```
3. Sprawdź logi kontenera:
   ```bash
   docker logs wyniki-rtmp
   ```

### Stream się tnie/buforuje
1. Zmniejsz bitrate w OBS (np. z 6000 do 4000)
2. Zmniejsz rozdzielczość (1080p → 720p)
3. Zmniejsz FPS (60 → 30)
4. Użyj szybszego presetu: `ultrafast` zamiast `veryfast`

### CPU na MiniPC za wysoki
1. W OBS użyj GPU encodera (NVENC/QSV zamiast x264)
2. Zmniejsz bitrate/rozdzielczość na źródle (OBS)
3. Zwiększ `hls_fragment` w nginx-rtmp.conf (z 2s na 3s lub 4s)

### Opóźnienie (latency) za duże
1. Zmniejsz `hls_fragment` w nginx-rtmp.conf (z 2s na 1s)
2. Zmniejsz `hls_playlist_length` (z 10s na 6s)
3. W OBS ustaw: Keyframe Interval = 1, Tune = zerolatency

## Monitoring wydajności

```bash
# CPU/RAM usage
docker stats wyniki-rtmp

# Logi na żywo
docker logs -f wyniki-rtmp

# RTMP stats
curl http://100.110.194.46:8088/stat
```

## Wbudowanie w stronę wyników

Możesz dodać stream do strony z wynikami jako iframe:

```html
<iframe 
  src="https://score.vestmedia.pl/stream1" 
  width="100%" 
  height="500px" 
  frameborder="0" 
  allowfullscreen>
</iframe>
```

Lub bezpośrednio HLS player:

```html
<video id="player" controls autoplay>
  <source src="https://score.vestmedia.pl/hls/stream1/index.m3u8" type="application/x-mpegURL">
</video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  if (Hls.isSupported()) {
    const video = document.getElementById('player');
    const hls = new Hls();
    hls.loadSource('https://score.vestmedia.pl/hls/stream1/index.m3u8');
    hls.attachMedia(video);
  }
</script>
```

## Bezpieczeństwo

Jeśli chcesz ograniczyć dostęp do streamów:

1. **Basic Auth** dla HLS:
   ```nginx
   location /hls {
       auth_basic "Restricted";
       auth_basic_user_file /etc/nginx/.htpasswd;
       # ... reszta configu
   }
   ```

2. **IP Whitelist** dla RTMP:
   ```nginx
   application stream1 {
       allow publish 192.168.1.0/24;  # Tylko lokalna sieć może pushować
       deny publish all;
       # ... reszta
   }
   ```

3. **Token Authentication** (zaawansowane) - wymagałoby custom Lua script w nginx.
