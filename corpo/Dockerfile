# O corpo do outro: um Debian mínimo, sem root, com cron para os órgãos que ele escrever.
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-venv curl ca-certificates git cron procps jq less file bc \
 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash outro && mkdir -p /home/outro/obras && chown -R outro:outro /home/outro
WORKDIR /home/outro
# cron em primeiro plano mantém o corpo vivo e roda os crontabs do usuário outro
CMD ["cron", "-f"]
