#!/bin/bash
MOUNT_POINT="/mnt/dysk12tb"

if ! mountpoint -q "$MOUNT_POINT"; then
    logger -p user.warning "ALERT: Dysk 12TB nie jest zamontowany na $MOUNT_POINT"
    echo "[ALERT] $(date): Dysk 12TB NIE ZAMONTOWANY" >> /var/log/disk-alerts.log
fi
