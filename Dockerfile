FROM node:20-slim

# System dependencies for native modules
RUN apt-get update \
    && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

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

EXPOSE 3000
EXPOSE 9000
CMD ["node", "start.js"]
