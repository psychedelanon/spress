FROM node:20-alpine

# sys deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy root package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy webapp package files and the full webapp source, then install webapp dependencies
COPY webapp/package*.json ./webapp/
COPY webapp/ ./webapp/
RUN cd webapp && npm ci

# Copy the rest of the project (excluding webapp, already copied)
COPY . .

# Build the project
RUN npm run build

EXPOSE 9000
CMD ["node", "dist/server.js"]
