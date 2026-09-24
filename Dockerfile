FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh \
  && arduino-cli config init --overwrite \
  && arduino-cli core update-index \
  && arduino-cli core install arduino:avr \
  && arduino-cli lib update-index
WORKDIR /app
COPY libs.txt ./
RUN grep -v '^#' libs.txt | grep -v '^[[:space:]]*$' | while IFS= read -r l; do arduino-cli lib install "$l" || echo "AVISO: nao instalou $l"; done; true
COPY server.js index.html ./
ENV NODE_ENV=production
CMD ["node", "server.js"]
