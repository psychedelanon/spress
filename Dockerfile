FROM node:20-alpine

# sys deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build
EXPOSE 9000
CMD ["sh", "-c", "npm run migrate && node dist/server.js"]
