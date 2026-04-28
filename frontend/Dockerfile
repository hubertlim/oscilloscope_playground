FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Vite builds to /app/dist by default, which is our volume mount
CMD ["npx", "vite", "build", "--outDir", "/app/dist"]
