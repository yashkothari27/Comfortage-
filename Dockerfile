FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY artifacts/ ./artifacts/
COPY src/ ./src/

RUN mkdir -p logs

EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
