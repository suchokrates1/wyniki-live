#!/usr/bin/env python3
"""
Traefik Dynamic Discovery Script

Scans Docker containers on minipc for traefik labels and generates
dynamic configuration for Traefik on RPI. Only uploads when config changes.
"""
import docker
import yaml
import os
import paramiko
import hashlib
import shutil

# --- KONFIGURACJA ---
RPI_USER = "suchokrates1"
RPI_IP = "192.168.31.167"
RPI_DYNAMIC_DIR = "/home/suchokrates1/traefik/data/dynamic"
TMPFILE = "/tmp/minipc_dynamic.yml"
OLDFILE = "/tmp/minipc_dynamic.yml.old"
MINIPC_IP = os.popen("hostname -I").read().split()[0]


def file_hash(filepath):
    """Calculate MD5 hash of file content."""
    if not os.path.exists(filepath):
        return None
    with open(filepath, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def main():
    client = docker.from_env()
    services = {}
    routers = {}

    for container in client.containers.list():
        labels = container.labels
        if labels.get("traefik.enable") != "true":
            continue

        for key, value in labels.items():
            if key.startswith("traefik.http.routers.") and key.endswith(".rule"):
                router_name = key.split(".")[3]
                routers[router_name] = {
                    "rule": value,
                    "service": labels.get(f"traefik.http.routers.{router_name}.service", router_name)
                }

                service_name = routers[router_name]["service"]

                # Pobieranie portu hosta z kontenera
                ports = container.attrs["NetworkSettings"]["Ports"]
                container_port = labels.get(
                    f"traefik.http.services.{service_name}.loadbalancer.server.port", "80"
                )
                host_port_info = ports.get(f"{container_port}/tcp")

                if not host_port_info:
                    print(f"⚠️  Nie znaleziono mapowania portu {container_port} dla {service_name}")
                    continue

                host_port = host_port_info[0]["HostPort"]
                scheme = labels.get(
                    f"traefik.http.services.{service_name}.loadbalancer.server.scheme", "http"
                )

                services[service_name] = [{
                    "url": f"{scheme}://{MINIPC_IP}:{host_port}"
                }]

    data = {
        "http": {
            "routers": {},
            "services": {}
        }
    }

    for router, opts in routers.items():
        data["http"]["routers"][router] = {
            "rule": opts["rule"],
            "service": opts["service"],
            "entryPoints": ["https"],
            "tls": {"certResolver": "cloudflare"},
            "middlewares": ["secure-headers"]
        }

    for service, servers in services.items():
        data["http"]["services"][service] = {
            "loadBalancer": {
                "servers": servers
            }
        }

    # Dodajemy middleware
    data["http"]["middlewares"] = {
        "secure-headers": {
            "headers": {
                "sslRedirect": False,
                "sslProxyHeaders": {
                    "X-Forwarded-Proto": "https"
                },
                "customResponseHeaders": {
                    "X-Forwarded-Proto": "https"
                }
            }
        }
    }

    # Zapis do pliku YAML
    new_content = yaml.dump(data, sort_keys=False)

    # Zapisz nowy plik
    with open(TMPFILE, "w") as f:
        f.write(new_content)

    new_hash = file_hash(TMPFILE)
    old_hash = file_hash(OLDFILE)

    if new_hash == old_hash:
        print("ℹ️  Brak zmian w konfiguracji - pomijam wysyłkę")
        return

    print(f"✅ Plik dynamic Traefika zapisany: {TMPFILE}")

    # --- Wyślij przez SCP ---
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(RPI_IP, username=RPI_USER)
    sftp = ssh.open_sftp()
    sftp.put(TMPFILE, os.path.join(RPI_DYNAMIC_DIR, "minipc_dynamic.yml"))
    sftp.close()
    ssh.close()
    print("✅ Plik wysłany na RPi!")

    # Zapisz jako old do porównania
    shutil.copy(TMPFILE, OLDFILE)
    print("✅ Zapisano jako referencję do porównania")


if __name__ == "__main__":
    main()
